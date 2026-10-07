import { useEffect, useRef, useState } from 'react'
import { deleteMeeting, getMeetings } from '../api/meetings.js'
import MeetingList from '../components/meetings/MeetingList.jsx'
import Button from '../components/ui/Button.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import Toast from '../components/ui/Toast.jsx'
import { filterMeetings } from '../data/meetings.js'
import useStartMeetingNotice from '../hooks/useStartMeetingNotice.js'
import { formatMeetings } from '../lib/formatMeeting.js'

const filters = [
  { id: 'all', label: 'All' },
  { id: 'recent', label: 'Recent' },
  { id: 'completed', label: 'Completed' },
]

export default function MeetingsPage() {
  const { notice, startMeeting, dismissNotice } = useStartMeetingNotice()
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [meetingToDelete, setMeetingToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteNotice, setDeleteNotice] = useState(null)
  const deletingRef = useRef(false)
  const visibleMeetings = filterMeetings(meetings, { query, filter })
  const visibleNotice = deleteNotice ?? notice

  useEffect(() => {
    let cancelled = false

    getMeetings()
      .then((response) => {
        if (!cancelled) setMeetings(formatMeetings(response.data))
      })
      .catch(() => {
        if (!cancelled) setError('Unable to load meetings')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!deleteNotice) return undefined

    const timer = window.setTimeout(() => setDeleteNotice(null), 4200)
    return () => window.clearTimeout(timer)
  }, [deleteNotice])

  function clearSearch() {
    setQuery('')
  }

  function requestDelete(meeting) {
    setMeetingToDelete(meeting)
  }

  function cancelDelete() {
    if (deletingRef.current) return
    setMeetingToDelete(null)
  }

  function showDeleteNotice(message, tone) {
    dismissNotice()
    setDeleteNotice({ id: Date.now(), message, tone })
  }

  function dismissVisibleNotice() {
    if (deleteNotice) {
      setDeleteNotice(null)
      return
    }
    dismissNotice()
  }

  async function confirmDelete() {
    if (!meetingToDelete || deletingRef.current) return

    const meetingId = meetingToDelete.id
    deletingRef.current = true
    setDeleting(true)

    try {
      await deleteMeeting(meetingId)
      setMeetings((current) => current.filter((meeting) => meeting.id !== meetingId))
      setMeetingToDelete(null)
      showDeleteNotice('Meeting deleted.', 'success')
    } catch {
      setMeetingToDelete(null)
      showDeleteNotice('Unable to delete this meeting.', 'error')
    } finally {
      deletingRef.current = false
      setDeleting(false)
    }
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

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading meetings" />
        </div>
      ) : null}

      {!loading && error ? (
        <EmptyState title={error} description="Check that the MeetNote API is running, then refresh this page." />
      ) : null}

      {!loading && !error && meetings.length === 0 ? (
        <EmptyState title="No meetings yet" description="Meetings you record will show up here." />
      ) : null}

      {!loading && !error && meetings.length > 0 ? (
        <MeetingList
          meetings={visibleMeetings}
          onClearSearch={clearSearch}
          onDeleteMeeting={requestDelete}
        />
      ) : null}

      {meetingToDelete ? (
        <ConfirmDialog
          title="Delete this meeting?"
          description="The meeting, transcript, action items, decisions, and recording association will be removed."
          confirming={deleting}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      ) : null}

      {visibleNotice ? (
        <Toast
          key={visibleNotice.id}
          message={visibleNotice.message}
          tone={visibleNotice.tone}
          onClose={dismissVisibleNotice}
        />
      ) : null}
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
