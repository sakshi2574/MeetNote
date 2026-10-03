export default function UserProfile({ compact = false }) {
  return (
    <div className="flex min-w-0 items-center gap-3" role="group" aria-label="Guest, not signed in">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white"
      >
        G
      </span>
      <span className={compact ? 'hidden min-w-0 lg:block' : 'min-w-0'}>
        <span className="block truncate text-sm font-medium text-slate-900">Guest</span>
        <span className="block truncate text-xs text-slate-500">Not signed in</span>
      </span>
    </div>
  )
}
