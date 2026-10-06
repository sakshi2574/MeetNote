import { uploadRecording } from '../common/api.js';
import { MSG, TARGET, UPLOAD_MESSAGE, UPLOAD_STATUS } from '../common/constants.js';

const PREFERRED_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm'];
const TIMESLICE_MS = 1000;

/** @type {MediaStream | null} */
let stream = null;
/** @type {MediaStream | null} */
let tabStream = null;
/** @type {MediaStream | null} */
let micStream = null;
/** @type {MediaRecorder | null} */
let recorder = null;
/** @type {AudioContext | null} */
let audioContext = null;
/** @type {Blob[]} */
let chunks = [];
/** @type {string | null} */
let mimeType = null;
/** @type {Blob | null} In-memory recording kept for upload. Never replaced with a blob URL. */
let pendingBlob = null;
let stopping = false;

function pickMimeType() {
  const supported = PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
  if (!supported) throw new Error('This Chrome build cannot record WebM/Opus audio.');
  return supported;
}

function notifyBackground(type, payload = {}) {
  chrome.runtime.sendMessage({ type, target: TARGET.BACKGROUND, ...payload }).catch(() => {});
}

function stopTracks(mediaStream) {
  if (!mediaStream) return;
  for (const track of mediaStream.getTracks()) track.stop();
}

function teardown() {
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
  stopTracks(stream);
  stopTracks(tabStream);
  stopTracks(micStream);
  stream = null;
  tabStream = null;
  micStream = null;
  recorder = null;
}

function microphoneErrorMessage(error) {
  const name = error && typeof error === 'object' ? error.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return 'Microphone access was denied. Allow the microphone for MeetNote, then try recording again.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return 'No microphone was found. Connect a microphone, then try recording again.';
  }
  return 'The microphone could not be captured.';
}

/**
 * @param {string} streamId
 * @param {number} audioBitsPerSecond
 * @param {boolean} keepTabAudible
 */
async function start(streamId, audioBitsPerSecond, keepTabAudible) {
  if (recorder) throw new Error('A recording is already in progress.');

  chunks = [];
  pendingBlob = null;
  stopping = false;
  mimeType = pickMimeType();

  tabStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    },
    video: false
  });
  stream = tabStream;

  const [track] = tabStream.getAudioTracks();
  if (!track) {
    teardown();
    throw new Error('The Meet tab produced no audio track.');
  }

  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    teardown();
    throw new Error(microphoneErrorMessage(error));
  }
  if (micStream.getAudioTracks().length === 0) {
    teardown();
    throw new Error('No microphone audio track was available.');
  }

  try {
    audioContext = new AudioContext();
    if (audioContext.state === 'suspended') await audioContext.resume();

    const mixed = audioContext.createMediaStreamDestination();
    const tabSource = audioContext.createMediaStreamSource(tabStream);
    const micSource = audioContext.createMediaStreamSource(micStream);
    tabSource.connect(mixed);
    micSource.connect(mixed);
    // tabCapture mutes the tab. Play only the Meet audio back so the call stays audible
    // and the microphone is not sent to the speakers.
    if (keepTabAudible) tabSource.connect(audioContext.destination);
    stream = mixed.stream;
  } catch (error) {
    teardown();
    throw error;
  }

  track.addEventListener('ended', () => {
    if (!stopping) notifyBackground(MSG.CAPTURE_ENDED);
  });

  recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond });
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  });
  recorder.addEventListener('error', (event) => {
    const error = /** @type {any} */ (event).error;
    notifyBackground(MSG.CAPTURE_ERROR, { error: error ? error.message : 'MediaRecorder failed.' });
  });
  recorder.start(TIMESLICE_MS);
}

function pause() {
  if (!recorder || recorder.state !== 'recording') throw new Error('Nothing is being recorded.');
  recorder.pause();
}

function resume() {
  if (!recorder || recorder.state !== 'paused') throw new Error('The recording is not paused.');
  recorder.resume();
}

async function stop() {
  if (!recorder) throw new Error('Nothing is being recorded.');
  stopping = true;
  pendingBlob = null;
  const active = recorder;

  await new Promise((resolve) => {
    if (active.state === 'inactive') {
      resolve();
      return;
    }
    active.addEventListener('stop', () => resolve(), { once: true });
    active.stop();
  });

  teardown();

  const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
  chunks = [];
  if (blob.size === 0) return { url: null, bytes: 0, mimeType };
  pendingBlob = blob;
  return { url: URL.createObjectURL(blob), bytes: blob.size, mimeType };
}

/**
 * Uploads the in-memory Blob. The object URL used for the local download is not sent.
 * @param {string} meetingCode
 * @param {number} durationSeconds
 * @param {string | null} token
 * @returns {Promise<{ upload: { status: string, detail: string | null } }>}
 */
async function uploadPending(meetingCode, durationSeconds, token) {
  const blob = pendingBlob;
  if (!blob) {
    console.log('[MeetNote Upload] Offscreen: no recording blob available');
    return {
      upload: {
        status: UPLOAD_STATUS.FAILED,
        detail: `${UPLOAD_MESSAGE.GENERIC} No recording blob was available.`,
        trace: ['[MeetNote Upload] Offscreen: no recording blob available']
      }
    };
  }
  try {
    const upload = await uploadRecording({ blob, meetingCode, durationSeconds, token });
    return { upload };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[MeetNote Upload] Offscreen error: ${message}`);
    return {
      upload: {
        status: UPLOAD_STATUS.FAILED,
        detail: `${UPLOAD_MESSAGE.GENERIC} ${message}`,
        trace: [`[MeetNote Upload] Offscreen error: ${message}`]
      }
    };
  } finally {
    pendingBlob = null;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.target !== TARGET.OFFSCREEN) return undefined;

  const run = async () => {
    switch (message.type) {
      case MSG.OFFSCREEN_START:
        await start(message.streamId, message.audioBitsPerSecond, message.keepTabAudible !== false);
        return {};
      case MSG.OFFSCREEN_PAUSE:
        pause();
        return {};
      case MSG.OFFSCREEN_RESUME:
        resume();
        return {};
      case MSG.OFFSCREEN_STOP:
        return stop();
      case MSG.OFFSCREEN_UPLOAD:
        return uploadPending(message.meetingCode, message.durationSeconds, message.token);
      case MSG.OFFSCREEN_REVOKE:
        if (message.url) URL.revokeObjectURL(message.url);
        return {};
      default:
        throw new Error(`Unknown recorder command: ${message.type}`);
    }
  };

  run()
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
});
