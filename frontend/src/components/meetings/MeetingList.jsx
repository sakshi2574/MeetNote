import Button from '../ui/Button.jsx'
import EmptyState from '../ui/EmptyState.jsx'
import MeetingCard from './MeetingCard.jsx'

export default function MeetingList({ meetings, onClearSearch, onDeleteMeeting }) {
  if (meetings.length === 0) {
    return (
      <EmptyState
        title="No meetings found"
        description="Try a different search term."
        action={
          <Button variant="secondary" onClick={onClearSearch}>
            Clear search
          </Button>
        }
      />
    )
  }

  const label = meetings.length === 1 ? '1 meeting' : `${meetings.length} meetings`

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">{label}</p>
      <ul className="space-y-3">
        {meetings.map((meeting) => (
          <li key={meeting.id}>
            <MeetingCard meeting={meeting} onDelete={onDeleteMeeting} />
          </li>
        ))}
      </ul>
    </div>
  )
}
