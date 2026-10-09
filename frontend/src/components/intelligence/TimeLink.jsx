import { formatTranscriptTime } from '../../lib/formatMeeting.js'

export default function TimeLink({ seconds, onSeek }) {
  const label = formatTranscriptTime(seconds)
  if (!onSeek) {
    return <span className="shrink-0 font-mono text-xs text-slate-400">{label}</span>
  }
  return (
    <button
      type="button"
      onClick={() => onSeek(seconds)}
      aria-label={`Jump to ${label}`}
      className="shrink-0 rounded font-mono text-xs text-slate-400 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
    >
      {label}
    </button>
  )
}
