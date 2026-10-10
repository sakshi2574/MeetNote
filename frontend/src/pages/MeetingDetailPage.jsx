import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getActionItems } from '../api/actionItems.js'
import { getDecisions } from '../api/decisions.js'
import {
  getMeetingIntelligence,
  regenerateMeetingIntelligence,
  updateMeetingSummary,
} from '../api/intelligence.js'
import { getMeeting, updateMeeting } from '../api/meetings.js'
import { getTranscript, getTranscriptionStatus, retryTranscription, updateTranscriptSegment } from '../api/transcripts.js'
import ActionItems from '../components/intelligence/ActionItems.jsx'
import Decisions from '../components/intelligence/Decisions.jsx'
import Summary from '../components/intelligence/Summary.jsx'
import EditMeetingDialog from '../components/meetings/EditMeetingDialog.jsx'
import ExportMeetingDialog from '../components/meetings/ExportMeetingDialog.jsx'
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
import {
  formatActionItem,
  formatDecision,
  formatMeeting,
  formatTranscriptSegment,
} from '../lib/formatMeeting.js'
import {
  formatIntelligence,
  INTELLIGENCE_POLL_MS,
  intelligenceView,
  shouldPollIntelligence,
} from '../lib/intelligenceStatus.js'
import {
  shouldPollTranscription,
  shouldRefreshTranscript,
  TRANSCRIPTION_POLL_MS,
  transcriptionStatusView,
} from '../lib/transcriptionStatus.js'

