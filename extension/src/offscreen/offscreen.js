import { MSG, TARGET } from '../common/constants.js';

const PREFERRED_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm'];
const TIMESLICE_MS = 1000;

/** @type {MediaStream | null} */
let stream = null;
/** @type {MediaRecorder | null} */
let recorder = null;
/** @type {AudioContext | null} */
let audioContext = null;
/** @type {Blob[]} */
let chunks = [];
/** @type {string | null} */
let mimeType = null;
let stopping = false;

function pickMimeType() {
  const supported = PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
  if (!supported) throw new Error('This Chrome build cannot record WebM/Opus audio.');
  return supported;
}

function notifyBackground(type, payload = {}) {
  chrome.runtime.sendMessage({ type, target: TARGET.BACKGROUND, ...payload }).catch(() => {});
}

function teardown() {
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
  if (stream) {
    for (const track of stream.getTracks()) track.stop();
    stream = null;
  }
  recorder = null;
}

/**
 * @param {string} streamId
 * @param {number} audioBitsPerSecond
 * @param {boolean} keepTabAudible
 */
async function start(streamId, audioBitsPerSecond, keepTabAudible) {
  if (recorder) throw new Error('A recording is already in progress.');

  chunks = [];
  stopping = false;
  mimeType = pickMimeType();

  stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    },
    video: false
  });

  const [track] = stream.getAudioTracks();
  if (!track) {
    teardown();
    throw new Error('The Meet tab produced no audio track.');
  }

  // tabCapture swallows the tab's audio; pipe it back so the user keeps hearing the call.
  if (keepTabAudible) {
    audioContext = new AudioContext();
    audioContext.createMediaStreamSource(stream).connect(audioContext.destination);
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
  return { url: URL.createObjectURL(blob), bytes: blob.size, mimeType };
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
