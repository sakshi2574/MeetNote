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

  return {
    id: meeting.id,
    title: meeting.title,
    description: meeting.description ?? '',
    date: formatMeetingDate(meeting.meeting_date),
    duration: formatDuration(meeting.duration_seconds),
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
  return {
    id: segment.id,
    time: formatTranscriptTime(segment.start_time),
    speaker: segment.speaker,
    text: segment.text,
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
  return {
    id: item.id,
    task: item.task,
    assignee: item.assignee?.trim() || 'Unassigned',
    due: formatDueDate(item.due_date),
    status: formatStatus(item.status || 'pending'),
  }
}

export function formatDecision(decision) {
  return {
    id: decision.id,
    text: decision.decision,
    time: formatTranscriptTime(decision.timestamp),
    context: decision.context ?? '',
  }
}
