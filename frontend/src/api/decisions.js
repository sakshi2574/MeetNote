import client from './client.js'

export function getDecisions(meetingId) {
  return client.get(`/meetings/${meetingId}/decisions`)
}
