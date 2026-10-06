import { MSG, STATUS, TARGET, UPLOAD_MESSAGE, UPLOAD_STATUS, parseMeetUrl } from '../common/constants.js';
import { elapsedMs, isActive, readAuthToken, readSettings, readState, resetState, writeState } from '../common/state.js';

const OFFSCREEN_PATH = 'src/offscreen/offscreen.html';
const DOWNLOAD_CLEANUP_TIMEOUT_MS = 120000;

/** Serialises start/pause/resume/stop so overlapping popup clicks cannot interleave. */
let queue = Promise.resolve();
/** @type {Promise<void> | null} */
let offscreenCreating = null;

/**
 * @template T
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
function enqueue(task) {
  const run = queue.then(task, task);
  queue = run.then(() => undefined, () => undefined);
  return run;
}

/* ------------------------------------------------------------------ */
/* Offscreen document                                                  */
/* ------------------------------------------------------------------ */

async function hasOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  return contexts.length > 0;
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  if (offscreenCreating) {
    await offscreenCreating;
    return;
  }
  offscreenCreating = chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ['USER_MEDIA'],
    justification: 'Capture Google Meet tab audio and the microphone, mix them, and encode the result with MediaRecorder.'
  });
  try {
    await offscreenCreating;
  } finally {
    offscreenCreating = null;
  }
}

async function closeOffscreenDocument() {
  try {
    if (await hasOffscreenDocument()) await chrome.offscreen.closeDocument();
  } catch {
    // Already gone.
  }
}

/**
 * @param {object} message
 * @returns {Promise<any>}
 */
async function sendToOffscreen(message) {
  const response = await chrome.runtime.sendMessage({ ...message, target: TARGET.OFFSCREEN });
  if (!response) throw new Error('The recorder did not respond.');
  if (!response.ok) throw new Error(response.error || 'The recorder reported an unknown error.');
  return response;
}

/* ------------------------------------------------------------------ */
/* UI feedback                                                         */
/* ------------------------------------------------------------------ */

async function broadcastState(state) {
  const text = state.status === STATUS.RECORDING ? 'REC' : state.status === STATUS.PAUSED ? 'II' : '';
  try {
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color: state.status === STATUS.PAUSED ? '#b45309' : '#d93025' });
  } catch {
    // Action API unavailable (e.g. during shutdown).
  }
  chrome.runtime.sendMessage({ type: MSG.STATE_CHANGED, target: TARGET.BACKGROUND, state }).catch(() => {});
}

async function updateState(patch) {
  const state = await writeState(patch);
  await broadcastState(state);
  return state;
}

async function failWith(message) {
  await closeOffscreenDocument();
  const state = await resetState({ lastError: message });
  await broadcastState(state);
  return state;
}

/* ------------------------------------------------------------------ */
/* Recording control                                                   */
/* ------------------------------------------------------------------ */

async function startRecording(requestedTabId) {
  const current = await readState();
  if (isActive(current.status) || current.status === STATUS.STARTING) {
    throw new Error('A recording is already in progress.');
  }

  const tab = requestedTabId
    ? await chrome.tabs.get(requestedTabId)
    : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];

  if (!tab || tab.id === undefined) throw new Error('No active tab was found.');

  const { isMeet, meetingCode } = parseMeetUrl(tab.url);
  if (!isMeet) throw new Error('Open a Google Meet tab before recording.');

  await updateState({
    status: STATUS.STARTING,
    tabId: tab.id,
    meetingCode,
    startedAt: null,
    accumulatedMs: 0,
    lastError: null,
    upload: null
  });

  try {
    const settings = await readSettings();
    await ensureOffscreenDocument();

    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
    await sendToOffscreen({
      type: MSG.OFFSCREEN_START,
      streamId,
      audioBitsPerSecond: settings.audioBitsPerSecond,
      keepTabAudible: settings.keepTabAudible
    });

    return await updateState({ status: STATUS.RECORDING, startedAt: Date.now(), accumulatedMs: 0 });
  } catch (error) {
    await failWith(describeError(error));
    throw error;
  }
}

