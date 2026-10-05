import Badge from '../ui/Badge.jsx'
import Card from '../ui/Card.jsx'

export default function MeetingMeta({ meeting, platform }) {
  const tone = meeting.status === 'Completed' ? 'success' : 'neutral'
  const rows = [
    { label: 'Date', value: meeting.date },
    { label: 'Duration', value: meeting.duration },
    meeting.participants != null
      ? { label: 'Participants', value: String(meeting.participants) }
      : null,
    { label: 'Platform', value: platform },
  ].filter(Boolean)

  return (
    <Card>
      <h3 className="text-sm font-semibold text-slate-900">Details</h3>
      <dl className="mt-4 space-y-4">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-xs font-medium text-slate-500">{row.label}</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">{row.value}</dd>
          </div>
        ))}
        <div>
          <dt className="text-xs font-medium text-slate-500">Status</dt>
          <dd className="mt-1">
            <Badge tone={tone}>{meeting.status}</Badge>
          </dd>
        </div>
      </dl>
    </Card>
  )
}
