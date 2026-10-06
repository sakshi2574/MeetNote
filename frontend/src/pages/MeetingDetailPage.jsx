import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getActionItems } from '../api/actionItems.js'
import { getDecisions } from '../api/decisions.js'
import { getMeeting } from '../api/meetings.js'
import { getTranscript } from '../api/transcripts.js'
import ActionItems from '../components/intelligence/ActionItems.jsx'
import Decisions from '../components/intelligence/Decisions.jsx'
import Summary from '../components/intelligence/Summary.jsx'
import MeetingDetailHeader from '../components/meetings/MeetingDetailHeader.jsx'
import MeetingMeta from '../components/meetings/MeetingMeta.jsx'
import MeetingTabs from '../components/meetings/MeetingTabs.jsx'
import RecordingPlayer from '../components/meetings/RecordingPlayer.jsx'
import TranscriptView from '../components/transcript/TranscriptView.jsx'
import Button from '../components/ui/Button.jsx'
import Card from '../components/ui/Card.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import { meetingSummary } from '../data/meetingIntelligence.js'
import {
  formatActionItem,
  formatDecision,
  formatMeeting,
  formatTranscriptSegment,
} from '../lib/formatMeeting.js'

export default function MeetingDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const recordingRef = useRef(null)
  const [result, setResult] = useState(null)
  const [tabState, setTabState] = useState({ id, tab: 'transcript' })
  const activeTab = tabState.id === id ? tabState.tab : 'transcript'
  const current = result?.id === id ? result : null
  const loading = current == null
  const meeting = current?.meeting ?? null
  const segments = current?.segments ?? []
  const actionItems = current?.actionItems ?? []
  const decisions = current?.decisions ?? []
  const meetingError = current?.meetingError ?? ''
  const transcriptError = current?.transcriptError ?? ''
  const actionItemsError = current?.actionItemsError ?? ''
  const decisionsError = current?.decisionsError ?? ''

  useEffect(() => {
    let cancelled = false

    getMeeting(id)
      .then((response) => {
        if (cancelled) return null
        const formattedMeeting = formatMeeting(response.data)
        return Promise.all([
          getTranscript(id)
            .then((transcriptResponse) => ({
              segments: transcriptResponse.data.map(formatTranscriptSegment),
              transcriptError: '',
            }))
            .catch(() => ({ segments: [], transcriptError: 'Unable to load transcript' })),
          getActionItems(id)
            .then((actionResponse) => ({
              actionItems: actionResponse.data.map(formatActionItem),
              actionItemsError: '',
            }))
            .catch(() => ({ actionItems: [], actionItemsError: 'Unable to load action items' })),
          getDecisions(id)
            .then((decisionResponse) => ({
              decisions: decisionResponse.data.map(formatDecision),
              decisionsError: '',
            }))
            .catch(() => ({ decisions: [], decisionsError: 'Unable to load decisions' })),
        ]).then(([transcript, actions, decisionList]) => ({
          meeting: formattedMeeting,
          meetingError: '',
          ...transcript,
          ...actions,
          ...decisionList,
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
          actionItems: [],
          decisions: [],
          meetingError: error.response?.status === 404 ? 'not-found' : 'Unable to load meeting',
          transcriptError: '',
          actionItemsError: '',
          decisionsError: '',
        })
      })

    return () => {
      cancelled = true
    }
  }, [id])

  function selectTab(tab) {
    setTabState({ id, tab })
  }

  function playRecording() {
    recordingRef.current?.play()
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
      <RecordingPlayer
        key={id}
        ref={recordingRef}
        meetingId={id}
        hasRecording={meeting.hasRecording}
        durationSeconds={meeting.durationSeconds}
      />
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
            {activeTab === 'actions' && actionItemsError ? (
              <p className="text-sm text-slate-600">{actionItemsError}</p>
            ) : null}
            {activeTab === 'actions' && !actionItemsError && actionItems.length === 0 ? (
              <p className="text-sm text-slate-600">No action items yet.</p>
            ) : null}
            {activeTab === 'actions' && !actionItemsError && actionItems.length > 0 ? (
              <ActionItems items={actionItems} />
            ) : null}
            {activeTab === 'decisions' && decisionsError ? (
              <p className="text-sm text-slate-600">{decisionsError}</p>
            ) : null}
            {activeTab === 'decisions' && !decisionsError && decisions.length === 0 ? (
              <p className="text-sm text-slate-600">No decisions yet.</p>
            ) : null}
            {activeTab === 'decisions' && !decisionsError && decisions.length > 0 ? (
              <Decisions decisions={decisions} />
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  )
}
