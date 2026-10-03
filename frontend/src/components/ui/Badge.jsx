const tones = {
  neutral: 'bg-slate-100 text-slate-600',
  soon: 'bg-amber-50 text-amber-800',
}

export default function Badge({ children, tone = 'neutral' }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}
