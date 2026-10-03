import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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
import Toast from '../components/ui/Toast.jsx'
import {
  actionItems,
  decisions,
  meetingPlatform,
  meetingSummary,
  transcript,
} from '../data/meetingIntelligence.js'
import { findMeeting } from '../data/meetings.js'

const playbackMessage = 'Recording playback will be available when the recorder is connected.'

export default function MeetingDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const meeting = findMeeting(id)
  const [tabState, setTabState] = useState({ id, tab: 'transcript' })
  const [notice, setNotice] = useState(null)
  const activeTab = tabState.id === id ? tabState.tab : 'transcript'

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

  if (!meeting) {
    return (
      <EmptyState
        title="Meeting not found"
        description="This meeting is not in your history."
        action={<Button onClick={() => navigate('/meetings')}>Back to Meetings</Button>}
      />
    )
  }

  return (
    <div className="space-y-6">
      <MeetingDetailHeader meeting={meeting} onPlay={playRecording} />
      <div className="grid items-start gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <MeetingMeta meeting={meeting} platform={meetingPlatform} />
        <div className="min-w-0">
          <MeetingTabs activeTab={activeTab} onChange={selectTab} />
          <Card
            className="mt-4"
            role="tabpanel"
            id={`meeting-panel-${activeTab}`}
            aria-labelledby={`meeting-tab-${activeTab}`}
          >
            {activeTab === 'transcript' ? <TranscriptView segments={transcript} /> : null}
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