async function pauseRecording() {
  const state = await readState();
  if (state.status !== STATUS.RECORDING) throw new Error('Nothing is being recorded.');
  await sendToOffscreen({ type: MSG.OFFSCREEN_PAUSE });
  return updateState({
    status: STATUS.PAUSED,
    accumulatedMs: elapsedMs(state),
    startedAt: null
  });
}

async function resumeRecording() {
  const state = await readState();
  if (state.status !== STATUS.PAUSED) throw new Error('The recording is not paused.');
  await sendToOffscreen({ type: MSG.OFFSCREEN_RESUME });
  return updateState({ status: STATUS.RECORDING, startedAt: Date.now() });
}

async function stopRecording(reason) {
  const state = await readState();
  if (!isActive(state.status) && state.status !== STATUS.STARTING) {
    throw new Error('Nothing is being recorded.');
  }

  const durationMs = elapsedMs(state);
  await updateState({ status: STATUS.STOPPING, accumulatedMs: durationMs, startedAt: null, upload: null });

  let result;
  try {
    result = await sendToOffscreen({ type: MSG.OFFSCREEN_STOP });
  } catch (error) {
    return failWith(describeError(error));
  }

  if (!result.url || !result.bytes) {
    return failWith('The recording was empty, so nothing was saved.');
  }

  const settings = await readSettings();
  const filename = buildFilename(settings.filenamePrefix, state.meetingCode);
  const upload = await uploadStoppedRecording(await resolveMeetingCode(state), durationMs);

  let downloadId = null;
  let downloadError = null;
  try {
    downloadId = await chrome.downloads.download({ url: result.url, filename, saveAs: false });
  } catch (error) {
    downloadError = describeError(error);
  }

  cleanupAfterDownload(downloadId, result.url);

  return resetState({
    lastError: downloadError || (reason === 'tab-closed' ? 'The Meet tab closed, so the recording was saved.' : null),
    lastRecording: downloadError
      ? null
      : { filename, bytes: result.bytes, durationMs, at: Date.now() },
    upload
  }).then(async (next) => {
    await broadcastState(next);
    return next;
  });
}

/**
 * Keeps the offscreen document (and therefore the blob URL) alive until Chrome
 * has finished writing the file to disk.
 * @param {number | null} downloadId
 * @param {string} url
 */
function cleanupAfterDownload(downloadId, url) {
  let finished = false;
  const finish = async () => {
    if (finished) return;
    finished = true;
    try {
      await sendToOffscreen({ type: MSG.OFFSCREEN_REVOKE, url });
    } catch {
      // Offscreen document already closed.
    }
    await closeOffscreenDocument();
  };

  if (downloadId === null) {
    void finish();
    return;
  }

  const listener = (delta) => {
    if (delta.id !== downloadId || !delta.state) return;
    if (delta.state.current === 'complete' || delta.state.current === 'interrupted') {
      chrome.downloads.onChanged.removeListener(listener);
      void finish();
    }
  };
  chrome.downloads.onChanged.addListener(listener);
  setTimeout(() => {
    chrome.downloads.onChanged.removeListener(listener);
    void finish();
  }, DOWNLOAD_CLEANUP_TIMEOUT_MS);
}

/**
 * Reuses the meeting code captured when recording started, then the live tab URL.
 * @param {import('../common/state.js').RecordingState} state
 * @returns {Promise<string | null>}
 */
async function resolveMeetingCode(state) {
  if (state.meetingCode) return state.meetingCode;
  if (state.tabId == null) return null;
  try {
    const tab = await chrome.tabs.get(state.tabId);
    return parseMeetUrl(tab.url).meetingCode;
  } catch {
    return null;
  }
}

/**
 * Upload runs before the local download. Failures are returned, never thrown,
 * so the WebM file is still saved.
 * @param {string | null} meetingCode
 * @param {number} durationMs
 * @returns {Promise<{ status: string, detail: string | null }>}
 */
function logUploadTrace(upload) {
  if (upload && Array.isArray(upload.trace)) {
    for (const line of upload.trace) console.log(line);
  }
}

