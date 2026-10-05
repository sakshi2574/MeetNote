import { useAuth } from '../../auth/AuthContext.jsx'

export default function UserProfile({ compact = false }) {
  const { user } = useAuth()
  const name = user?.name?.trim() || 'Guest'
  const email = user?.email?.trim() || 'Not signed in'
  const initial = name.slice(0, 1).toUpperCase()

  return (
    <div className="flex min-w-0 items-center gap-3" role="group" aria-label={`${name}, ${email}`}>
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white"
      >
        {initial}
      </span>
      <span className={compact ? 'hidden min-w-0 lg:block' : 'min-w-0'}>
        <span className="block truncate text-sm font-medium text-slate-900">{name}</span>
        <span className="block truncate text-xs text-slate-500">{email}</span>
      </span>
    </div>
  )
}
