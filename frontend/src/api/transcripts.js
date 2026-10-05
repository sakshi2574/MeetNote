import client from './client.js'

export function getTranscript(meetingId) {
  return client.get(`/meetings/${meetingId}/transcript`)
}

export function createTranscriptSegment(meetingId, data) {
  return client.post(`/meetings/${meetingId}/transcript`, data)
}

export function updateTranscriptSegment(segmentId, data) {
  return client.put(`/transcript/${segmentId}`, data)
}

export function deleteTranscriptSegment(segmentId) {
  return client.delete(`/transcript/${segmentId}`)
}
