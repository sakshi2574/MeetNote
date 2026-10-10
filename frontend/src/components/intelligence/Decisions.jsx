import { useState } from 'react'

import { updateDecision } from '../../api/decisions.js'

import { formatDecision } from '../../lib/formatMeeting.js'

import Button from '../ui/Button.jsx'

import TimeLink from './TimeLink.jsx'

export default function Decisions({ decisions, onUpdated, onSeek }) {
  const [editingId, setEditingId] = useState(null)

  async function saveDecision(id, text) {
    const response = await updateDecision(id, { decision: text })

    onUpdated?.(formatDecision(response.data))

    setEditingId(null)
  }

  return (
    <ul className="space-y-4">
      {decisions.map((decision) => (
        <li
          key={decision.id}
          className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"
        >
          {editingId === decision.id ? (
            <DecisionEditor
              decision={decision}
              onSave={saveDecision}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div className="flex gap-3">
              <div className="min-w-0 flex-1 border-l-2 border-teal-700 pl-3">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {decision.text}
                </p>

                <p className="mt-2 flex items-center gap-1 font-mono text-xs text-slate-400 dark:text-slate-400">
                  Timestamp: <TimeLink seconds={decision.timestamp} onSeek={onSeek} />
                </p>

                {decision.context ? (
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {decision.context}
                  </p>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => setEditingId(decision.id)}
                className="h-fit shrink-0 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              >
                Edit
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

function DecisionEditor({ decision, onSave, onCancel }) {
  const [draft, setDraft] = useState(decision.text)

  const [saving, setSaving] = useState(false)

  const [error, setError] = useState('')

  async function submit() {
    const next = draft.trim()

    if (!next) {
      setError('Decision cannot be empty.')
      return
    }

    setSaving(true)

    setError('')

    try {
      await onSave(decision.id, next)
    } catch {
      setError('Unable to save this decision.')
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <label className="sr-only" htmlFor={`decision-edit-${decision.id}`}>
        Decision
      </label>

      <textarea
        id={`decision-edit-${decision.id}`}
        value={draft}
        rows={2}
        onChange={(event) => setDraft(event.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-600 dark:focus:ring-slate-700"
      />

      {error ? (
        <p className="mt-2 text-sm text-rose-700 dark:text-rose-400">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex gap-2">
        <Button size="sm" type="submit" loading={saving}>
          Save
        </Button>

        <Button
          size="sm"
          variant="secondary"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}