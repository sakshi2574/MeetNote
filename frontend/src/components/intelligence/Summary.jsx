import { useState } from 'react'
import Badge from '../ui/Badge.jsx'
import Button from '../ui/Button.jsx'
import ConfirmDialog from '../ui/ConfirmDialog.jsx'
import Spinner from '../ui/Spinner.jsx'
import TimeLink from './TimeLink.jsx'

export default function Summary({
  intelligence,
  view,
  loadError = '',
  regenerating = false,
  canGenerate = false,
  onRegenerate,
  onReplaceSummary,
  onSaveSummary,
  onSeek,
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmingReplace, setConfirmingReplace] = useState(false)
  const summary = intelligence?.summary ?? ''
  const keyPoints = intelligence?.keyPoints ?? []
  const edited = intelligence?.summarySource === 'manual'
  const busy = view.state === 'processing' || view.state === 'waiting' || regenerating

  function beginEdit() {
    setDraft(summary)
    setError('')
    setEditing(true)
  }

  async function saveEdit() {
    const next = draft.trim()
    if (!next) {
      setError('Summary cannot be empty.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSaveSummary(next)
      setEditing(false)
    } catch {
      setError('Unable to save the summary.')
    } finally {
      setSaving(false)
    }
  }

  if (loadError && !intelligence) {
    return <p className="text-slate-600 dark:text-slate-300">{loadError}</p>
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Meeting Summary</h3>
          {edited ? <Badge>Edited</Badge> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {summary && !editing ? (
            <Button size="sm" variant="secondary" onClick={beginEdit} disabled={busy}>
              Edit summary
            </Button>
          ) : null}
          {canGenerate && !editing ? (
            <Button size="sm" variant="secondary" onClick={onRegenerate} loading={regenerating} disabled={busy}>
              {view.state === 'idle' ? 'Generate summary' : 'Regenerate'}
            </Button>
          ) : null}
        </div>
      </div>

      {view.state === 'waiting' || view.state === 'processing' || regenerating ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300" role="status">
          <Spinner label={regenerating ? 'Generating summary and insights' : view.message} />
          {regenerating ? 'Generating summary and insights' : view.message}
        </p>
      ) : null}
      {view.state === 'failed' && !regenerating ? (
        <p className="mt-3 text-sm text-rose-700" role="alert">
          {view.message}
        </p>
      ) : null}
      {(view.state === 'insufficient' || view.state === 'idle') && !summary && !regenerating ? (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{view.message}</p>
      ) : null}

      {editing ? (
        <form
          className="mt-3 max-w-3xl"
          onSubmit={(event) => {
            event.preventDefault()
            saveEdit()
          }}
        >
          <label className="sr-only" htmlFor="meeting-summary-edit">
            Meeting summary
          </label>
          <textarea
            id="meeting-summary-edit"
            value={draft}
            rows={5}
            onChange={(event) => setDraft(event.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-600 dark:focus:ring-slate-700"
          />
          {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
          <div className="mt-3 flex gap-2">
            <Button size="sm" type="submit" loading={saving}>
              Save
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </form>
      ) : summary ? (
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">{summary}</p>
      ) : null}

      {edited && !editing && canGenerate ? (
        <button
          type="button"
          onClick={() => setConfirmingReplace(true)}
          disabled={busy}
          className="mt-2 text-xs font-medium text-slate-500 underline-offset-2 dark:text-slate-400 dark:hover:text-slate-200 hover:text-slate-800 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
        >
          Replace with a generated summary
        </button>
      ) : null}

      {keyPoints.length > 0 ? (
        <div className="mt-6 border-t border-slate-100 dark:border-slate-700 pt-6">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Key Discussion Points</h3>
          <ul className="mt-3 space-y-2">
            {keyPoints.map((point) => (
              <li key={point.id} className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-300">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-700" aria-hidden="true" />
                <span className="min-w-0 flex-1">{point.text}</span>
                {point.timestamp != null ? (
                  <TimeLink seconds={point.timestamp} onSeek={onSeek} />
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {summary || keyPoints.length > 0 ? (
        <p className="mt-6 text-xs text-slate-400">
          Extracted from transcript sentences by keyword and phrase rules. No AI model is used.
        </p>
      ) : null}

      {confirmingReplace ? (
        <ConfirmDialog
          title="Replace your summary?"
          description="Your edited summary will be replaced with one extracted from the current transcript."
          confirmLabel="Replace"
          onCancel={() => setConfirmingReplace(false)}
          onConfirm={() => {
            setConfirmingReplace(false)
            onReplaceSummary()
          }}
        />
      ) : null}
    </div>
  )
}