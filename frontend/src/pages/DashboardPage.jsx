import Card from '../components/ui/Card.jsx'

export default function DashboardPage() {
  return (
    <Card>
      <h2 className="text-lg font-semibold text-slate-900">Dashboard</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
        Meeting overview, recent activity, and follow-ups will appear here.
      </p>
    </Card>
  )
}