async function uploadStoppedRecording(meetingCode, durationMs) {
  const token = await readAuthToken();
  if (!token) {
    console.log('[MeetNote Upload] Service worker: no token stored');
    return { status: UPLOAD_STATUS.NOT_CONNECTED, detail: null };
  }
  if (!meetingCode) {
    console.log('[MeetNote Upload] Service worker: no meeting code');
    return { status: UPLOAD_STATUS.FAILED, detail: `${UPLOAD_MESSAGE.GENERIC} No meeting code was found.` };
  }

  const durationSeconds = Math.max(0, Math.floor(durationMs / 1000));
  try {
    await updateState({ upload: { status: UPLOAD_STATUS.UPLOADING, detail: null } });
    console.log(`[MeetNote Upload] Service worker: asking offscreen document to upload (${meetingCode}, ${durationSeconds}s)`);
    const response = await sendToOffscreen({
      type: MSG.OFFSCREEN_UPLOAD,
      meetingCode,
      durationSeconds,
      token
    });
    const upload = response.upload;
    logUploadTrace(upload);
    if (!upload) {
      console.log('[MeetNote Upload] Service worker: offscreen returned no upload result');
      return { status: UPLOAD_STATUS.FAILED, detail: `${UPLOAD_MESSAGE.GENERIC} Offscreen document returned no upload result.` };
    }
    console.log(`[MeetNote Upload] Service worker result: ${upload.status}${upload.detail ? ` — ${upload.detail}` : ''}`);
    return { status: upload.status, detail: upload.detail ?? null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[MeetNote Upload] Service worker error: ${message}`);
    return { status: UPLOAD_STATUS.FAILED, detail: `${UPLOAD_MESSAGE.GENERIC} ${message}` };
  }
}

/**
 * @param {string} prefix
 * @param {string | null} meetingCode
 */
function buildFilename(prefix, meetingCode) {
  const safePrefix = (prefix || 'meetnote').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'meetnote';
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const code = meetingCode ? `-${meetingCode}` : '';
  return `meetnote/${safePrefix}${code}-${stamp}.webm`;
}

function describeError(error) {
  const raw = error instanceof Error ? error.message : String(error || 'Unknown error');
  if (/not been invoked|activeTab|extension has not been invoked/i.test(raw)) {
    return 'Chrome blocked tab capture. Open the Meet tab, click the MeetNote icon, then press Record.';
  }
  if (/Permission denied|NotAllowedError/i.test(raw)) {
    return 'Tab audio capture was denied by Chrome.';
  }
  return raw;
}

/* ------------------------------------------------------------------ */
/* Message routing                                                     */
/* ------------------------------------------------------------------ */

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.target === TARGET.OFFSCREEN) return undefined;

  const handlers = {
    [MSG.GET_STATE]: () => readState(),
    [MSG.START]: () => enqueue(() => startRecording(message.tabId)),
    [MSG.PAUSE]: () => enqueue(() => pauseRecording()),
    [MSG.RESUME]: () => enqueue(() => resumeRecording()),
    [MSG.STOP]: () => enqueue(() => stopRecording('user')),
    [MSG.CLEAR_ERROR]: () => updateState({ lastError: null }),
    [MSG.CAPTURE_ENDED]: () => enqueue(() => stopRecording('capture-ended')),
    [MSG.CAPTURE_ERROR]: () => enqueue(() => failWith(describeError(message.error)))
  };

  const handler = handlers[message.type];
  if (!handler) return undefined;

  Promise.resolve()
    .then(handler)
    .then((state) => sendResponse({ ok: true, state }))
    .catch(async (error) => {
      const text = describeError(error);
      const state = await updateState({ lastError: text });
      sendResponse({ ok: false, error: text, state });
    });
  return true;
});

/* ------------------------------------------------------------------ */
/* Lifecycle guards                                                    */
/* ------------------------------------------------------------------ */

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const state = await readState();
  if (state.tabId === tabId && isActive(state.status)) {
    enqueue(() => stopRecording('tab-closed')).catch(() => {});
  }
});

async function recoverFromRestart() {
  const state = await readState();
  if (state.status === STATUS.IDLE) return;
  // The offscreen document does not survive a browser or extension restart,
  // so any in-flight recording is gone with it.
  await closeOffscreenDocument();
  await resetState({ lastError: 'The previous recording stopped when Chrome restarted.' });
  await broadcastState(await readState());
}

chrome.runtime.onStartup.addListener(() => void recoverFromRestart());
chrome.runtime.onInstalled.addListener(() => void recoverFromRestart());
