import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { getMeetingRecording } from '../../api/meetings.js'
import { formatTranscriptTime } from '../../lib/formatMeeting.js'
import Button from '../ui/Button.jsx'
import Card from '../ui/Card.jsx'
import Spinner from '../ui/Spinner.jsx'

const RecordingPlayer = forwardRef(function RecordingPlayer(
  { meetingId, hasRecording, durationSeconds = 0 },
  ref,
) {
  const sectionRef = useRef(null)
  const audioRef = useRef(null)
  const pendingPlay = useRef(false)
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState(hasRecording ? 'loading' : 'empty')
  const [src, setSrc] = useState('')
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [mediaDuration, setMediaDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const knownDuration = mediaDuration > 0 ? mediaDuration : durationSeconds

  useImperativeHandle(ref, () => ({
    play() {
      sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      if (!hasRecording || status === 'error') return
      const audio = audioRef.current
      if (status === 'ready' && audio) {
        audio.play().catch(() => setPlaying(false))
        return
      }
      pendingPlay.current = true
    },
  }), [hasRecording, status])

  useEffect(() => {
    if (!hasRecording) {
      pendingPlay.current = false
      return undefined
    }

    let active = true
    let objectUrl = ''
    const controller = new AbortController()

    // The audio element cannot attach the Axios Authorization header, so load the file as a blob.
    getMeetingRecording(meetingId, { signal: controller.signal })
      .then((response) => {
        if (!response.data || response.data.size === 0) {
          if (active) setStatus('error')
          return
        }
        const blob = response.data.type
          ? response.data
          : new Blob([response.data], { type: 'audio/webm' })
        const nextUrl = URL.createObjectURL(blob)
        if (!active) {
          URL.revokeObjectURL(nextUrl)
          return
        }
        objectUrl = nextUrl
        setSrc(nextUrl)
        setStatus('ready')
      })
      .catch((error) => {
        if (!active || error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError') return
        setStatus('error')
      })

    return () => {
      active = false
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [attempt, hasRecording, meetingId])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = volume
    if (status === 'ready' && pendingPlay.current) {
      pendingPlay.current = false
      audio.play().catch(() => setPlaying(false))
    }
  }, [src, status, volume])

  function retry() {
    setStatus('loading')
    setSrc('')
    setPlaying(false)
    setCurrentTime(0)
    setMediaDuration(0)
    setAttempt((value) => value + 1)
  }

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      audio.play().catch(() => setPlaying(false))
      return
    }
    audio.pause()
  }

  function seek(event) {
    const next = Number(event.target.value)
    setCurrentTime(next)
    if (audioRef.current) audioRef.current.currentTime = next
  }

  function changeVolume(event) {
    const next = Number(event.target.value)
    setVolume(next)
    if (audioRef.current) audioRef.current.volume = next
  }

  function syncFromAudio() {
    const audio = audioRef.current
    if (!audio) return
    setCurrentTime(audio.currentTime || 0)
    if (Number.isFinite(audio.duration) && audio.duration > 0) setMediaDuration(audio.duration)
  }

  function handleMediaError() {
    setStatus('error')
  }

  return (
    <div ref={sectionRef} className="scroll-mt-24">
      <Card id="meeting-recording" aria-labelledby="meeting-recording-title">
        <h3 id="meeting-recording-title" className="text-sm font-semibold text-slate-900">
          Recording
        </h3>
        {status === 'empty' ? <EmptyRecording /> : null}
        {status === 'loading' ? <LoadingRecording /> : null}
        {status === 'error' ? <RecordingError onRetry={retry} /> : null}
        {status === 'ready' && src ? (
          <div className="mt-4">
            <audio
              ref={audioRef}
              src={src}
              preload="metadata"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              onTimeUpdate={syncFromAudio}
              onLoadedMetadata={syncFromAudio}
              onDurationChange={syncFromAudio}
              onError={handleMediaError}
            />
            <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center">
              <Button
                size="icon"
                aria-label={playing ? 'Pause recording' : 'Play recording'}
                onClick={togglePlay}
              >
                {playing ? <PauseIcon /> : <PlayIcon />}
              </Button>
              <div className="w-full min-w-0 flex-1">
                <input
                  type="range"
                  min="0"
                  max={knownDuration > 0 ? knownDuration : 0}
                  step="0.1"
                  value={Math.min(currentTime, knownDuration > 0 ? knownDuration : 0)}
                  disabled={knownDuration <= 0}
                  aria-label="Playback position"
                  onChange={seek}
                  className="h-1.5 w-full cursor-pointer accent-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <div className="mt-2 flex items-center justify-between text-xs tabular-nums text-slate-500">
                  <span>{formatTranscriptTime(currentTime)}</span>
                  <span>{knownDuration > 0 ? formatTranscriptTime(knownDuration) : 'Duration unavailable'}</span>
                </div>
              </div>
              <label className="flex w-full items-center gap-2 sm:w-36">
                <VolumeIcon />
                <span className="sr-only">Volume</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  aria-label="Volume"
                  onChange={changeVolume}
                  className="h-1.5 w-full cursor-pointer accent-slate-900"
                />
              </label>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  )
})

export default RecordingPlayer

function EmptyRecording() {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
      <p className="text-sm font-medium text-slate-900">No recording yet</p>
      <p className="mt-1 text-sm text-slate-500">This meeting does not have an audio recording.</p>
    </div>
  )
}

function LoadingRecording() {
  return (
    <div className="mt-4 flex items-center gap-3 py-6 text-sm text-slate-600">
      <Spinner label="Loading recording" />
      <span>Loading recording</span>
    </div>
  )
}

function RecordingError({ onRetry }) {
  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center">
      <p className="text-sm font-medium text-slate-900">Unable to load recording</p>
      <p className="mt-1 text-sm text-slate-500">The audio file could not be retrieved.</p>
      <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path d="M8 6.5v11l9-5.5-9-5.5z" fill="currentColor" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path d="M7 5.5h3.2v13H7zm6.8 0H17v13h-3.2z" fill="currentColor" />
    </svg>
  )
}

function VolumeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500">
      <path
        d="M4 10h3.2L12 6.2v11.6L7.2 14H4v-4zm10.2-2.2a4.5 4.5 0 0 1 0 8.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
