import { useParams } from 'react-router-dom'
import Badge from '../components/ui/Badge.jsx'
import Card from '../components/ui/Card.jsx'

export default function MeetingDetailPage() {
  const { id } = useParams()

  return (
    <Card>
      <Badge>Placeholder</Badge>
      <h2 className="mt-3 text-lg font-semibold text-slate-900">Meeting details</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        Transcript, summary, and action items for meeting{' '}
        <span className="font-medium text-slate-800">{id}</span> will appear here.
      </p>
    </Card>
  )
}
