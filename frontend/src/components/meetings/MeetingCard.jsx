import { useNavigate } from 'react-router-dom'
import Badge from '../ui/Badge.jsx'
import Button from '../ui/Button.jsx'
import Card from '../ui/Card.jsx'
import MeetingIcon from './MeetingIcon.jsx'

export default function MeetingCard({ meeting }) {
  const navigate = useNavigate()
  const tone = meeting.status === 'Completed' ? 'success' : 'neutral'

  return (
    <Card className="transition-colors hover:border-slate-300">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
            <MeetingIcon />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-slate-900">{meeting.title}</h3>
              <Badge tone={tone}>{meeting.status}</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              <span>{meeting.date}</span>
              <span aria-hidden="true"> · </span>
              <span>{meeting.duration}</span>
              {meeting.participants != null ? (
                <>
                  <span aria-hidden="true"> · </span>
                  <span>{meeting.participants} participants</span>
                </>
              ) : null}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{meeting.description}</p>
          </div>
        </div>
        <Button
          variant="secondary"
          className="w-full shrink-0 sm:w-auto"
          aria-label={`Open ${meeting.title}`}
          onClick={() => navigate(`/meetings/${meeting.id}`)}
        >
          Open
        </Button>
      </div>
    </Card>
  )
}
