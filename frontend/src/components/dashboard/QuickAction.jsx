import Button from '../ui/Button.jsx'
import Card from '../ui/Card.jsx'

export default function QuickAction({ onStart }) {
  return (
    <Card>
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        Quick action
      </h2>

      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
        Start a meeting from MeetNote. The recorder connects to this action later.
      </p>

      <Button className="mt-5 w-full" onClick={onStart}>
        <PlusIcon />
        Start New Meeting
      </Button>
    </Card>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path
        d="M12 5v14M5 12h14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}