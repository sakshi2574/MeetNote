import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext.jsx'
import { primaryNav } from '../../routes/navigation.js'
import Badge from '../ui/Badge.jsx'
import Button from '../ui/Button.jsx'
import Logo from './Logo.jsx'
import UserProfile from './UserProfile.jsx'

const icons = {
  Dashboard: IconDashboard,
  Meetings: IconMeetings,
  Calendar: IconCalendar,
  Settings: IconSettings,
}

export default function Sidebar({ open, onClose }) {
  const navigate = useNavigate()
  const { logout } = useAuth()

  function handleLogout() {
    logout()
    onClose()
    navigate('/login')
  }

  return (
    <>
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-slate-900/40 md:hidden"
          aria-label="Close menu"
          onClick={onClose}
        />
      ) : null}
      <aside
        id="app-sidebar"
        className={`fixed inset-y-0 left-0 z-40 w-64 flex-col border-r border-slate-200 bg-white ${
          open ? 'flex' : 'hidden'
        } md:flex`}
      >
        <div className="flex h-16 shrink-0 items-center border-b border-slate-200 px-4">
          <Link to="/" onClick={onClose} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
            <Logo />
          </Link>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Primary">
          {primaryNav.map((item) => {
            const Icon = icons[item.label]

            if (item.disabled) {
              return (
                <div
                  key={item.label}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400"
                  aria-disabled="true"
                >
                  <Icon />
                  <span className="flex-1">{item.label}</span>
                  <Badge tone="soon">Soon</Badge>
                </div>
              )
            }

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
                    isActive
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
              >
                <Icon />
                {item.label}
              </NavLink>
            )
          })}
        </nav>
        <div className="shrink-0 border-t border-slate-200 p-3">
          <UserProfile />
          <Button variant="secondary" className="mt-3 w-full" onClick={handleLogout}>
            Log out
          </Button>
        </div>
      </aside>
    </>
  )
}

function IconDashboard() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"
      />
    </svg>
  )
}

function IconMeetings() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 6h11M8 12h11M8 18h11M4 6h.01M4 12h.01M4 18h.01"
      />
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 3v3M17 3v3M4 8h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"
      />
    </svg>
  )
}

function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.4 13a7.8 7.8 0 0 0 .1-2l2-1.2-2-3.4-2.2.6a8 8 0 0 0-1.7-1L15.2 4h-4.4L10.4 6a8 8 0 0 0-1.7 1L6.5 6.4l-2 3.4L6.5 11a7.8 7.8 0 0 0 .1 2l-2 1.2 2 3.4 2.2-.6a8 8 0 0 0 1.7 1l.4 2h4.4l.4-2a8 8 0 0 0 1.7-1l2.2.6 2-3.4z"
      />
    </svg>
  )
}
