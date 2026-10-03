import { useState } from 'react'
import MeetingList from '../components/meetings/MeetingList.jsx'
import Button from '../components/ui/Button.jsx'
import Toast from '../components/ui/Toast.jsx'
import { filterMeetings, meetings } from '../data/meetings.js'
import useStartMeetingNotice from '../hooks/useStartMeetingNotice.js'

const filters = [
  { id: 'all', label: 'All' },
  { id: 'recent', label: 'Recent' },
  { id: 'completed', label: 'Completed' },
]

export default function MeetingsPage() {
  const { notice, startMeeting, dismissNotice } = useStartMeetingNotice()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const visibleMeetings = filterMeetings(meetings, { query, filter })

  function clearSearch() {
    setQuery('')
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">My Meetings</h2>
          <p className="mt-1 text-sm text-slate-500">View, search, and manage your recorded meetings.</p>
        </div>
        <Button className="w-full sm:w-auto" onClick={startMeeting}>
          <PlusIcon />
          Start New Meeting
        </Button>
      </header>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-md">
          <label className="sr-only" htmlFor="meeting-search">
            Search meetings
          </label>
          <input
            id="meeting-search"
            type="search"
            value={query}
            placeholder="Search meetings..."
            onChange={(event) => setQuery(event.target.value)}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
          />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter meetings">
          {filters.map((item) => (
            <Button
              key={item.id}
              size="sm"
              variant={filter === item.id ? 'primary' : 'secondary'}
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </div>

      <MeetingList meetings={visibleMeetings} onClearSearch={clearSearch} />

      {notice ? <Toast key={notice.id} message={notice.message} onClose={dismissNotice} /> : null}
    </div>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
