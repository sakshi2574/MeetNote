import client from './client.js'
import { exportParams } from '../lib/meetingExport.js'

export function exportMeeting(meetingId, format, sections, { signal } = {}) {
  return client.get(`/meetings/${meetingId}/export`, {
    params: exportParams(format, sections),
    responseType: 'blob',
    signal,
  })
}
