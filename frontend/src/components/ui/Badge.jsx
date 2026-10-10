const tones = {
  neutral:
    'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',

  soon:
    'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300',

  success:
    'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
}

export default function Badge({ children, tone = 'neutral' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        tones[tone] ?? tones.neutral
      }`}
    >
      {children}
    </span>
  )
}