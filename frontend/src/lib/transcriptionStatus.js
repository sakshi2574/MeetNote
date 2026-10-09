export const TRANSCRIPTION_POLL_MS = 2000

export function shouldPollTranscription(status) {
  return status === 'pending' || status === 'processing'
}

export function shouldRefreshTranscript(status, isEditing) {
  return status === 'completed' && !isEditing
}

export function transcriptionStatusView(snapshot) {
  const status = snapshot?.status ?? null
  if (status === 'pending') {
    return { message: 'Transcription queued', busy: true, failed: false }
  }
  if (status === 'processing') {
    return { message: 'Transcribing', busy: true, failed: false }
  }
  if (status === 'completed') {
    const language = typeof snapshot.language === 'string' ? snapshot.language.trim() : ''
    const message = language ? `Transcript ready. Detected language: ${language}.` : 'Transcript ready'
    return { message, busy: false, failed: false }
  }
  if (status === 'failed') {
    const error = typeof snapshot.error === 'string' ? snapshot.error.trim() : ''
    const message = error ? `Transcription failed. ${error}` : 'Transcription failed'
    return { message, busy: false, failed: true }
  }
  return { message: '', busy: false, failed: false }
}
