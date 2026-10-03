import QuickAction from '../components/dashboard/QuickAction.jsx'
import RecentMeetings from '../components/dashboard/RecentMeetings.jsx'
import StatCard from '../components/dashboard/StatCard.jsx'
import Button from '../components/ui/Button.jsx'
import Toast from '../components/ui/Toast.jsx'
import { dashboardStats } from '../data/dashboard.js'
import { filterMeetings, meetings } from '../data/meetings.js'
import useStartMeetingNotice from '../hooks/useStartMeetingNotice.js'

export default function DashboardPage() {
  const { notice, startMeeting, dismissNotice } = useStartMeetingNotice()
  const recentMeetings = filterMeetings(meetings, { filter: 'recent' })

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
            Welcome back, Sakshi 👋
          </h2>
          <p className="mt-1 text-sm text-slate-500">Here's what's happening with your meetings.</p>
        </div>
        <Button className="w-full sm:w-auto" onClick={startMeeting}>
          <PlusIcon />
          Start New Meeting
        </Button>
      </header>

      <section aria-label="Statistics" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboardStats.map((stat) => (
          <StatCard
            key={stat.id}
            label={stat.label}
            value={stat.value}
            detail={stat.detail}
            tone={stat.tone}
          />
        ))}
      </section>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <RecentMeetings meetings={recentMeetings} />
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
