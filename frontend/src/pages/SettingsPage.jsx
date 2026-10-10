import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import Card from '../components/ui/Card.jsx'

const THEME_KEY = 'meetnote_theme'
const NOTIFICATIONS_KEY = 'meetnote_notification_preferences'

const DEFAULT_NOTIFICATIONS = {
  meetingReminders: true,
  transcriptCompletion: true,
  summaryAvailability: true,
}

function readNotificationPreferences() {
  try {
    const saved = localStorage.getItem(NOTIFICATIONS_KEY)

    return saved
      ? { ...DEFAULT_NOTIFICATIONS, ...JSON.parse(saved) }
      : DEFAULT_NOTIFICATIONS
  } catch {
    return DEFAULT_NOTIFICATIONS
  }
}

export default function SettingsPage() {
  const { user } = useAuth()

  const [theme, setTheme] = useState(
    () => localStorage.getItem(THEME_KEY) || 'light',
  )

  const [notifications, setNotifications] = useState(
    readNotificationPreferences,
  )

  const [savedMessage, setSavedMessage] = useState('')

  useEffect(() => {
    const root = document.documentElement

    root.classList.toggle('dark', theme === 'dark')
    localStorage.setItem(THEME_KEY, theme)

    document.body.style.backgroundColor =
      theme === 'dark' ? '#020617' : '#f8fafc'

    document.body.style.color =
      theme === 'dark' ? '#e2e8f0' : '#0f172a'

    return () => {
      document.body.style.backgroundColor = ''
      document.body.style.color = ''
    }
  }, [theme])

  function updateNotification(key, checked) {
    const updated = {
      ...notifications,
      [key]: checked,
    }

    setNotifications(updated)
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(updated))
    setSavedMessage('Notification preferences saved.')

    window.setTimeout(() => setSavedMessage(''), 2500)
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Settings
        </h1>

        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Manage your account and MeetNote preferences.
        </p>
      </header>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
        <Card>
          <SectionHeading
            title="Profile"
            description="Manage your MeetNote account information."
          />

          <div className="mt-6 flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xl font-semibold text-teal-800 dark:bg-teal-900 dark:text-teal-200">
              {(user?.name?.trim() || user?.email || 'U')
                .charAt(0)
                .toUpperCase()}
            </div>

            <div className="min-w-0">
              <p className="break-words font-semibold text-slate-900 dark:text-slate-100">
                {user?.name || 'MeetNote User'}
              </p>

              <p className="break-all text-sm text-slate-500 dark:text-slate-400">
                {user?.email || 'Email unavailable'}
              </p>
            </div>
          </div>

          <ProfileForm user={user} />
        </Card>

        <Card>
          <SectionHeading
            title="Appearance"
            description="Choose how MeetNote looks on this device."
          />

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ThemeOption
              title="Light"
              description="A bright, clean interface."
              selected={theme === 'light'}
              onClick={() => setTheme('light')}
              previewClass="bg-white text-slate-900 border-slate-200"
            />

            <ThemeOption
              title="Dark"
              description="A darker interface."
              selected={theme === 'dark'}
              onClick={() => setTheme('dark')}
              previewClass="bg-slate-900 text-white border-slate-700"
            />
          </div>

          <p className="mt-4 text-xs leading-5 text-slate-500 dark:text-slate-400">
            Your theme preference is saved locally in this browser.
          </p>
        </Card>

        <Card>
          <SectionHeading
            title="Notifications"
            description="Manage your notification preferences."
          />

          <div className="mt-5 divide-y divide-slate-100 dark:divide-slate-700">
            <NotificationToggle
              title="Meeting reminders"
              description="Receive reminders for upcoming meetings."
              checked={notifications.meetingReminders}
              onChange={(checked) =>
                updateNotification('meetingReminders', checked)
              }
            />

            <NotificationToggle
              title="Transcript completion"
              description="Enable your preference for transcript completion updates."
              checked={notifications.transcriptCompletion}
              onChange={(checked) =>
                updateNotification('transcriptCompletion', checked)
              }
            />

            <NotificationToggle
              title="Meeting summaries"
              description="Enable your preference for meeting summary updates."
              checked={notifications.summaryAvailability}
              onChange={(checked) =>
                updateNotification('summaryAvailability', checked)
              }
            />
          </div>

          <p className="mt-4 text-xs leading-5 text-slate-500 dark:text-slate-400">
            These settings store your preferences. Actual notification delivery
            is not implemented by these toggles.
          </p>

          {savedMessage && (
            <p role="status" className="mt-3 text-sm text-teal-700 dark:text-teal-400">
              {savedMessage}
            </p>
          )}
        </Card>

        <Card>
          <SectionHeading
            title="Recording & privacy"
            description="Information about your recordings and data."
          />

          <div className="mt-5 space-y-4">
            <InfoRow
              title="Recording storage"
              description="MeetNote stores recordings according to its existing backend configuration."
            />

            <InfoRow
              title="Transcripts"
              description="Meeting transcripts and related intelligence are managed through your existing MeetNote features."
            />

            <InfoRow
              title="Automatic deletion"
              description="No automatic recording deletion policy is configured by this Settings page."
            />
          </div>
        </Card>
      </div>
    </div>
  )
}

