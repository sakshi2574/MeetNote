import { useNavigate } from 'react-router-dom'
import MeetingIcon from '../meetings/MeetingIcon.jsx'
import Badge from '../ui/Badge.jsx'
import Button from '../ui/Button.jsx'
import Card from '../ui/Card.jsx'
import EmptyState from '../ui/EmptyState.jsx'
import Spinner from '../ui/Spinner.jsx'

export default function RecentMeetings({ meetings = [], loading = false }) {
  const navigate = useNavigate()

  return (
    <Card aria-busy={loading}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Recent meetings</h2>
        {loading ? <Spinner label="Loading meetings" /> : null}
      </div>

      {loading ? (
        <div className="mt-4 space-y-3">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-lg bg-slate-100" />
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
        <ul className="mt-2 divide-y divide-slate-100">
          {meetings.map((meeting) => (
            <li
              key={meeting.id}
              className="-mx-2 flex flex-col gap-3 rounded-lg px-2 py-4 transition-colors first:pt-3 last:pb-1 hover:bg-slate-50 sm:flex-row sm:items-center"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                  <MeetingIcon />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{meeting.title}</p>
                  <p className="mt-0.5 text-sm text-slate-500">
                    <span>{meeting.date}</span>
                    <span aria-hidden="true"> · </span>
                    <span>{meeting.duration}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <Badge tone="success">{meeting.status}</Badge>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={`Open ${meeting.title}`}
                  onClick={() => navigate(`/meetings/${meeting.id}`)}
                >
                  Open
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  )
}
