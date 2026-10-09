import { uploadRecording } from '../common/api.js';
import { MSG, TARGET, UPLOAD_MESSAGE, UPLOAD_STATUS } from '../common/constants.js';

const PREFERRED_MIME_TYPES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm'
];
const TIMESLICE_MS = 1000;
const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;
const CANVAS_FRAME_RATE = 30;
// Offscreen documents are hidden, so requestAnimationFrame is not delivered.
const DRAW_INTERVAL_MS = 1000 / CANVAS_FRAME_RATE;

/** @type {MediaStream | null} */
let stream = null;
/** @type {MediaStream | null} */
let tabStream = null;
/** @type {MediaStream | null} */
let micStream = null;
/** @type {MediaStream | null} */
let displayStream = null;
/** @type {MediaStream | null} */
let canvasStream = null;
/** @type {MediaRecorder | null} */
let recorder = null;
/** @type {AudioContext | null} */
let audioContext = null;
/** @type {GainNode | null} Microphone contribution. The capture stays open; gain follows Meet's mute button. */
let micGain = null;
/**
 * Explicit Meet mic command. Null means the detector has not reported yet, so the
 * mic stays silent. A report that arrives before the gain node exists is kept and
 * applied as soon as the graph is built.
 * @type {boolean | null}
 */
let explicitMic = null;
/** @type {HTMLCanvasElement | null} */
let canvas = null;
/** @type {CanvasRenderingContext2D | null} */
let canvasCtx = null;
/** @type {HTMLVideoElement | null} */
let meetVideo = null;
/** @type {HTMLVideoElement | null} */
let displayVideo = null;
/** @type {Blob[]} */
let chunks = [];
/** @type {string | null} */
let mimeType = null;
/** @type {Blob | null} In-memory recording kept for upload. Never replaced with a blob URL. */
let pendingBlob = null;
let stopping = false;
let drawing = false;
/** Invalidates a display picker that is still open when presenting stops. */
let presentRequest = 0;
/** @type {'meet' | 'display'} The one video the canvas is allowed to draw. */
let visualSource = 'meet';
/** @type {number} Timeout id for the canvas draw loop. */
let drawFrame = 0;

function pickMimeType() {
  const supported = PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
  if (!supported) throw new Error('This Chrome build cannot record WebM video.');
  return supported;
}

function notifyBackground(type, payload = {}) {
  chrome.runtime.sendMessage({ type, target: TARGET.BACKGROUND, ...payload }).catch(() => {});
}

function stopTracks(mediaStream) {
  if (!mediaStream) return;
  for (const track of mediaStream.getTracks()) track.stop();
}

function discardVideo(video) {
  if (!video) return;
  video.pause();
  video.srcObject = null;
  video.remove();
}

function stopDrawing() {
  drawing = false;
  if (drawFrame) {
    clearTimeout(drawFrame);
    drawFrame = 0;
  }
}

function applyMicGain() {
  if (!micGain || !audioContext) return;
  const open = explicitMic === true;
  const value = open ? 1 : 0;
  const now = audioContext.currentTime;
  micGain.gain.cancelScheduledValues(now);
  micGain.gain.setValueAtTime(value, now);
  micGain.gain.value = value;
  console.log(`[Offscreen] MIC STATE = ${open ? 'ON' : 'OFF'}`);
  console.log(`[Offscreen] MIC GAIN = ${value}`);
}

function setMicEnabled(enabled) {
  explicitMic = enabled === true;
  applyMicGain();
}

function adoptInitialMic(micEnabled) {
  if (explicitMic !== null || typeof micEnabled !== 'boolean') return;
  explicitMic = micEnabled;
}

function stopPresentationTracks() {
  const media = displayStream;
  const video = displayVideo;
  displayStream = null;
  displayVideo = null;
  discardVideo(video);
  stopTracks(media);
}

