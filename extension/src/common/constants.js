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

  // offscreen document -> service worker
  CAPTURE_ENDED: 'CAPTURE_ENDED',
  CAPTURE_ERROR: 'CAPTURE_ERROR',

  // popup <-> content script
  MEET_STATUS: 'MEET_STATUS',

  // service worker -> popup broadcast
  STATE_CHANGED: 'STATE_CHANGED'
};

export const TARGET = {
  BACKGROUND: 'background',
  OFFSCREEN: 'offscreen'
};

export const STORAGE_KEYS = {
  STATE: 'recordingState',
  SETTINGS: 'settings'
};

export const DEFAULT_SETTINGS = {
  filenamePrefix: 'meetnote',
  audioBitsPerSecond: 128000,
  keepTabAudible: true
};

/** Matches the `abc-defg-hij` meeting code in a Google Meet URL. */
export const MEET_CODE_RE = /^\/([a-z]{3}-[a-z]{4}-[a-z]{3})(?:$|[/?#])/i;

export const MEET_ORIGIN = 'https://meet.google.com';

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
