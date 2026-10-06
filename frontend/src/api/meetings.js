import client from './client.js'

export function getMeetings() {
  return client.get('/meetings')
}

export function getMeeting(id) {
  return client.get(`/meetings/${id}`)
}

export function getMeetingRecording(id, config = {}) {
  return client.get(`/meetings/${id}/recording`, {
    ...config,
    responseType: 'blob',
  })
}

export function createMeeting(data) {
  return client.post('/meetings', data)
}

export function updateMeeting(id, data) {
  return client.put(`/meetings/${id}`, data)
}

export function deleteMeeting(id) {
  return client.delete(`/meetings/${id}`)
}