function teardown() {
  stopping = true;
  presentRequest += 1;
  visualSource = 'meet';
  stopDrawing();
  stopPresentationTracks();
  discardVideo(meetVideo);
  meetVideo = null;
  micGain = null;
  explicitMic = null;
  if (canvasStream) {
    stopTracks(canvasStream);
    canvasStream = null;
  }
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
  canvas = null;
  canvasCtx = null;
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

function presentationErrorMessage(error) {
  const name = error && typeof error === 'object' ? error.name : '';
  const message = error instanceof Error ? error.message : String(error || 'Presentation capture failed.');
  if (name === 'NotAllowedError' || name === 'AbortError') {
    return `Presentation capture was cancelled or denied (${name}: ${message}).`;
  }
  return `Presentation capture failed (${name || 'Error'}: ${message}).`;
}

/**
 * @param {MediaStream} mediaStream
 * @returns {Promise<HTMLVideoElement>}
 */
async function playPreview(mediaStream) {
  const video = document.createElement('video');
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.srcObject = mediaStream;
  video.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.appendChild(video);
  try {
    await video.play();
  } catch (error) {
    discardVideo(video);
    throw error;
  }
  return video;
}

/**
 * Display-capture frames are not decoded for a 1px, fully transparent video.
 * The offscreen document is never shown, so this element can use the canvas size.
 * @param {MediaStream} mediaStream
 * @returns {Promise<HTMLVideoElement>}
 */
async function playDisplayPreview(mediaStream) {
  const video = document.createElement('video');
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.srcObject = mediaStream;
  video.style.cssText = 'position:fixed;top:0;left:0;width:1280px;height:720px;opacity:1;pointer-events:none';
  document.body.appendChild(video);
  try {
    await video.play();
  } catch (error) {
    discardVideo(video);
    throw error;
  }
  const started = performance.now();
  while (performance.now() - started < 4000) {
    if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return video;
}

function ensureCanvas() {
  if (canvas && canvasCtx) return;
  canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('The recorder could not create a canvas.');
  canvasCtx = context;
  canvasCtx.fillStyle = '#000';
  canvasCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

function displayTrackLive() {
  const track = displayStream && displayStream.getVideoTracks()[0];
  return Boolean(track && track.readyState === 'live');
}

/**
 * @param {'meet' | 'display'} next
 */
function setVisualSource(next) {
  if (visualSource === next) return;
  visualSource = next;
  console.log(`[Offscreen] CANVAS SOURCE = ${next === 'display' ? 'DISPLAY' : 'MEET'}`);
}

/**
 * The canvas draws exactly one source. A live presentation stays selected even if
 * one sampled frame has not yet reported a size; the Meet tab is not drawn over it.
 * @returns {HTMLVideoElement | null}
 */
function sourceVideo() {
  if (visualSource === 'display') return displayVideo;
  if (meetVideo && meetVideo.videoWidth > 0 && meetVideo.videoHeight > 0) return meetVideo;
  return null;
}

function paintFrame() {
  if (!canvasCtx) return;
  const video = sourceVideo();
  if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) {
    if (visualSource !== 'display') {
      canvasCtx.fillStyle = '#000';
      canvasCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
    return;
  }
  const srcW = video.videoWidth;
  const srcH = video.videoHeight;
  const srcAspect = srcW / srcH;
  const dstAspect = CANVAS_WIDTH / CANVAS_HEIGHT;
  let sx = 0;
  let sy = 0;
  let sw = srcW;
  let sh = srcH;
  if (srcAspect > dstAspect) {
    sw = srcH * dstAspect;
    sx = (srcW - sw) / 2;
  } else if (srcAspect < dstAspect) {
    sh = srcW / dstAspect;
    sy = (srcH - sh) / 2;
  }
  canvasCtx.drawImage(video, sx, sy, sw, sh, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

function startDrawing() {
  if (drawing) return;
  drawing = true;
  const tick = () => {
    drawFrame = 0;
    if (!drawing) return;
    paintFrame();
    if (!drawing) return;
    drawFrame = setTimeout(tick, DRAW_INTERVAL_MS);
  };
  tick();
}

/**
 * @param {string} streamId
 * @param {number} audioBitsPerSecond
 * @param {boolean} keepTabAudible
 * @param {boolean | null} micEnabled Explicit Meet mic state. Null leaves the mic silent until a later report.
 */
async function start(streamId, audioBitsPerSecond, keepTabAudible, micEnabled) {
  if (recorder) throw new Error('A recording is already in progress.');

  chunks = [];
  pendingBlob = null;
  stopping = false;
  mimeType = pickMimeType();
  adoptInitialMic(micEnabled);

  tabStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    },
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    }
  });
  stream = tabStream;

  const [track] = tabStream.getAudioTracks();
  if (!track) {
    teardown();
    throw new Error('The Meet tab produced no audio track.');
  }

  const videoTrack = tabStream.getVideoTracks()[0];
  if (!videoTrack) {
    teardown();
    throw new Error('The Meet tab produced no video track.');
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
    micGain = audioContext.createGain();
    micGain.gain.value = 0;
    tabSource.connect(mixed);
    micSource.connect(micGain);
    micGain.connect(mixed);
    // tabCapture mutes the tab. Play only the Meet audio back so the call stays audible
    // and the microphone is not sent to the speakers.
    if (keepTabAudible) tabSource.connect(audioContext.destination);
    applyMicGain();

    const mixedAudioTrack = mixed.stream.getAudioTracks()[0];
    if (!mixedAudioTrack) throw new Error('The mixed audio track could not be created.');
    const micTrack = micStream.getAudioTracks()[0];
    console.log(`AUDIO: tab tracks = ${tabStream.getAudioTracks().length}`);
    console.log(`AUDIO: microphone tracks = ${micStream.getAudioTracks().length}`);
    console.log(`AUDIO: mic track state = ${micTrack ? micTrack.readyState : 'missing'}`);
    console.log(`AUDIO: mic gain = ${explicitMic === true ? 1 : 0}`);
    console.log(`AUDIO: mixed output tracks = ${mixed.stream.getAudioTracks().length}`);

    meetVideo = await playPreview(tabStream);
    ensureCanvas();
    const surface = canvas;
    if (!surface) throw new Error('The recorder could not create a canvas.');
    startDrawing();
    canvasStream = surface.captureStream(CANVAS_FRAME_RATE);
    const canvasVideoTrack = canvasStream.getVideoTracks()[0];
    if (!canvasVideoTrack) throw new Error('The recorder could not capture the meeting video.');

    const recordingStream = new MediaStream([canvasVideoTrack, mixedAudioTrack]);
    stream = recordingStream;
    console.log(`RECORDER: video tracks = ${recordingStream.getVideoTracks().length}`);
    console.log(`RECORDER: audio tracks = ${recordingStream.getAudioTracks().length}`);
    visualSource = 'meet';
    console.log('[Offscreen] CANVAS SOURCE = MEET');
  } catch (error) {
    teardown();
    throw error;
  }

  track.addEventListener('ended', () => {
    if (!stopping) notifyBackground(MSG.CAPTURE_ENDED);
  });

  recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond, videoBitsPerSecond: 1000000 });
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  });
  recorder.addEventListener('error', (event) => {
    const error = /** @type {any} */ (event).error;
    notifyBackground(MSG.CAPTURE_ERROR, { error: error ? error.message : 'MediaRecorder failed.' });
  });
  applyMicGain();
  recorder.start(TIMESLICE_MS);
}

