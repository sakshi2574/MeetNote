import { useEffect, useState } from 'react'
import { getMeetings } from '../api/meetings.js'
import { useAuth } from '../auth/AuthContext.jsx'
import QuickAction from '../components/dashboard/QuickAction.jsx'
import RecentMeetings from '../components/dashboard/RecentMeetings.jsx'
import StatCard from '../components/dashboard/StatCard.jsx'
import Button from '../components/ui/Button.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import Toast from '../components/ui/Toast.jsx'
import { getDashboardStats } from '../api/dashboard.js'
import { filterMeetings } from '../data/meetings.js'
import useStartMeetingNotice from '../hooks/useStartMeetingNotice.js'
import { formatMeetings } from '../lib/formatMeeting.js'

export default function DashboardPage() {
  const { user } = useAuth()
  const { notice, startMeeting, dismissNotice } = useStartMeetingNotice()
  const [meetings, setMeetings] = useState([])
const [loading, setLoading] = useState(true)
const [error, setError] = useState('')
const [stats, setStats] = useState(null)
const [statsLoading, setStatsLoading] = useState(true)
const [statsError, setStatsError] = useState('')
  const recentMeetings = filterMeetings(meetings, { filter: 'recent' })
  const welcomeName = user?.name?.trim() || 'there'

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
    let cancelled = false
  
    getDashboardStats()
      .then((response) => {
        if (!cancelled) {
          setStats(response.data)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatsError('Unable to load dashboard statistics')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setStatsLoading(false)
        }
      })
  
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Welcome back, {welcomeName} 👋
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Here's what's happening with your meetings.</p>
        </div>
        <Button className="w-full sm:w-auto" onClick={startMeeting}>
          <PlusIcon />
          Start New Meeting
        </Button>
      </header>

      <section
  aria-label="Statistics"
  className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
>
  {statsLoading ? (
    <p className="text-sm text-slate-500">
      Loading dashboard statistics...
    </p>
  ) : statsError ? (
    <p role="alert" className="text-sm text-red-600">
      {statsError}
    </p>
  ) : stats ? (
    [
      {
        id: 'meetings',
        label: 'Total Meetings',
        value: String(stats.total_meetings),
        detail: 'Meetings in your account',
        tone: 'positive',
      },
      {
        id: 'hours',
        label: 'Recording Hours',
        value: `${stats.total_recording_hours}h`,
        detail: 'Total recorded duration',
        tone: 'positive',
      },
      {
        id: 'actions',
        label: 'Action Items',
        value: String(stats.total_action_items),
        detail: `${stats.completed_action_items} completed`,
        tone: 'neutral',
      },
      {
        id: 'tasks',
        label: 'Pending Tasks',
        value: String(stats.pending_action_items),
        detail: 'Tasks awaiting completion',
        tone: stats.pending_action_items > 0 ? 'attention' : 'positive',
      },
    ].map((stat) => (
      <StatCard
        key={stat.id}
        label={stat.label}
        value={stat.value}
        detail={stat.detail}
        tone={stat.tone}
      />
    ))
  ) : null}
</section>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {error ? (
            <EmptyState title={error} description="Check that the MeetNote API is running, then refresh this page." />
          ) : (
            <RecentMeetings meetings={recentMeetings} loading={loading} />
          )}
        </div>
        <QuickAction onStart={startMeeting} />
      </div>

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
