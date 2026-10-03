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

export function filterMeetings(items, { query = '', filter = 'all' } = {}) {
  const normalized = query.trim().toLowerCase()

  return items.filter((meeting) => {
    const matchesQuery = normalized.length === 0 || meeting.title.toLowerCase().includes(normalized)
    const matchesFilter =
      filter === 'all' ||
      (filter === 'recent' && meeting.recent) ||
      (filter === 'completed' && meeting.status === 'Completed')

    return matchesQuery && matchesFilter
  })
}
