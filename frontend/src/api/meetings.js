
import client from './client.js'

// Fetch all meetings from the backend
export async function getMeetings() {
  return client.get('/meetings')
}

// Fetch a single meeting by ID
export async function getMeeting(id) {
  return client.get(`/meetings/${id}`)
}

// Fetch a meeting recording
export async function getMeetingRecording(id, config = {}) {
  return client.get(`/meetings/${id}/recording`, {
    ...config,
    responseType: 'blob',
  })
}

// Create a meeting
export async function createMeeting(data) {
  return client.post('/meetings', data)
}

// Update a meeting
export async function updateMeeting(id, data) {
  return client.put(`/meetings/${id}`, data)
}

// Delete a meeting
export async function deleteMeeting(id) {
  return client.delete(`/meetings/${id}`)
}

// Temporary sample data for the Calendar page.
// Replace with backend meeting data when CalendarPage is connected to getMeetings().
export const meetings = [
  {
    id: 'project-discussion',
    title: 'Project Discussion',
    date: 'Today',
    duration: '45 min',
    status: 'Completed',
    participants: 5,
    description: 'Project architecture and implementation discussion.',
    recent: true,
  },
  {
    id: 'team-meeting',
    title: 'Team Meeting',
    date: 'Yesterday',
    duration: '32 min',
    status: 'Completed',
    participants: 6,
    description: 'Weekly team progress and task updates.',
    recent: true,
  },
  {
    id: 'client-discussion',
    title: 'Client Discussion',
    date: 'Sep 30',
    duration: '51 min',
    status: 'Completed',
    participants: 4,
    description: 'Client requirements and project feedback.',
    recent: true,
  },
  {
    id: 'weekly-standup',
    title: 'Weekly Standup',
    date: 'Sep 29',
    duration: '28 min',
    status: 'Completed',
    participants: 7,
    description: 'Team progress, blockers, and upcoming tasks.',
    recent: true,
  },
  {
    id: 'ai-project-review',
    title: 'AI Project Review',
    date: 'Sep 27',
    duration: '42 min',
    status: 'Completed',
    participants: 5,
    description: 'Review of AI features and product roadmap.',
    recent: false,
  },
  {
    id: 'product-planning',
    title: 'Product Planning',
    date: 'Sep 25',
    duration: '38 min',
    status: 'Completed',
    participants: 4,
    description: 'Product planning and feature prioritization.',
    recent: false,
  },
]

// Find a sample meeting by ID
export function findMeeting(id) {
  return meetings.find((meeting) => meeting.id === id) ?? null
}

// Filter sample meetings by search query and filter type
export function filterMeetings(items, { query = '', filter = 'all' } = {}) {
  const normalized = query.trim().toLowerCase()

  return items.filter((meeting) => {
    const matchesQuery = meeting.title.toLowerCase().includes(normalized)

    const matchesFilter =
      filter === 'all' ||
      (filter === 'recent' && meeting.recent) ||
      (filter === 'completed' && meeting.status === 'Completed')

    return matchesQuery && matchesFilter
  })
}
