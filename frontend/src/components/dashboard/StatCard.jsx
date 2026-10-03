import Card from '../ui/Card.jsx'

const detailTones = {
  positive: 'text-emerald-700',
  attention: 'text-amber-700',
  neutral: 'text-slate-500',
}

export default function StatCard({ label, value, detail, tone = 'neutral' }) {
  return (
    <Card className="transition-colors hover:border-slate-300">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
          <StatIcon label={label} />
        </span>
        <p className="text-sm font-medium text-slate-500">{label}</p>
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className={`mt-2 text-sm ${detailTones[tone] ?? detailTones.neutral}`}>{detail}</p>
    </Card>
  )
}

function StatIcon({ label }) {
  if (label === 'Recording Hours') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
        <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 8v4.5l3 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  if (label === 'Action Items') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
        <path
          d="M8 12.5 10.5 15 16 9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    )
  }

  if (label === 'Pending Tasks') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
        <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="2.2" fill="currentColor" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path
        d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16.5 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM4.5 19c.4-2.4 2.2-4 4.8-4s4.4 1.6 4.8 4M14 15.2c1.6-.4 3.2.2 4.2 1.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}
