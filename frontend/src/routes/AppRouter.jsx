import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import AppShell from '../components/layout/AppShell.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import DashboardPage from '../pages/DashboardPage.jsx'
import LoginPage from '../pages/LoginPage.jsx'
import MeetingDetailPage from '../pages/MeetingDetailPage.jsx'
import MeetingsPage from '../pages/MeetingsPage.jsx'
import SettingsPage from '../pages/SettingsPage.jsx'

function RequireAuth() {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <Spinner label="Loading account" />
      </main>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <AppShell />
}

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/meetings" element={<MeetingsPage />} />
        <Route path="/meetings/:id" element={<MeetingDetailPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
