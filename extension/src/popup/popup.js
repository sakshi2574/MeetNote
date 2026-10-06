import { MSG, STATUS, STORAGE_KEYS, TARGET, UPLOAD_MESSAGE, UPLOAD_STATUS, parseMeetUrl } from '../common/constants.js';
import {
  clearAuthToken,
  elapsedMs,
  formatBytes,
  formatDuration,
  hasAuthToken,
  isActive,
  readSettings,
  readState,
  writeAuthToken,
  writeSettings
} from '../common/state.js';

const el = {
  pill: document.getElementById('status-pill'),
  detection: document.getElementById('detection-text'),
  detectionSub: document.getElementById('detection-sub'),
  timer: document.getElementById('timer'),
  timerLabel: document.getElementById('timer-label'),
  start: document.getElementById('btn-start'),
  pause: document.getElementById('btn-pause'),
  resume: document.getElementById('btn-resume'),
  stop: document.getElementById('btn-stop'),
  error: document.getElementById('error'),
  success: document.getElementById('success'),
  upload: document.getElementById('upload'),
  connectStatus: document.getElementById('connect-status'),
  token: document.getElementById('auth-token'),
  connect: document.getElementById('btn-connect'),
  clearToken: document.getElementById('btn-clear-token'),
  authError: document.getElementById('auth-error'),
  prefix: document.getElementById('setting-prefix'),
  bitrate: document.getElementById('setting-bitrate'),
  audible: document.getElementById('setting-audible')
};

const STATUS_LABEL = {
  [STATUS.IDLE]: 'Idle',
  [STATUS.STARTING]: 'Starting',
  [STATUS.RECORDING]: 'Recording',
  [STATUS.PAUSED]: 'Paused',
  [STATUS.STOPPING]: 'Saving'
};

/** @type {{ tabId: number | null, isMeet: boolean, inCall: boolean, meetingCode: string | null }} */
let detection = { tabId: null, isMeet: false, inCall: false, meetingCode: null };
/** @type {import('../common/state.js').RecordingState | null} */
let state = null;
let busy = false;
let ticker = null;

/* ------------------------------------------------------------------ */
/* Messaging                                                           */
/* ------------------------------------------------------------------ */

async function send(type, extra = {}) {
  const response = await chrome.runtime.sendMessage({ type, target: TARGET.BACKGROUND, ...extra });
  if (!response) throw new Error('MeetNote background worker is not responding.');
  if (response.state) state = response.state;
  if (!response.ok) throw new Error(response.error || 'Unknown error.');
  return response;
}

async function detectMeetTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id === undefined) return;

  const { isMeet, meetingCode } = parseMeetUrl(tab.url);
  detection = { tabId: tab.id, isMeet, inCall: false, meetingCode };
  if (!isMeet) return;

  try {
    const status = await chrome.tabs.sendMessage(tab.id, { type: MSG.MEET_STATUS });
    if (status && status.ok) {
      detection.inCall = Boolean(status.inCall);
      detection.meetingCode = status.meetingCode || meetingCode;
    }
  } catch {
    // Content script not injected yet (e.g. the tab loaded before install).
  }
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

function renderDetection() {
  if (!state) return;
  const recordingElsewhere = isActive(state.status) && state.tabId !== detection.tabId;

  if (recordingElsewhere) {
    el.detection.textContent = 'Recording another Meet tab';
    el.detectionSub.textContent = state.meetingCode ? `Meeting ${state.meetingCode}` : '';
    return;
  }
  if (!detection.isMeet) {
    el.detection.textContent = 'No Google Meet tab';
    el.detectionSub.textContent = 'Open meet.google.com in the active tab.';
    return;
  }
  el.detection.textContent = detection.inCall ? 'Google Meet call detected' : 'Google Meet tab detected';
  el.detectionSub.textContent = detection.meetingCode
    ? `Meeting ${detection.meetingCode}`
    : detection.inCall
      ? ''
      : 'Waiting for you to join a call.';
}

function renderTimer() {
  if (!state) return;
  el.timer.textContent = formatDuration(elapsedMs(state));
  el.timerLabel.textContent =
    state.status === STATUS.RECORDING
      ? 'Recording tab and microphone'
      : state.status === STATUS.PAUSED
        ? 'Paused'
        : state.status === STATUS.STOPPING
          ? 'Saving file'
          : state.status === STATUS.STARTING
            ? 'Starting capture'
            : 'Not recording';
}

function renderControls() {
  if (!state) return;
  const canStart = detection.isMeet && state.status === STATUS.IDLE;
  const transitioning = state.status === STATUS.STARTING || state.status === STATUS.STOPPING;

  el.start.hidden = isActive(state.status);
  el.pause.hidden = state.status !== STATUS.RECORDING;
  el.resume.hidden = state.status !== STATUS.PAUSED;
  el.stop.hidden = !isActive(state.status) && !transitioning;

  el.start.disabled = busy || transitioning || !canStart;
  el.pause.disabled = busy;
  el.resume.disabled = busy;
  el.stop.disabled = busy || transitioning;
}

