import { DEFAULT_SETTINGS, STATUS, STORAGE_KEYS } from './constants.js';

/**
 * @typedef {object} RecordingState
 * @property {string} status
 * @property {number | null} tabId
 * @property {string | null} meetingCode
 * @property {number | null} startedAt    Epoch ms of the current running segment.
 * @property {number} accumulatedMs       Duration of all completed segments.
 * @property {string | null} lastError
 * @property {{ filename: string, bytes: number, durationMs: number, at: number } | null} lastRecording
 */

/** @type {RecordingState} */
export const IDLE_STATE = {
  status: STATUS.IDLE,
  tabId: null,
  meetingCode: null,
  startedAt: null,
  accumulatedMs: 0,
  lastError: null,
  lastRecording: null
};

/** @returns {Promise<RecordingState>} */
export async function readState() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.STATE);
  return { ...IDLE_STATE, ...(stored[STORAGE_KEYS.STATE] || {}) };
}

/**
 * @param {Partial<RecordingState>} patch
 * @returns {Promise<RecordingState>}
 */
export async function writeState(patch) {
  const next = { ...(await readState()), ...patch };
  await chrome.storage.local.set({ [STORAGE_KEYS.STATE]: next });
  return next;
}

/**
 * @param {Partial<RecordingState>} [patch]
 * @returns {Promise<RecordingState>}
 */
export async function resetState(patch = {}) {
  const next = { ...IDLE_STATE, ...patch };
  await chrome.storage.local.set({ [STORAGE_KEYS.STATE]: next });
  return next;
}

/** @returns {Promise<typeof DEFAULT_SETTINGS>} */
export async function readSettings() {
  const stored = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(stored[STORAGE_KEYS.SETTINGS] || {}) };
}

/**
 * @param {Partial<typeof DEFAULT_SETTINGS>} patch
 * @returns {Promise<typeof DEFAULT_SETTINGS>}
 */
export async function writeSettings(patch) {
  const next = { ...(await readSettings()), ...patch };
  await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: next });
  return next;
}

/**
 * Elapsed recording time, resilient to the service worker being restarted.
 * @param {RecordingState} state
 * @param {number} [now]
 */
export function elapsedMs(state, now = Date.now()) {
  const running = state.status === STATUS.RECORDING && state.startedAt ? now - state.startedAt : 0;
  return Math.max(0, state.accumulatedMs + running);
}

/** @param {number} ms */
export function formatDuration(ms) {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/** @param {number} bytes */
export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function isActive(status) {
  return status === STATUS.RECORDING || status === STATUS.PAUSED;
}
