import { API_BASE_URL, API_PATHS, UPLOAD_MESSAGE, UPLOAD_STATUS } from './constants.js';

const LOG_PREFIX = '[MeetNote Upload]';

/** @returns {string} */
export function recordingUploadUrl() {
  return `${API_BASE_URL}${API_PATHS.RECORDINGS_UPLOAD}`;
}

function scrub(text) {
  return String(text || '')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-jwt]');
}

function clip(text, max = 400) {
  const value = scrub(text).replace(/\s+/g, ' ').trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

/**
 * @param {string[]} trace
 * @param {string} message
 */
function logUpload(trace, message) {
  const line = `${LOG_PREFIX} ${message}`;
  console.log(line);
  trace.push(line);
}

/**
 * @param {Response} response
 * @returns {Promise<string>}
 */
async function readResponseBody(response) {
  try {
    return await response.text();
  } catch (error) {
    return error instanceof Error ? error.message : '';
  }
}

/**
 * @param {number} status
 * @returns {{ status: string, detail: string }}
 */
export function classifyUploadHttpStatus(status) {
  if (status === 401) return { status: UPLOAD_STATUS.FAILED, detail: UPLOAD_MESSAGE.LOGIN_REQUIRED };
  if (status === 413) return { status: UPLOAD_STATUS.FAILED, detail: UPLOAD_MESSAGE.TOO_LARGE };
  if (status === 415) return { status: UPLOAD_STATUS.FAILED, detail: UPLOAD_MESSAGE.UNSUPPORTED_FORMAT };
  return { status: UPLOAD_STATUS.FAILED, detail: UPLOAD_MESSAGE.GENERIC };
}

/**
 * @param {number} durationSeconds
 * @returns {number}
 */
export function normalizeDurationSeconds(durationSeconds) {
  const parsed = Number(durationSeconds);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function fileTypeForUpload(blobType) {
  const normalized = String(blobType || '').toLowerCase().replace(/\s/g, '').replace(/"/g, '');
  if (normalized === 'audio/webm' || normalized === 'audio/webm;codecs=opus') return normalized;
  return 'audio/webm';
}

/**
 * Builds the multipart body from the recording bytes. The blob URL is never included.
 * @param {Blob} blob
 * @param {string} meetingCode
 * @param {number} durationSeconds
 * @returns {FormData}
 */
export function buildRecordingFormData(blob, meetingCode, durationSeconds) {
  const file = new File([blob], 'recording.webm', { type: fileTypeForUpload(blob.type) });
  const form = new FormData();
  form.append('file', file);
  form.append('meeting_code', meetingCode);
  form.append('duration_seconds', String(normalizeDurationSeconds(durationSeconds)));
  return form;
}

/**
 * @param {{ blob: Blob, meetingCode: string, durationSeconds: number, token: string | null }} params
 * @returns {Promise<{ status: string, detail: string | null, trace: string[] }>}
 */
export async function uploadRecording({ blob, meetingCode, durationSeconds, token }) {
  /** @type {string[]} */
  const trace = [];
  const finish = (status, detail) => ({ status, detail, trace });

  logUpload(trace, 'Starting upload (offscreen document)');
  logUpload(trace, `API URL: ${recordingUploadUrl()}`);
  logUpload(trace, `Meeting code: ${meetingCode || '(missing)'}`);
  logUpload(trace, `Duration seconds: ${durationSeconds}`);
  logUpload(trace, `Blob size: ${blob instanceof Blob ? blob.size : '(not a blob)'}`);
  logUpload(trace, `Blob MIME type: ${blob instanceof Blob ? blob.type || '(empty)' : '(not a blob)'}`);

  if (!(blob instanceof Blob) || blob.size <= 0) {
    logUpload(trace, 'Upload stopped: recording blob is missing or empty');
    return finish(UPLOAD_STATUS.FAILED, `${UPLOAD_MESSAGE.GENERIC} Recording blob is missing or empty.`);
  }
  if (typeof meetingCode !== 'string' || meetingCode.trim() === '') {
    logUpload(trace, 'Upload stopped: meeting code is missing');
    return finish(UPLOAD_STATUS.FAILED, `${UPLOAD_MESSAGE.GENERIC} Meeting code is missing.`);
  }

  const suppliedToken = typeof token === 'string' ? token.trim() : '';
  logUpload(trace, `Authorization attached: ${suppliedToken ? 'yes' : 'no'}`);
  if (!suppliedToken) return finish(UPLOAD_STATUS.NOT_CONNECTED, null);

  const form = buildRecordingFormData(blob, meetingCode.trim(), durationSeconds);
  const file = form.get('file');
  logUpload(trace, `File size: ${file instanceof Blob ? file.size : '(missing)'}`);
  logUpload(trace, `File MIME type: ${file instanceof Blob ? file.type || '(empty)' : '(missing)'}`);

  let response;
  try {
    response = await fetch(recordingUploadUrl(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${suppliedToken}` },
      body: form,
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer'
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logUpload(trace, `Network error: ${message}`);
    return finish(UPLOAD_STATUS.FAILED, UPLOAD_MESSAGE.UNREACHABLE);
  }

  const rawBody = await readResponseBody(response);
  const loggedBody = clip(rawBody);
  logUpload(trace, `Response status: ${response.status}`);
  logUpload(trace, `Response body: ${loggedBody || response.statusText || '(empty)'}`);

  if (!response.ok) {
    const known = classifyUploadHttpStatus(response.status);
    if (response.status === 401 || response.status === 413 || response.status === 415) return finish(known.status, known.detail);
    return finish(
      UPLOAD_STATUS.FAILED,
      `${UPLOAD_MESSAGE.GENERIC} HTTP ${response.status}: ${loggedBody || response.statusText || 'no response body'}`
    );
  }

  try {
    const data = JSON.parse(rawBody);
    if (!data || data.status !== 'uploaded' || typeof data.meeting_id !== 'number') {
      logUpload(
        trace,
        `Unexpected response shape: status=${data && data.status} meeting_id=${data && typeof data.meeting_id}`
      );
      return finish(UPLOAD_STATUS.FAILED, `${UPLOAD_MESSAGE.GENERIC} Unexpected response: ${loggedBody || '(empty)'}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logUpload(trace, `Response JSON error: ${message}`);
    return finish(UPLOAD_STATUS.FAILED, `${UPLOAD_MESSAGE.GENERIC} Response was not JSON.`);
  }

  logUpload(trace, 'Upload succeeded');
  return finish(UPLOAD_STATUS.UPLOADED, null);
}
