const dotTone = {
  success: 'bg-teal-700',
  error: 'bg-rose-600',
}

export default function Toast({ message, onClose, tone = 'success' }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className="fixed bottom-4 left-4 right-4 z-30 flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-lg sm:left-auto sm:w-96"
    >
      <span
        className={`mt-1 h-2 w-2 shrink-0 rounded-full ${dotTone[tone] ?? dotTone.success}`}
        aria-hidden="true"
      />
      <p className="flex-1 text-sm leading-5 text-slate-700">{message}</p>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss notification"
        className="rounded-md px-1 text-lg leading-none text-slate-400 transition-colors hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  )
}