export default function MeetingDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const recordingRef = useRef(null)
  const savingRef = useRef(false)
  const transcriptEditingRef = useRef(false)
  const deferredTranscriptRefresh = useRef(false)
  const insightListsStale = useRef(false)
  const [result, setResult] = useState(null)
  const [tabState, setTabState] = useState({ id, tab: 'transcript' })
  const [transcription, setTranscription] = useState({ id, snapshot: null })
  const [pollGeneration, setPollGeneration] = useState(0)
  const [insights, setInsights] = useState({ id, data: null, error: '' })
  const [insightPoll, setInsightPoll] = useState(0)
  const [regeneratingId, setRegeneratingId] = useState(null)
  const [notice, setNotice] = useState(null)
  const [editorMeetingId, setEditorMeetingId] = useState(null)
  const [exportMeetingId, setExportMeetingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [playback, setPlayback] = useState({ id, time: 0 })
  const playbackTime = playback.id === id ? playback.time : 0
  const activeTab = tabState.id === id ? tabState.tab : 'transcript'
  const transcriptionSnapshot = transcription.id === id ? transcription.snapshot : null
  const transcriptionView = transcriptionStatusView(transcriptionSnapshot)
  const currentInsights = insights.id === id ? insights : { data: null, error: '' }
  const insightView = intelligenceView(currentInsights.data, transcriptionSnapshot?.status ?? null)
  const regenerating = regeneratingId === id
  const visibleNotice = notice?.meetingId === id ? notice : null
  const editing = editorMeetingId === id
  const exportOpen = exportMeetingId === id
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

  useEffect(() => {
    if (!meeting?.hasRecording) return undefined
    let cancelled = false
    let timer = 0
    let failures = 0
    let transcriptionWasBusy = false

    function applySegments(rows) {
      if (transcriptEditingRef.current) {
        deferredTranscriptRefresh.current = true
        return
      }
      deferredTranscriptRefresh.current = false
      setResult((currentResult) => {
        if (!currentResult || currentResult.id !== id) return currentResult
        return {
          ...currentResult,
          segments: rows.map(formatTranscriptSegment),
          transcriptError: '',
        }
      })
    }

    async function tick() {
      try {
        const response = await getTranscriptionStatus(id)
        if (cancelled) return
        const snapshot = response.data
        setTranscription({ id, snapshot })
        if (shouldPollTranscription(snapshot?.status)) transcriptionWasBusy = true
        if (snapshot?.status === 'completed' && transcriptionWasBusy) {
          transcriptionWasBusy = false
          insightListsStale.current = true
          setInsightPoll((value) => value + 1)
        }
        if (shouldRefreshTranscript(snapshot?.status, transcriptEditingRef.current)) {
          const loaded = await getTranscript(id)
          if (cancelled) return
          const rows = readTranscriptSegments(loaded.data)
          if (rows) applySegments(rows)
          return
        }
        if (snapshot?.status === 'completed') {
          deferredTranscriptRefresh.current = true
          return
        }
        failures = 0
        if (shouldPollTranscription(snapshot?.status)) {
          timer = window.setTimeout(tick, TRANSCRIPTION_POLL_MS)
        }
      } catch {
        failures += 1
        if (!cancelled && failures < 3) timer = window.setTimeout(tick, TRANSCRIPTION_POLL_MS)
      }
    }

    tick()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [id, meeting?.hasRecording, pollGeneration])

  useEffect(() => {
    let cancelled = false
    let timer = 0
    let failures = 0
    let sawProcessing = false

    async function tick() {
      try {
        const response = await getMeetingIntelligence(id)
        if (cancelled) return
        const data = formatIntelligence(response.data)
        setInsights({ id, data, error: '' })
        failures = 0
        if (shouldPollIntelligence(data.status)) {
          sawProcessing = true
          timer = window.setTimeout(tick, INTELLIGENCE_POLL_MS)
          return
        }
        if ((sawProcessing || insightListsStale.current) && data.status !== null) {
          insightListsStale.current = false
          const lists = await loadIntelligenceLists(id)
          if (!cancelled) applyIntelligenceLists(id, lists)
        }
      } catch {
        if (cancelled) return
        failures += 1
        if (failures < 3) {
          timer = window.setTimeout(tick, INTELLIGENCE_POLL_MS)
        } else {
          setInsights((value) =>
            value.id === id ? { ...value, error: 'Unable to load the summary.' } : { id, data: null, error: 'Unable to load the summary.' },
          )
        }
      }
    }

    tick()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [id, insightPoll])

  function applyIntelligenceLists(meetingId, lists) {
    setResult((currentResult) => {
      if (!currentResult || currentResult.id !== meetingId) return currentResult
      return { ...currentResult, ...lists }
    })
  }

  async function runInsights(replaceSummary) {
    if (regeneratingId != null) return
    const meetingId = id
    setRegeneratingId(meetingId)
    try {
      const response = await regenerateMeetingIntelligence(meetingId, { replaceSummary })
      const data = formatIntelligence(response.data)
      setInsights({ id: meetingId, data, error: '' })
      applyIntelligenceLists(meetingId, await loadIntelligenceLists(meetingId))
      if (data.status === 'failed') {
        setNotice({ id: Date.now(), meetingId, tone: 'error', message: data.error || 'Meeting insights could not be generated.' })
      }
    } catch (error) {
      const busy = error.response?.status === 409
      setNotice({
        id: Date.now(),
        meetingId,
        tone: 'error',
        message: busy ? 'Meeting insights are already being generated.' : 'Unable to generate meeting insights.',
      })
      if (busy) setInsightPoll((value) => value + 1)
    } finally {
      setRegeneratingId(null)
    }
  }

  async function saveSummary(text) {
    const response = await updateMeetingSummary(id, text)
    setInsights({ id, data: formatIntelligence(response.data), error: '' })
  }

  function replaceActionItem(updated) {
    setResult((currentResult) => {
      if (!currentResult || currentResult.id !== id) return currentResult
      return {
        ...currentResult,
        actionItems: currentResult.actionItems.map((item) => (item.id === updated.id ? updated : item)),
      }
    })
  }

  function replaceDecision(updated) {
    setResult((currentResult) => {
      if (!currentResult || currentResult.id !== id) return currentResult
      return {
        ...currentResult,
        decisions: currentResult.decisions.map((item) => (item.id === updated.id ? updated : item)),
      }
    })
  }

  function selectTab(tab) {
    setTabState({ id, tab })
  }

  function playRecording() {
    recordingRef.current?.play()
  }

  function seekRecording(seconds) {
    recordingRef.current?.seek(seconds)
  }

  function handleTranscriptEditing(isEditing) {
    transcriptEditingRef.current = isEditing
    if (isEditing || !deferredTranscriptRefresh.current) return
    deferredTranscriptRefresh.current = false
    getTranscript(id)
      .then((loaded) => {
        const rows = readTranscriptSegments(loaded.data)
        if (!rows || transcriptEditingRef.current) {
          if (transcriptEditingRef.current) deferredTranscriptRefresh.current = true
          return
        }
        setResult((currentResult) => {
          if (!currentResult || currentResult.id !== id) return currentResult
          return {
            ...currentResult,
            segments: rows.map(formatTranscriptSegment),
            transcriptError: '',
          }
        })
      })
      .catch(() => {})
  }

  async function retryFailedTranscription() {
    try {
      const response = await retryTranscription(id)
      setTranscription({ id, snapshot: response.data })
      setPollGeneration((value) => value + 1)
    } catch {
      setNotice({
        id: Date.now(),
        meetingId: id,
        tone: 'error',
        message: 'Unable to retry transcription.',
      })
    }
  }

  async function saveTranscriptSegment(segmentId, text) {
    const response = await updateTranscriptSegment(segmentId, { text })
    const updated = formatTranscriptSegment(response.data)
    setResult((currentResult) => {
      if (!currentResult || currentResult.id !== id) return currentResult
      return {
        ...currentResult,
        segments: currentResult.segments.map((segment) =>
          segment.id === segmentId ? updated : segment,
        ),
      }
    })
  }

  function dismissNotice() {
    setNotice(null)
  }

  function openEdit() {
    setEditError('')
    setEditorMeetingId(id)
  }

  function openExport() {
    setExportMeetingId(id)
  }

  function closeExport() {
    setExportMeetingId(null)
  }

  function finishExport(filename) {
    setExportMeetingId(null)
    setNotice({ id: Date.now(), meetingId: id, tone: 'success', message: `Export downloaded: ${filename}` })
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
      <MeetingDetailHeader meeting={meeting} onEdit={openEdit} onExport={openExport} onPlay={playRecording} />
      <RecordingPlayer
        key={id}
        ref={recordingRef}
        meetingId={id}
        hasRecording={meeting.hasRecording}
        durationSeconds={meeting.durationSeconds}
        onTimeUpdate={(time) => setPlayback({ id, time })}
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
            {activeTab === 'transcript' && transcriptionView.message ? (
              <div className="mb-4 flex flex-wrap items-center gap-3" role="status">
                {transcriptionView.busy ? <Spinner label={transcriptionView.message} /> : null}
                <p className="text-sm text-slate-600 dark:text-slate-300">{transcriptionView.message}</p>
                {transcriptionView.failed ? (
                  <Button variant="secondary" size="sm" onClick={retryFailedTranscription}>
                    Retry transcription
                  </Button>
                ) : null}
              </div>
            ) : null}
            {activeTab === 'transcript' && transcriptError ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">{transcriptError}</p>
            ) : null}
            {activeTab === 'transcript' && !transcriptError && segments.length === 0 && !transcriptionView.busy && !transcriptionView.failed ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">No transcript yet.</p>
            ) : null}
            {activeTab === 'transcript' && !transcriptError && segments.length > 0 ? (
              <TranscriptView
                segments={segments}
                playbackTime={playbackTime}
                onSeek={meeting.hasRecording ? seekRecording : undefined}
                onSaveSegment={saveTranscriptSegment}
                onEditingChange={handleTranscriptEditing}
              />
            ) : null}
            {activeTab === 'summary' ? (
              <Summary
                intelligence={currentInsights.data}
                view={insightView}
                loadError={currentInsights.error}
                regenerating={regenerating}
                canGenerate={segments.length > 0}
                onRegenerate={() => runInsights(false)}
                onReplaceSummary={() => runInsights(true)}
                onSaveSummary={saveSummary}
                onSeek={meeting.hasRecording ? seekRecording : undefined}
              />
            ) : null}
            {activeTab === 'actions' && actionItemsError ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">{actionItemsError}</p>
            ) : null}
            {activeTab === 'actions' && !actionItemsError && actionItems.length === 0 ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">No action items yet.</p>
            ) : null}
            {activeTab === 'actions' && !actionItemsError && actionItems.length > 0 ? (
              <ActionItems
                items={actionItems}
                onUpdated={replaceActionItem}
                onSeek={meeting.hasRecording ? seekRecording : undefined}
              />
            ) : null}
            {activeTab === 'decisions' && decisionsError ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">{decisionsError}</p>
            ) : null}
            {activeTab === 'decisions' && !decisionsError && decisions.length === 0 ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">No decisions yet.</p>
            ) : null}
            {activeTab === 'decisions' && !decisionsError && decisions.length > 0 ? (
              <Decisions
                decisions={decisions}
                onUpdated={replaceDecision}
                onSeek={meeting.hasRecording ? seekRecording : undefined}
              />
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
      {exportOpen ? (
        <ExportMeetingDialog
          meeting={{ id, title: meeting.title }}
          onClose={closeExport}
          onExported={finishExport}
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

async function loadIntelligenceLists(meetingId) {
  const [actions, decisionList] = await Promise.all([
    getActionItems(meetingId)
      .then((response) => ({ actionItems: response.data.map(formatActionItem), actionItemsError: '' }))
      .catch(() => ({ actionItems: [], actionItemsError: 'Unable to load action items' })),
    getDecisions(meetingId)
      .then((response) => ({ decisions: response.data.map(formatDecision), decisionsError: '' }))
      .catch(() => ({ decisions: [], decisionsError: 'Unable to load decisions' })),
  ])
  return { ...actions, ...decisionList }
}

function readTranscriptSegments(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.segments)) return data.segments
  return null
}