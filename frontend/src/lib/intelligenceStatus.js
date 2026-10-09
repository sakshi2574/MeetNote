export const INTELLIGENCE_POLL_MS = 2000

export function shouldPollIntelligence(status) {
  return status === 'pending' || status === 'processing'
}

export function formatIntelligence(data) {
  const keyPoints = Array.isArray(data?.key_points) ? data.key_points : []
  return {
    status: typeof data?.status === 'string' ? data.status : null,
    error: typeof data?.error === 'string' ? data.error : '',
    summary: typeof data?.summary === 'string' && data.summary.trim() ? data.summary.trim() : '',
    summarySource: data?.summary_source ?? null,
    keyPoints: keyPoints
      .filter((point) => typeof point?.text === 'string' && point.text.trim())
      .map((point, index) => ({
        id: `${index}-${point.text}`,
        text: point.text.trim(),
        timestamp: Number.isFinite(Number(point.timestamp)) && point.timestamp !== null ? Number(point.timestamp) : null,
      })),
  }
}

// Which Summary-tab state to show. Transcription state comes first because
// insights are generated from the saved transcript.
export function intelligenceView(intelligence, transcriptionStatus) {
  const status = intelligence?.status ?? null
  const hasContent = Boolean(intelligence?.summary) || (intelligence?.keyPoints?.length ?? 0) > 0

  if (transcriptionStatus === 'pending' || transcriptionStatus === 'processing') {
    return { state: 'waiting', message: 'The summary will be generated after the transcript is ready.' }
  }
  if (shouldPollIntelligence(status)) {
    return { state: 'processing', message: 'Generating summary and insights' }
  }
  if (status === 'failed') {
    return { state: 'failed', message: intelligence?.error || 'Meeting insights could not be generated.' }
  }
  if (hasContent) return { state: 'ready', message: '' }
  if (status === 'completed') {
    return { state: 'insufficient', message: 'The transcript does not have enough content to summarize.' }
  }
  return { state: 'idle', message: 'No summary yet.' }
}