function renderMessages() {
  if (!state) return;
  el.error.hidden = !state.lastError;
  el.error.textContent = state.lastError || '';

  const saved = state.lastRecording;
  const showSaved = Boolean(saved) && state.status === STATUS.IDLE && !state.lastError;
  el.success.hidden = !showSaved;
  if (showSaved && saved) {
    const name = saved.filename.split('/').pop();
    el.success.textContent = `Saved ${name} (${formatDuration(saved.durationMs)}, ${formatBytes(saved.bytes)})`;
  }
  renderUpload();
}

function uploadText(upload) {
  if (upload.status === UPLOAD_STATUS.FAILED) return upload.detail || UPLOAD_MESSAGE.FAILED;
  if (upload.status === UPLOAD_STATUS.UPLOADING) return UPLOAD_MESSAGE.UPLOADING;
  if (upload.status === UPLOAD_STATUS.UPLOADED) return UPLOAD_MESSAGE.UPLOADED;
  if (upload.status === UPLOAD_STATUS.NOT_CONNECTED) return UPLOAD_MESSAGE.NOT_CONNECTED;
  return upload.detail || UPLOAD_MESSAGE.FAILED;
}

function renderUpload() {
  if (!state) return;
  const upload = state.upload;
  const show = Boolean(upload) && (state.status === STATUS.IDLE || state.status === STATUS.STOPPING);
  el.upload.hidden = !show;
  if (!show || !upload) {
    el.upload.textContent = '';
    return;
  }
  el.upload.dataset.status = upload.status;
  el.upload.textContent = uploadText(upload);
}

function render() {
  if (!state) return;
  el.pill.dataset.status = state.status;
  el.pill.textContent = STATUS_LABEL[state.status] || state.status;
  renderDetection();
  renderTimer();
  renderControls();
  renderMessages();
  syncTicker();
}

function syncTicker() {
  const shouldTick = state ? state.status === STATUS.RECORDING : false;
  if (shouldTick && ticker === null) {
    ticker = setInterval(renderTimer, 500);
  } else if (!shouldTick && ticker !== null) {
    clearInterval(ticker);
    ticker = null;
  }
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

async function run(action) {
  busy = true;
  renderControls();
  try {
    await action();
  } catch (error) {
    if (state) state.lastError = error instanceof Error ? error.message : String(error);
  } finally {
    busy = false;
    render();
  }
}

el.start.addEventListener('click', () =>
  run(async () => {
    await send(MSG.CLEAR_ERROR);
    await send(MSG.START, { tabId: detection.tabId });
  })
);
el.pause.addEventListener('click', () => run(() => send(MSG.PAUSE)));
el.resume.addEventListener('click', () => run(() => send(MSG.RESUME)));
el.stop.addEventListener('click', () => run(() => send(MSG.STOP)));

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

async function renderAuth() {
  const connected = await hasAuthToken();
  el.connectStatus.dataset.connected = connected ? 'yes' : 'no';
  el.connectStatus.textContent = connected ? 'Connected' : 'Not connected';
  el.clearToken.disabled = !connected;
}

function showAuthError(message) {
  el.authError.hidden = !message;
  el.authError.textContent = message || '';
}

async function connectAccount() {
  showAuthError('');
  try {
    await writeAuthToken(el.token.value);
    el.token.value = '';
    await renderAuth();
  } catch (error) {
    showAuthError(error instanceof Error ? error.message : 'Paste a MeetNote access token.');
  }
}

async function clearAccount() {
  showAuthError('');
  el.token.value = '';
  await clearAuthToken();
  await renderAuth();
}

el.connect.addEventListener('click', () => void connectAccount());
el.clearToken.addEventListener('click', () => void clearAccount());
el.token.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  void connectAccount();
});
el.token.addEventListener('input', () => showAuthError(''));

async function initSettings() {
  const settings = await readSettings();
  el.prefix.value = settings.filenamePrefix;
  el.bitrate.value = String(settings.audioBitsPerSecond);
  el.audible.checked = settings.keepTabAudible;

  el.prefix.addEventListener('change', () => writeSettings({ filenamePrefix: el.prefix.value.trim() || 'meetnote' }));
  el.bitrate.addEventListener('change', () => writeSettings({ audioBitsPerSecond: Number(el.bitrate.value) }));
  el.audible.addEventListener('change', () => writeSettings({ keepTabAudible: el.audible.checked }));
}

/* ------------------------------------------------------------------ */
/* Bootstrap                                                           */
/* ------------------------------------------------------------------ */

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === MSG.STATE_CHANGED && message.state) {
    state = message.state;
    render();
  }
  return undefined;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEYS.AUTH_TOKEN]) void renderAuth();
});

window.addEventListener('unload', () => {
  if (ticker !== null) clearInterval(ticker);
});

(async function init() {
  state = await readState();
  await Promise.all([detectMeetTab(), initSettings(), renderAuth()]);
  render();
  // Re-sync with the worker in case storage was stale.
  try {
    await send(MSG.GET_STATE);
  } catch {
    // Worker will spin up on the next action.
  }
  render();
})();
