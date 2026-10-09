import { useEffect, useState } from 'react'
import { formatTranscriptTime } from '../../lib/formatMeeting.js'
import { speakerMark } from '../../lib/speakerLabel.js'
import Button from '../ui/Button.jsx'

export default function TranscriptSegment({
  segment,
  active = false,
  onSeek,
  onSave,
  onEditingChange,
  rowRef,
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(segment.text)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const endLabel = formatTranscriptTime(segment.endTime)

  useEffect(() => {
    if (!editing) return undefined
    onEditingChange?.(true)
    return () => onEditingChange?.(false)
  }, [editing, onEditingChange])

  function beginEdit() {
    setDraft(segment.text)
    setError('')
    setEditing(true)
  }

  function cancelEdit() {
    if (saving) return
    setDraft(segment.text)
    setError('')
    setEditing(false)
  }

  async function saveEdit() {
    const next = draft.trim()
    if (!next) {
      setError('Transcript text cannot be empty.')
      return
    }

    setSaving(true)
    setError('')
    try {
      await onSave(segment.id, next)
      setEditing(false)
    } catch {
      setError('Unable to save this transcript edit.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <article
      ref={rowRef}
      aria-current={active ? 'true' : undefined}
      className={`flex gap-3 rounded-lg px-2 py-3 transition-colors ${active ? 'bg-teal-50' : 'hover:bg-slate-50'}`}
    >
      {onSeek ? (
        <button
          type="button"
          onClick={() => onSeek(segment.startTime)}
          title={`${segment.time}–${endLabel}`}
          aria-label={`Jump to ${segment.time}`}
          className="w-12 shrink-0 pt-0.5 text-left font-mono text-xs text-slate-400 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          {segment.time}
        </button>
      ) : (
        <time dateTime={segment.time} className="w-12 shrink-0 pt-0.5 font-mono text-xs text-slate-400">
          {segment.time}
        </time>
      )}
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-semibold text-teal-800"
      >
        {speakerMark(segment.speaker)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-slate-900">
            {segment.speaker}
            {segment.source === 'manual' ? (
              <span className="ml-2 text-xs font-medium text-slate-400">Manual</span>
            ) : null}
          </p>
          {onSave && !editing ? (
            <button
              type="button"
              onClick={beginEdit}
              className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-white hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              Edit
            </button>
          ) : null}
        </div>
        {editing ? (
          <form
            className="mt-2"
            onSubmit={(event) => {
              event.preventDefault()
              saveEdit()
            }}
          >
            <label className="sr-only" htmlFor={`transcript-edit-${segment.id}`}>
              Transcript text
            </label>
            <textarea
              id={`transcript-edit-${segment.id}`}
              value={draft}
              rows={3}
              onChange={(event) => setDraft(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
            />
            {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
            <div className="mt-3 flex gap-2">
              <Button size="sm" type="submit" loading={saving}>
                Save
              </Button>
              <Button size="sm" variant="secondary" onClick={cancelEdit} disabled={saving}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <p className="mt-1 text-sm leading-6 text-slate-600">{segment.text}</p>
        )}
      </div>
    </article>
  )
}
