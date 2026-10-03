import Card from '../components/ui/Card.jsx'

const sections = [
  {
    title: 'Profile',
    body: 'Name, email, and account details will appear here.',
  },
  {
    title: 'Preferences',
    body: 'Notification and recording preferences will appear here.',
  },
]

export default function SettingsPage() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {sections.map((section) => (
        <Card key={section.title}>
          <h2 className="text-lg font-semibold text-slate-900">{section.title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">{section.body}</p>
        </Card>
      ))}
    </div>
  )
}
