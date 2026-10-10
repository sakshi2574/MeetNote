import { Link } from 'react-router-dom'
import MeetingIcon from '../meetings/MeetingIcon.jsx'
import Badge from '../ui/Badge.jsx'
import Card from '../ui/Card.jsx'
import EmptyState from '../ui/EmptyState.jsx'
import Spinner from '../ui/Spinner.jsx'

export default function RecentMeetings({ meetings = [], loading = false }) {
  return (
    <Card aria-busy={loading}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Recent meetings
          </h2>

          {loading ? <Spinner label="Loading meetings" /> : null}
        </div>

        <Link
          to="/meetings"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          View all
          <span aria-hidden="true">→</span>
        </Link>
      </div>

      {loading ? (
        <div className="mt-4 space-y-3">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800"
            />
          ))}
        </div>
      ) : null}

      {!loading && meetings.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="No recent meetings"
            description="Meetings you record will show up here."
          />
        </div>
      ) : null}

      {!loading && meetings.length > 0 ? (
        <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
          {meetings.map((meeting) => (
            <li
              key={meeting.id}
              className="flex items-center gap-3 px-2 py-4 first:pt-3 last:pb-1"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
                <MeetingIcon />
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                  {meeting.title}
                </p>

                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  <span>{meeting.date}</span>
                  <span aria-hidden="true"> · </span>
                  <span>{meeting.duration}</span>
                </p>
              </div>

              <Badge tone="success">{meeting.status}</Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  )
}