function pause() {
  if (!recorder || recorder.state !== 'recording') throw new Error('Nothing is being recorded.');
  recorder.pause();
  stopDrawing();
}

function resume() {
  if (!recorder || recorder.state !== 'paused') throw new Error('The recording is not paused.');
  recorder.resume();
  startDrawing();
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

  const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
  chunks = [];
  if (blob.size === 0) return { url: null, bytes: 0, mimeType };
  pendingBlob = blob;
  return { url: URL.createObjectURL(blob), bytes: blob.size, mimeType };
}

/**
 * @param {MediaStream} media
 * @param {number} request
 */
function onPresentationEnded(media, request) {
  if (stopping || displayStream !== media || request !== presentRequest) return;
  console.log('[Offscreen] display capture ended');
  stopPresentationTracks();
  setVisualSource('meet');
  notifyBackground(MSG.PRESENTATION_ENDED);
}

async function startPresentation() {
  if (!recorder || stopping || (recorder.state !== 'recording' && recorder.state !== 'paused')) {
    return { presenting: false };
  }
  if (visualSource === 'display' && displayTrackLive()) return { presenting: true };

  console.log('[Offscreen] LOCAL_PRESENTATION_STARTED');
  console.log('[Offscreen] requesting getDisplayMedia');
  const request = ++presentRequest;
  let media;
  try {
    media = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch (error) {
    console.log('[Offscreen] display picker cancelled');
    throw new Error(presentationErrorMessage(error));
  }
  console.log('[Offscreen] display picker returned');

  if (request !== presentRequest || !recorder || stopping) {
    stopTracks(media);
    return { presenting: false };
  }

  const videoTrack = media.getVideoTracks()[0];
  if (!videoTrack) {
    stopTracks(media);
    throw new Error('The selected presentation did not produce a video track.');
  }
  const settings = typeof videoTrack.getSettings === 'function' ? videoTrack.getSettings() : {};
  console.log('[Offscreen] display track started');
  console.log('[Offscreen] DISPLAY TRACK READY');
  console.log(
    `[Offscreen] DISPLAY STREAM STARTED tracks=${media.getVideoTracks().length} readyState=${videoTrack.readyState} ${settings.width || 0}x${settings.height || 0} surface=${settings.displaySurface || 'unknown'}`
  );

  stopPresentationTracks();
  displayStream = media;
  videoTrack.addEventListener('ended', () => onPresentationEnded(media, request));
  try {
    displayVideo = await playDisplayPreview(media);
  } catch (error) {
    stopPresentationTracks();
    setVisualSource('meet');
    throw new Error('The selected presentation could not be shown in the recording.');
  }
  if (request !== presentRequest || videoTrack.readyState !== 'live' || displayStream !== media) {
    console.log('[Offscreen] display capture ended');
    stopPresentationTracks();
    setVisualSource('meet');
    return { presenting: false };
  }
  if (!displayVideo || displayVideo.videoWidth <= 0 || displayVideo.videoHeight <= 0 || displayVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    console.log(
      `[Offscreen] display video not ready readyState=${displayVideo ? displayVideo.readyState : 'none'} ${displayVideo ? displayVideo.videoWidth : 0}x${displayVideo ? displayVideo.videoHeight : 0}`
    );
    stopPresentationTracks();
    setVisualSource('meet');
    return { presenting: false };
  }
  console.log('[Offscreen] display video ready');
  console.log(`[Offscreen] DISPLAY VIDEO SIZE ${displayVideo.videoWidth}x${displayVideo.videoHeight}`);
  setVisualSource('display');
  return { presenting: true };
}

function stopPresentation() {
  console.log('[Offscreen] LOCAL_PRESENTATION_STOPPED');
  presentRequest += 1;
  const hadDisplay = visualSource === 'display' || Boolean(displayStream);
  stopPresentationTracks();
  if (hadDisplay) {
    console.log('[Offscreen] display capture ended');
    setVisualSource('meet');
  }
  return { presenting: false };
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
        await start(
          message.streamId,
          message.audioBitsPerSecond,
          message.keepTabAudible !== false,
          message.micEnabled === true ? true : message.micEnabled === false ? false : null
        );
        return {};
      case MSG.OFFSCREEN_SET_MIC:
        setMicEnabled(message.micEnabled === true);
        return {};
      case MSG.OFFSCREEN_PRESENT_START:
        return startPresentation();
      case MSG.OFFSCREEN_PRESENT_STOP:
        return stopPresentation();
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
