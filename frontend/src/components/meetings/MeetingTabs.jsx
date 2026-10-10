import Button from '../ui/Button.jsx'

const tabs = [
  { id: 'transcript', label: 'Transcript' },
  { id: 'summary', label: 'Summary' },
  { id: 'actions', label: 'Action Items' },
  { id: 'decisions', label: 'Decisions' },
]

export default function MeetingTabs({ activeTab, onChange }) {
  return (
    <div
      role="tablist"
      aria-label="Meeting sections"
      className="flex gap-2 overflow-x-auto pb-1"
    >
      {tabs.map((tab) => {
        const selected = activeTab === tab.id

        return (
          <Button
            key={tab.id}
            id={`meeting-tab-${tab.id}`}
            role="tab"
            size="sm"
            variant={selected ? 'primary' : 'secondary'}
            aria-selected={selected}
            aria-controls={`meeting-panel-${tab.id}`}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </Button>
        )
      })}
    </div>
  )
}