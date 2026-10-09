export const STATUS = {
  IDLE: 'idle',
  STARTING: 'starting',
  RECORDING: 'recording',
  PAUSED: 'paused',
  STOPPING: 'stopping'
};

export const MSG = {
  // popup -> service worker
  GET_STATE: 'GET_STATE',
  START: 'START',
  PAUSE: 'PAUSE',
  RESUME: 'RESUME',
  STOP: 'STOP',
  CLEAR_ERROR: 'CLEAR_ERROR',

  // service worker -> offscreen document
  OFFSCREEN_START: 'OFFSCREEN_START',
  OFFSCREEN_PAUSE: 'OFFSCREEN_PAUSE',
  OFFSCREEN_RESUME: 'OFFSCREEN_RESUME',
  OFFSCREEN_STOP: 'OFFSCREEN_STOP',
  OFFSCREEN_REVOKE: 'OFFSCREEN_REVOKE',
  OFFSCREEN_UPLOAD: 'OFFSCREEN_UPLOAD',
  OFFSCREEN_SET_MIC: 'OFFSCREEN_SET_MIC',
  OFFSCREEN_PRESENT_START: 'OFFSCREEN_PRESENT_START',
  OFFSCREEN_PRESENT_STOP: 'OFFSCREEN_PRESENT_STOP',

  // offscreen document -> service worker
  CAPTURE_ENDED: 'CAPTURE_ENDED',
  CAPTURE_ERROR: 'CAPTURE_ERROR',
  PRESENTATION_ENDED: 'PRESENTATION_ENDED',

  // content script -> service worker, and popup <-> content script
  MEET_STATUS: 'MEET_STATUS',
  MIC_STATE: 'MIC_STATE',
  PRESENT_STATE: 'PRESENT_STATE',

  // service worker -> popup broadcast
  STATE_CHANGED: 'STATE_CHANGED'
};

export const TARGET = {
  BACKGROUND: 'background',
  OFFSCREEN: 'offscreen'
};

export const STORAGE_KEYS = {
  STATE: 'recordingState',
  SETTINGS: 'settings',
  AUTH_TOKEN: 'meetnoteAuthToken'
};

export const DEFAULT_SETTINGS = {
  filenamePrefix: 'meetnote',
  audioBitsPerSecond: 128000,
  keepTabAudible: true
};

/** Matches the `abc-defg-hij` meeting code in a Google Meet URL. */
export const MEET_CODE_RE = /^\/([a-z]{3}-[a-z]{4}-[a-z]{3})(?:$|[/?#])/i;

export const MEET_ORIGIN = 'https://meet.google.com';

/** Development MeetNote API. Not user-configurable. */
export const API_BASE_URL = 'http://localhost:8000';

export const API_PATHS = {
  RECORDINGS_UPLOAD: '/recordings/upload'
};

export const UPLOAD_STATUS = {
  UPLOADING: 'uploading',
  UPLOADED: 'uploaded',
  FAILED: 'failed',
  NOT_CONNECTED: 'not_connected'
};

export const UPLOAD_MESSAGE = {
  UPLOADING: 'Uploading...',
  UPLOADED: 'Uploaded',
  FAILED: 'Upload failed',
  NOT_CONNECTED: 'Not connected',
  LOGIN_REQUIRED: 'MeetNote login required. Connect your MeetNote account.',
  TOO_LARGE: 'Recording is larger than the 100 MB upload limit.',
  UNSUPPORTED_FORMAT: 'Unsupported recording format.',
  UNREACHABLE: 'MeetNote backend is not reachable.',
  GENERIC: 'Recording upload failed.'
};

/**
 * @param {string | undefined} url
 * @returns {{ isMeet: boolean, meetingCode: string | null }}
 */
export function parseMeetUrl(url) {
  if (!url) return { isMeet: false, meetingCode: null };
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { isMeet: false, meetingCode: null };
  }
  if (parsed.origin !== MEET_ORIGIN) return { isMeet: false, meetingCode: null };
  const match = MEET_CODE_RE.exec(parsed.pathname);
  return { isMeet: true, meetingCode: match ? match[1].toLowerCase() : null };
}
