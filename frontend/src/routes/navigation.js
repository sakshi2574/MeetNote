
import { matchPath } from 'react-router-dom'

export const primaryNav = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/meetings', label: 'Meetings', end: false },
  { to: '/calendar', label: 'Calendar', end: true },
  { to: '/settings', label: 'Settings', end: true },
]

export function titleForPath(pathname) {
  if (matchPath({ path: '/meetings/:id', end: true }, pathname)) {
    return 'Meeting'
  }

  const item = primaryNav.find((entry) => {
    return matchPath(
      { path: entry.to, end: Boolean(entry.end) },
      pathname
    )
  })

  return item?.label ?? 'MeetNote'
}