function SectionHeading({ title, description }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
        {title}
      </h2>

      <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">
        {description}
      </p>
    </div>
  )
}

function ProfileForm({ user }) {
  const { updateProfile } = useAuth()

  const [name, setName] = useState(user?.name || '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()

    const trimmedName = name.trim()

    setMessage('')
    setError('')

    if (!trimmedName) {
      setError('Name cannot be empty.')
      return
    }

    if (trimmedName.length > 255) {
      setError('Name cannot exceed 255 characters.')
      return
    }

    if (trimmedName === user?.name) {
      setMessage('Your profile is already up to date.')
      return
    }

    try {
      setSaving(true)

      await updateProfile(trimmedName)

      setName(trimmedName)
      setMessage('Profile updated successfully.')
    } catch (err) {
      const detail = err.response?.data?.detail

      setError(
        typeof detail === 'string'
          ? detail
          : 'Unable to update your profile. Please try again.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div>
        <label
          htmlFor="profile-name"
          className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          Full name
        </label>

        <input
          id="profile-name"
          type="text"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setMessage('')
            setError('')
          }}
          maxLength={255}
          required
          autoComplete="name"
          disabled={saving}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-800 dark:focus:border-teal-500 dark:focus:ring-teal-900"
        />

        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Maximum 255 characters.
        </p>
      </div>

      <div>
        <label
          htmlFor="profile-email"
          className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          Email address
        </label>

        <input
          id="profile-email"
          type="email"
          value={user?.email || ''}
          readOnly
          className="w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        />

        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Your email address cannot be changed here.
        </p>
      </div>

      {message && (
        <p role="status" className="text-sm text-teal-700 dark:text-teal-400">
          {message}
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={saving || !user}
        className="inline-flex items-center justify-center rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus:ring-offset-slate-950"
      >
        {saving ? 'Saving...' : 'Save changes'}
      </button>
    </form>
  )
}

function ThemeOption({
  title,
  description,
  selected,
  onClick,
  previewClass,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-xl border-2 p-3 text-left transition ${
        selected
          ? 'border-teal-600 ring-2 ring-teal-100 dark:border-teal-400 dark:ring-teal-900'
          : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-500'
      }`}
    >
      <div
        className={`mb-3 rounded-lg border p-3 ${previewClass}`}
        aria-hidden="true"
      >
        <div className="h-2 w-1/2 rounded bg-current opacity-70" />
        <div className="mt-2 h-2 w-3/4 rounded bg-current opacity-30" />
        <div className="mt-3 h-6 rounded bg-teal-500 opacity-80" />
      </div>

      <div className="font-medium text-slate-900 dark:text-slate-100">
        {title}
      </div>

      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {description}
      </div>

      {selected && (
        <div className="mt-2 text-xs font-medium text-teal-700 dark:text-teal-400">
          Selected
        </div>
      )}
    </button>
  )
}

function NotificationToggle({ title, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div>
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
          {title}
        </p>

        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          checked
            ? 'bg-teal-600'
            : 'bg-slate-300 dark:bg-slate-600'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            checked ? 'left-5' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  )
}

function InfoRow({ title, description }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
        {title}
      </p>

      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
        {description}
      </p>
    </div>
  )
}