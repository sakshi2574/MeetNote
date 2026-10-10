import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { titleForPath } from '../../routes/navigation.js'
import Sidebar from './Sidebar.jsx'
import Topbar from './Topbar.jsx'

export default function AppShell() {
  const location = useLocation()
  const [menuPath, setMenuPath] = useState(null)
  const sidebarOpen = menuPath === location.pathname
  const title = titleForPath(location.pathname)

  function openSidebar() {
    setMenuPath(location.pathname)
  }

  function closeSidebar() {
    setMenuPath(null)
  }

  useEffect(() => {
    if (!sidebarOpen) return undefined

    function onKeyDown(event) {
      if (event.key === 'Escape') setMenuPath(null)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [sidebarOpen])

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />
      <div className="md:pl-64">
        <Topbar title={title} sidebarOpen={sidebarOpen} onMenuClick={openSidebar} />
        <main className="px-4 py-6 text-slate-900 transition-colors dark:text-slate-100 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
