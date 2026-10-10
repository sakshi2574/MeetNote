import client from './client.js'

export function getDashboardStats() {
  return client.get('/dashboard/stats')
}