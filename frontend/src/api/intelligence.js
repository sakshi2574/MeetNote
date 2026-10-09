import client from './client.js'

export function getMeetingIntelligence(meetingId) {
  return client.get(`/meetings/${meetingId}/intelligence`)
}

export function regenerateMeetingIntelligence(meetingId, { replaceSummary = false } = {}) {
  return client.post(`/meetings/${meetingId}/intelligence`, null, {
    params: replaceSummary ? { replace_summary: true } : undefined,
  })
}

export function updateMeetingSummary(meetingId, summary) {
  return client.put(`/meetings/${meetingId}/summary`, { summary })
}
