export function formatDuration(seconds) {
  const totalSeconds = Number(seconds)
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : 0
  const minutes = Math.round(safeSeconds / 60)
  return `${minutes} min`
}

export function formatMeetingDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown date'

  const startOfDay = (item) => new Date(item.getFullYear(), item.getMonth(), item.getDate())
  const dayDiff = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000)

  if (dayDiff === 0) return 'Today'
  if (dayDiff === 1) return 'Yesterday'

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatStatus(status) {
  if (typeof status !== 'string' || status.trim() === '') return 'Completed'

  return status
    .trim()
    .split(/[\s_]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

export function formatMeeting(meeting) {
  const timestamp = Date.parse(meeting.meeting_date)
  const durationSeconds = Number(meeting.duration_seconds)
  const safeDuration = Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0
  const recordingPath = typeof meeting.recording_path === 'string' ? meeting.recording_path.trim() : ''

  return {
    id: meeting.id,
    title: meeting.title,
    description: meeting.description ?? '',
    date: formatMeetingDate(meeting.meeting_date),
    duration: formatDuration(safeDuration),
    durationSeconds: safeDuration,
    hasRecording: recordingPath !== '',
    status: formatStatus(meeting.status),
    platform: meeting.platform || '',
    meetingTimestamp: Number.isNaN(timestamp) ? 0 : timestamp,
    recent: false,
  }
}

export function formatMeetings(meetings) {
  const formatted = meetings.map(formatMeeting)
  const recentIds = new Set(
    [...formatted]
      .sort((left, right) => right.meetingTimestamp - left.meetingTimestamp)
      .slice(0, 4)
      .map((meeting) => meeting.id),
  )

  return formatted.map((meeting) => ({
    ...meeting,
    recent: recentIds.has(meeting.id),
  }))
}

export function formatTranscriptTime(seconds) {
  const totalSeconds = Number(seconds)
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0
  const minutes = Math.floor(safeSeconds / 60)
  const remainder = safeSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

export function formatTranscriptSegment(segment) {
  const start = Number(segment.start_time)
  const end = Number(segment.end_time)

  return {
    id: segment.id,
    time: formatTranscriptTime(segment.start_time),
    startTime: Number.isFinite(start) ? Math.max(0, start) : 0,
    endTime: Number.isFinite(end) ? Math.max(0, end) : 0,
    speaker: segment.speaker,
    text: segment.text,
    source: typeof segment.source === 'string' ? segment.source : '',
  }
}

export function formatDueDate(value) {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value))
  if (!match) return null

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  if (Number.isNaN(date.getTime())) return null

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatActionItem(item) {
  const timestamp = Number(item.timestamp)
  const hasTimestamp = item.timestamp != null && Number.isFinite(timestamp)
  return {
    id: item.id,
    task: item.task,
    rawAssignee: item.assignee?.trim() || '',
    assignee: item.assignee?.trim() || 'Unassigned',
    due: formatDueDate(item.due_date),
    status: formatStatus(item.status || 'pending'),
    timestamp: hasTimestamp ? Math.max(0, timestamp) : null,
    time: hasTimestamp ? formatTranscriptTime(timestamp) : null,
    source: typeof item.source === 'string' ? item.source : '',
  }
}

export function formatDecision(decision) {
  const timestamp = Number(decision.timestamp)
  return {
    id: decision.id,
    text: decision.decision,
    timestamp: Number.isFinite(timestamp) ? Math.max(0, timestamp) : 0,
    time: formatTranscriptTime(decision.timestamp),
    context: decision.context ?? '',
    source: typeof decision.source === 'string' ? decision.source : '',
  }
}
