import Button from '../ui/Button.jsx'
import UserProfile from './UserProfile.jsx'

export default function Topbar({ title, sidebarOpen, onMenuClick }) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur transition-colors dark:border-slate-800 dark:bg-slate-950/95">
      <div className="flex items-center gap-3 px-4 py-3 sm:h-16 sm:py-0">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Open menu"
          aria-controls="app-sidebar"
          aria-expanded={sidebarOpen}
          onClick={onMenuClick}
        >
          <MenuIcon />
        </Button>

        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight text-slate-900 transition-colors dark:text-slate-100 sm:flex-none">
          {title}
        </h1>

        <div className="hidden min-w-0 flex-1 sm:block">
          <SearchField id="topbar-search" />
        </div>

        <div className="ml-auto flex items-center gap-2 sm:ml-0">
          <Button variant="ghost" size="icon" aria-label="Notifications">
            <BellIcon />
          </Button>

          <UserProfile compact />
        </div>
      </div>

      <div className="px-4 pb-3 sm:hidden">
        <SearchField id="topbar-search-mobile" />
      </div>
    </header>
  )
}

function SearchField({ id }) {
  return (
    <div className="relative w-full sm:ml-auto sm:max-w-xs">
      <label className="sr-only" htmlFor={id}>
        Search
      </label>

      <input
        id={id}
        type="search"
        placeholder="Search"
        className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:border-slate-600 dark:focus:bg-slate-900 dark:focus:ring-slate-700"
      />
    </div>
  )
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        d="M4 7h16M4 12h16M4 17h16"
      />
    </svg>
  )
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 9a6 6 0 1 1 12 0c0 7 2 7 2 9H4c0-2 2-2 2-9zM10 20a2 2 0 0 0 4 0"
      />
    </svg>
  )
}