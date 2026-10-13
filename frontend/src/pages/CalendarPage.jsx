
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import client from '../api/client.js'
import { getMeetings } from '../api/meetings.js'
import { formatMeetings } from '../lib/formatMeeting.js'
import Spinner from '../components/ui/Spinner.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'

export default function CalendarPage() {
  const [activeTab, setActiveTab] = useState('upcoming')
  const [search, setSearch] = useState('')
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [googleConnected, setGoogleConnected] = useState(false)
  const [googleEmail, setGoogleEmail] = useState('')
  const [googleLoading, setGoogleLoading] = useState(false)
  const [googleError, setGoogleError] = useState('')
  const [calendarEvents, setCalendarEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(false)

  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    let cancelled = false

    getMeetings()
      .then((response) => {
        if (!cancelled) {
          setMeetings(formatMeetings(response.data))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Unable to load previous meetings.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadGoogleStatus() {
      try {
        const { data } = await client.get('/calendar/google/status')

        if (cancelled) return

        setGoogleConnected(Boolean(data.connected))
        setGoogleEmail(data.email || '')
        setGoogleError('')
      } catch (err) {
        if (!cancelled) {
          setGoogleError(
            err.response?.data?.detail ||
              'Unable to check Google Calendar connection.',
          )
        }
      }
    }

    loadGoogleStatus()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const googleResult = searchParams.get('google')

    if (googleResult === 'connected') {
      setGoogleError('')
      setGoogleConnected(true)
      setSearchParams({}, { replace: true })
    } else if (googleResult === 'error') {
      const reason = searchParams.get('reason')
      const messages = {
        authorization_denied: 'Google Calendar authorization was denied.',
        invalid_callback: 'The Google authorization callback was incomplete.',
        invalid_state: 'The Google authorization expired or was invalid. Please reconnect.',
        user_not_found: 'Your MeetNote account could not be found.',
        missing_refresh_token: 'Google did not provide a refresh token. Please reconnect and grant consent.',
        token_exchange_failed: 'Google authorization failed. Check the backend logs and OAuth configuration.',
      }

      setGoogleError(
        messages[reason] ||
          'Google Calendar connection failed. Please try again.',
      )
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (!googleConnected) {
      setCalendarEvents([])
      return
    }

    let cancelled = false

    async function loadEvents() {
      setEventsLoading(true)
      setGoogleError('')

      try {
        const { data } = await client.get('/calendar/google/events', {
          params: { days: 30 },
        })

        if (!cancelled) {
          setCalendarEvents(
            Array.isArray(data.events) ? data.events : [],
          )
        }
      } catch (err) {
        if (!cancelled) {
          setGoogleError(
            err.response?.data?.detail ||
              'Unable to load Google Calendar events.',
          )
        }
      } finally {
        if (!cancelled) setEventsLoading(false)
      }
    }

    loadEvents()

    return () => {
      cancelled = true
    }
  }, [googleConnected])

  const previousMeetings = useMemo(() => {
    const query = search.trim().toLowerCase()

    return meetings.filter((meeting) => {
      const title = String(meeting.title ?? '').toLowerCase()
      const status = String(meeting.status ?? '').toLowerCase()

      const matchesSearch = title.includes(query)
      const isCompleted =
        status === 'completed' ||
        status === 'complete' ||
        Boolean(meeting.ended_at ?? meeting.endedAt)

      return matchesSearch && isCompleted
    })
  }, [meetings, search])

  const handleGoogleConnect = async () => {
    setGoogleLoading(true)
    setGoogleError('')

    try {
      const { data } = await client.get('/calendar/google/connect')
      const authorizationUrl =
        data.authorization_url || data.url

      if (!authorizationUrl) {
        throw new Error(
          'The backend did not return a Google authorization URL.',
        )
      }

      window.location.assign(authorizationUrl)
    } catch (err) {
      setGoogleError(
        err.response?.data?.detail ||
          err.message ||
          'Unable to start Google Calendar authorization.',
      )
      setGoogleLoading(false)
    }
  }

  const handleGoogleDisconnect = async () => {
    setGoogleLoading(true)
    setGoogleError('')

    try {
      await client.delete('/calendar/google/disconnect')
      setGoogleConnected(false)
      setGoogleEmail('')
      setCalendarEvents([])
    } catch (err) {
      setGoogleError(
        err.response?.data?.detail ||
          'Unable to disconnect Google Calendar.',
      )
    } finally {
      setGoogleLoading(false)
    }
  }

  const formatEventDate = (value) => {
    if (!value) return 'Date unavailable'

    const date = new Date(value)

    if (Number.isNaN(date.getTime())) return value

    return date.toLocaleString([], {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Calendar
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            View your previous meetings and upcoming calendar events.
          </p>
        </div>

        <Link
          to="/meetings"
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          View All Meetings
        </Link>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">
              Google Calendar
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Connect your Google Calendar to display upcoming events.
            </p>
            <p
              className={`mt-2 text-xs ${
                googleConnected
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-amber-700 dark:text-amber-400'
              }`}
            >
              {googleConnected
                ? `Connected${googleEmail ? `: ${googleEmail}` : ''}`
                : 'Not connected'}
            </p>
          </div>

          {googleConnected ? (
            <button
              type="button"
              onClick={handleGoogleDisconnect}
              disabled={googleLoading}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200"
            >
              {googleLoading ? 'Please wait...' : 'Disconnect'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleGoogleConnect}
              disabled={googleLoading}
              className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-wait disabled:opacity-60"
            >
              {googleLoading ? 'Connecting...' : 'Connect Google Calendar'}
            </button>
          )}
        </div>

        {googleError && (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
          >
            {googleError}
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex gap-2 border-b border-slate-200 px-4 pt-3 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('upcoming')}
            aria-pressed={activeTab === 'upcoming'}
            className={`border-b-2 px-3 py-3 text-sm font-medium ${
              activeTab === 'upcoming'
                ? 'border-teal-700 text-teal-800 dark:text-teal-400'
                : 'border-transparent text-slate-500'
            }`}
          >
            Upcoming Meetings
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('previous')}
            aria-pressed={activeTab === 'previous'}
            className={`border-b-2 px-3 py-3 text-sm font-medium ${
              activeTab === 'previous'
                ? 'border-teal-700 text-teal-800 dark:text-teal-400'
                : 'border-transparent text-slate-500'
            }`}
          >
            Previous Meetings
          </button>
        </div>

        {activeTab === 'upcoming' && (
          <div className="p-5">
            {eventsLoading && (
              <div className="flex justify-center py-10">
                <Spinner label="Loading upcoming calendar events" />
              </div>
            )}

            {!eventsLoading &&
              googleConnected &&
              calendarEvents.length === 0 && (
                <div className="px-5 py-10 text-center">
                  <div className="text-3xl" aria-hidden="true">🗓️</div>
                  <h3 className="mt-3 font-semibold text-slate-900 dark:text-slate-100">
                    No upcoming calendar events
                  </h3>
                  <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
                    No events were found in your primary Google Calendar over
                    the next 30 days.
                  </p>
                </div>
              )}

            {!eventsLoading && !googleConnected && (
              <div className="px-5 py-10 text-center">
                <div className="text-3xl" aria-hidden="true">🗓️</div>
                <h3 className="mt-3 font-semibold text-slate-900 dark:text-slate-100">
                  Connect Google Calendar
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
                  Connect your account above to see upcoming events and meeting
                  links here.
                </p>
              </div>
            )}

            {!eventsLoading && calendarEvents.length > 0 && (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {calendarEvents.map((event) => (
                  <article
                    key={event.id}
                    className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                        {event.title || 'Untitled event'}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {formatEventDate(event.start)}
                        {event.end
                          ? ` – ${formatEventDate(event.end)}`
                          : ''}
                      </p>
                      {event.location && (
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          {event.location}
                        </p>
                      )}
                    </div>

                    {event.meeting_link || event.html_link ? (
                      <a
                        href={event.meeting_link || event.html_link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex shrink-0 items-center justify-center rounded-lg border border-teal-700 px-4 py-2 text-sm font-medium text-teal-800 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-slate-800"
                      >
                        {event.meeting_link ? 'Join Meeting' : 'Open Event'}
                      </a>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'previous' && (
          <div className="p-4 sm:p-6">
            <label className="mb-5 block">
              <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Search previous meetings
              </span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by meeting title..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>

            {loading && (
              <div className="flex justify-center py-10">
                <Spinner label="Loading previous meetings" />
              </div>
            )}

            {!loading && error && (
              <EmptyState
                title={error}
                description="Check that the MeetNote API is running, then refresh this page."
              />
            )}

            {!loading && !error && previousMeetings.length === 0 && (
              <EmptyState
                title="No previous meetings found"
                description="Completed meetings from your account will appear here."
              />
            )}

            {!loading && !error && previousMeetings.length > 0 && (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {previousMeetings.map((meeting) => (
                  <article
                    key={meeting.id}
                    className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                        {meeting.title || 'Untitled meeting'}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {meeting.date || 'Date unavailable'}
                        {meeting.duration ? ` · ${meeting.duration}` : ''}
                      </p>
                    </div>

                    <Link
                      to={`/meetings/${encodeURIComponent(meeting.id)}`}
                      className="inline-flex shrink-0 items-center justify-center rounded-lg border border-teal-700 px-4 py-2 text-sm font-medium text-teal-800 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-slate-800"
                    >
                      View Meeting
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
