import client from './client.js'

export function getDecisions(meetingId) {
  return client.get(`/meetings/${meetingId}/decisions`)
}

export function updateDecision(decisionId, data) {
  return client.put(`/decisions/${decisionId}`, data)
}
