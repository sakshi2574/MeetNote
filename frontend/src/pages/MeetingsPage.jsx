import EmptyState from '../components/ui/EmptyState.jsx'

export default function MeetingsPage() {
  return (
    <EmptyState
      title="No meetings yet"
      description="Meetings you record will be listed here. Opening one will go to its detail page."
    />
  )
}
