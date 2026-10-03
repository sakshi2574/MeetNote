import { Route, Routes } from 'react-router-dom'
import AppShell from '../components/layout/AppShell.jsx'
import DashboardPage from '../pages/DashboardPage.jsx'
import LoginPage from '../pages/LoginPage.jsx'
import MeetingDetailPage from '../pages/MeetingDetailPage.jsx'
import MeetingsPage from '../pages/MeetingsPage.jsx'
import SettingsPage from '../pages/SettingsPage.jsx'

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/meetings" element={<MeetingsPage />} />
        <Route path="/meetings/:id" element={<MeetingDetailPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
