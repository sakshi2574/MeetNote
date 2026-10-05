import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getMeeting } from '../api/meetings.js'
import { getTranscript } from '../api/transcripts.js'
import ActionItems from '../components/intelligence/ActionItems.jsx'
import Decisions from '../components/intelligence/Decisions.jsx'
import Summary from '../components/intelligence/Summary.jsx'
import MeetingDetailHeader from '../components/meetings/MeetingDetailHeader.jsx'
import MeetingMeta from '../components/meetings/MeetingMeta.jsx'
import MeetingTabs from '../components/meetings/MeetingTabs.jsx'
import TranscriptView from '../components/transcript/TranscriptView.jsx'
import Button from '../components/ui/Button.jsx'
import Card from '../components/ui/Card.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import Toast from '../components/ui/Toast.jsx'
import { actionItems, decisions, meetingSummary } from '../data/meetingIntelligence.js'
import { formatMeeting, formatTranscriptSegment } from '../lib/formatMeeting.js'

const playbackMessage = 'Recording playback will be available when the recorder is connected.'

export default function MeetingDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [result, setResult] = useState(null)
  const [tabState, setTabState] = useState({ id, tab: 'transcript' })
  const [notice, setNotice] = useState(null)
  const activeTab = tabState.id === id ? tabState.tab : 'transcript'
  const current = result?.id === id ? result : null
  const loading = current == null
  const meeting = current?.meeting ?? null
  const segments = current?.segments ?? []
  const meetingError = current?.meetingError ?? ''
  const transcriptError = current?.transcriptError ?? ''

  useEffect(() => {
    let cancelled = false

    getMeeting(id)
      .then((response) => {
        if (cancelled) return null
        const formattedMeeting = formatMeeting(response.data)
        return getTranscript(id)
          .then((transcriptResponse) => ({
            meeting: formattedMeeting,
            segments: transcriptResponse.data.map(formatTranscriptSegment),
            meetingError: '',
            transcriptError: '',
          }))
          .catch(() => ({
            meeting: formattedMeeting,
            segments: [],
            meetingError: '',
            transcriptError: 'Unable to load transcript',
          }))
      })
      .then((payload) => {
        if (cancelled || !payload) return
        setResult({ id, ...payload })
      })
      .catch((error) => {
        if (cancelled) return
        setResult({
          id,
          meeting: null,
          segments: [],
          meetingError: error.response?.status === 404 ? 'not-found' : 'Unable to load meeting',
          transcriptError: '',
        })
      })

    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (!notice) return undefined

    const timer = window.setTimeout(() => setNotice(null), 4200)
    return () => window.clearTimeout(timer)
  }, [notice])

  function selectTab(tab) {
    setTabState({ id, tab })
  }

  function playRecording() {
    setNotice({ id: Date.now(), message: playbackMessage })
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading meeting" />
      </div>
    )
  }

  if (meetingError === 'not-found') {
    return (
      <EmptyState
        title="Meeting not found"
        description="This meeting is not in your history."
        action={<Button onClick={() => navigate('/meetings')}>Back to Meetings</Button>}
      />
    )
  }

  if (meetingError || !meeting) {
    return (
      <EmptyState
        title="Unable to load meeting"
        description="Check that the MeetNote API is running, then try again."
        action={<Button onClick={() => navigate('/meetings')}>Back to Meetings</Button>}
      />
    )
  }

  return (
    <div className="space-y-6">
      <MeetingDetailHeader meeting={meeting} onPlay={playRecording} />
      <div className="grid items-start gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <MeetingMeta meeting={meeting} platform={meeting.platform} />
        <div className="min-w-0">
          <MeetingTabs activeTab={activeTab} onChange={selectTab} />
          <Card
            className="mt-4"
            role="tabpanel"
            id={`meeting-panel-${activeTab}`}
            aria-labelledby={`meeting-tab-${activeTab}`}
          >
            {activeTab === 'transcript' && transcriptError ? (
              <p className="text-sm text-slate-600">{transcriptError}</p>
            ) : null}
            {activeTab === 'transcript' && !transcriptError && segments.length === 0 ? (
              <p className="text-sm text-slate-600">No transcript yet.</p>
            ) : null}
            {activeTab === 'transcript' && !transcriptError && segments.length > 0 ? (
              <TranscriptView segments={segments} />
            ) : null}
            {activeTab === 'summary' ? <Summary summary={meetingSummary} /> : null}
            {activeTab === 'actions' ? <ActionItems items={actionItems} /> : null}
            {activeTab === 'decisions' ? <Decisions decisions={decisions} /> : null}
          </Card>
        </div>
      </div>
      {notice ? <Toast key={notice.id} message={notice.message} onClose={() => setNotice(null)} /> : null}
    </div>
  )
}
