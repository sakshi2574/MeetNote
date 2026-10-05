import client from './client.js'

export function getActionItems(meetingId) {
  return client.get(`/meetings/${meetingId}/action-items`)
}

export function updateActionItem(itemId, data) {
  return client.put(`/action-items/${itemId}`, data)
}
