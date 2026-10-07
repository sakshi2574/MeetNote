import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getActionItems } from '../api/actionItems.js'
import { getDecisions } from '../api/decisions.js'
import { getMeeting, updateMeeting } from '../api/meetings.js'
import { getTranscript, transcribeMeeting } from '../api/transcripts.js'
import ActionItems from '../components/intelligence/ActionItems.jsx'
import Decisions from '../components/intelligence/Decisions.jsx'
import Summary from '../components/intelligence/Summary.jsx'
import EditMeetingDialog from '../components/meetings/EditMeetingDialog.jsx'
import MeetingDetailHeader from '../components/meetings/MeetingDetailHeader.jsx'
import MeetingMeta from '../components/meetings/MeetingMeta.jsx'
import MeetingTabs from '../components/meetings/MeetingTabs.jsx'
import RecordingPlayer from '../components/meetings/RecordingPlayer.jsx'
import TranscriptView from '../components/transcript/TranscriptView.jsx'
import Button from '../components/ui/Button.jsx'
import Card from '../components/ui/Card.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import Toast from '../components/ui/Toast.jsx'
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
  const generatingMeetingIdRef = useRef(null)
  const requestTokenRef = useRef(0)
  const savingRef = useRef(false)
  const [result, setResult] = useState(null)
  const [tabState, setTabState] = useState({ id, tab: 'transcript' })
  const [generatingMeetingId, setGeneratingMeetingId] = useState(null)
  const [notice, setNotice] = useState(null)
  const [editorMeetingId, setEditorMeetingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const activeTab = tabState.id === id ? tabState.tab : 'transcript'
  const generating = generatingMeetingId === id
  const visibleNotice = notice?.meetingId === id ? notice : null
  const editing = editorMeetingId === id
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

  useEffect(() => {
    if (!notice) return undefined

    const timer = window.setTimeout(() => setNotice(null), 4200)
    return () => window.clearTimeout(timer)
  }, [notice])

  function selectTab(tab) {
    setTabState({ id, tab })
  }

  function playRecording() {
    recordingRef.current?.play()
  }

  function dismissNotice() {
    setNotice(null)
  }

  function openEdit() {
    setEditError('')
    setEditorMeetingId(id)
  }

  function cancelEdit() {
    if (savingRef.current) return
    setEditorMeetingId(null)
    setEditError('')
  }

  async function saveEdit(values) {
    if (savingRef.current) return

    savingRef.current = true
    setSaving(true)
    setEditError('')

    try {
      const response = await updateMeeting(id, values)
      const updated = formatMeeting(response.data)
      setResult((current) => {
        if (!current || current.id !== id) return current
        return { ...current, meeting: updated }
      })
      setEditorMeetingId(null)
      setNotice({
        id: Date.now(),
        meetingId: id,
        tone: 'success',
        message: 'Meeting updated successfully.',
      })
    } catch {
      setEditError('Unable to update this meeting.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  function generateTranscript() {
    if (!meeting?.hasRecording) return

    if (generatingMeetingIdRef.current != null) {
      if (generatingMeetingIdRef.current !== id) {
        setNotice({
          id: Date.now(),
          meetingId: id,
          tone: 'error',
          message: 'Transcription is already in progress.',
        })
      }
      return
    }

    const meetingId = id
    const token = requestTokenRef.current + 1
    requestTokenRef.current = token
    generatingMeetingIdRef.current = meetingId
    setGeneratingMeetingId(meetingId)
    setNotice(null)
    setTabState({ id: meetingId, tab: 'transcript' })

    const isCurrent = () =>
      requestTokenRef.current === token && generatingMeetingIdRef.current === meetingId

    const finish = (nextNotice) => {
      if (!isCurrent()) return
      generatingMeetingIdRef.current = null
      setGeneratingMeetingId(null)
      setNotice(nextNotice)
    }

    transcribeMeeting(meetingId)
      .then((created) => {
        const createdSegments = readTranscriptSegments(created.data)
        return getTranscript(meetingId)
          .then((loaded) => readTranscriptSegments(loaded.data) ?? createdSegments)
          .catch(() => createdSegments)
      })
      .then((segments) => {
        if (!isCurrent()) return
        if (!segments) {
          finish({
            id: Date.now(),
            meetingId,
            tone: 'error',
            message: 'Transcript was generated, but it could not be loaded.',
          })
          return
        }

        setResult((currentResult) => {
          if (currentResult?.id !== meetingId) return currentResult
          return {
            ...currentResult,
            segments: segments.map(formatTranscriptSegment),
            transcriptError: '',
          }
        })
        setTabState({ id: meetingId, tab: 'transcript' })
        finish({
          id: Date.now(),
          meetingId,
          tone: 'success',
          message: 'Transcript generated.',
        })
      })
      .catch((error) => {
        finish({
          id: Date.now(),
          meetingId,
          tone: 'error',
          message: transcriptionErrorMessage(error),
        })
      })
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
      <MeetingDetailHeader
        meeting={meeting}
        onEdit={openEdit}
        onPlay={playRecording}
        onGenerateTranscript={generateTranscript}
        generatingTranscript={generating}
      />
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
            {activeTab === 'transcript' && generating ? (
              <p className="mb-4 flex items-center gap-2 text-sm text-slate-600" role="status">
                <Spinner label="Generating transcript" />
                Generating transcript...
              </p>
            ) : null}
            {activeTab === 'transcript' && transcriptError && !generating ? (
              <p className="text-sm text-slate-600">{transcriptError}</p>
            ) : null}
            {activeTab === 'transcript' && !transcriptError && segments.length === 0 && !generating ? (
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
      {editing ? (
        <EditMeetingDialog
          meeting={meeting}
          saving={saving}
          error={editError}
          onSave={saveEdit}
          onCancel={cancelEdit}
        />
      ) : null}
      {visibleNotice ? (
        <Toast
          key={visibleNotice.id}
          message={visibleNotice.message}
          tone={visibleNotice.tone}
          onClose={dismissNotice}
        />
      ) : null}
    </div>
  )
}

function readTranscriptSegments(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.segments)) return data.segments
  return null
}

function transcriptionErrorMessage(error) {
  const status = error.response?.status
  const detail = typeof error.response?.data?.detail === 'string' ? error.response.data.detail : ''
  const inProgress = status === 409 || /already in progress/i.test(detail)

  if (inProgress) return 'Transcription is already in progress.'
  if (status === 404) return 'A recording is required before a transcript can be generated.'
  if (status === 502) return 'Transcription failed. Please try again.'
  if (status === 500) return 'The transcript could not be saved. Please try again.'
  return 'Unable to generate the transcript. Please try again.'
}
