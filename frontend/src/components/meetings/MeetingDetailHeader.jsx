import { useNavigate } from 'react-router-dom'
import Badge from '../ui/Badge.jsx'
import Button from '../ui/Button.jsx'

export default function MeetingDetailHeader({
  meeting,
  onPlay,
  onGenerateTranscript,
  generatingTranscript = false,
}) {
  const navigate = useNavigate()
  const tone = meeting.status === 'Completed' ? 'success' : 'neutral'

  return (
    <header className="space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate('/meetings')}>
        <ArrowIcon />
        Back to Meetings
      </Button>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{meeting.title}</h2>
            <Badge tone={tone}>{meeting.status}</Badge>
          </div>
          <p className="mt-2 text-sm text-slate-500">
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
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          {meeting.hasRecording ? (
            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              loading={generatingTranscript}
              aria-busy={generatingTranscript}
              onClick={onGenerateTranscript}
            >
              {generatingTranscript ? 'Generating transcript...' : 'Generate Transcript'}
            </Button>
          ) : null}
          <Button className="w-full sm:w-auto" onClick={onPlay}>
            <PlayIcon />
            Play Recording
          </Button>
        </div>
      </div>
    </header>
  )
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path d="M15 6 9 12l6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path d="M8 6.5v11l9-5.5-9-5.5z" fill="currentColor" />
    </svg>
  )
}
