import { useState } from 'react'
import { updateActionItem } from '../../api/actionItems.js'
import { formatActionItem } from '../../lib/formatMeeting.js'
import Badge from '../ui/Badge.jsx'
import Button from '../ui/Button.jsx'
import TimeLink from './TimeLink.jsx'

function listKey(items) {
  return items.map((item) => [item.id, item.status, item.task, item.assignee, item.due].join(':')).join('|')
}

export default function ActionItems({ items, onUpdated, onSeek }) {
  const [local, setLocal] = useState(null)
  const [pendingId, setPendingId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')
  const key = listKey(items)
  const records = local?.key === key ? local.records : items

  async function toggleItem(id) {
    if (pendingId != null) return

    const current = records.find((item) => item.id === id)
    if (!current) return

    const previous = records
    const completed = current.status !== 'Completed'
    const nextStatus = completed ? 'Completed' : 'Pending'

    setError('')
    setPendingId(id)
    setLocal({
      key,
      records: records.map((item) => (item.id === id ? { ...item, status: nextStatus } : item)),
    })

    try {
      await updateActionItem(id, { status: completed ? 'completed' : 'pending' })
    } catch {
      setLocal({ key, records: previous })
      setError('Unable to update action item')
    } finally {
      setPendingId(null)
    }
  }

  async function saveItem(id, values) {
    const response = await updateActionItem(id, values)
    onUpdated?.(formatActionItem(response.data))
    setEditingId(null)
  }

  return (
    <div>
      {error ? (
        <p role="alert" className="mb-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <ul className="space-y-3">
        {records.map((item) => {
          const completed = item.status === 'Completed'

          if (editingId === item.id) {
            return (
              <li key={item.id}>
                <ActionItemEditor item={item} onSave={saveItem} onCancel={() => setEditingId(null)} />
              </li>
            )
          }

          return (
            <li key={item.id} className="flex gap-3 rounded-xl border border-slate-200 p-3 transition-colors hover:border-slate-300">
              <label className="flex min-w-0 flex-1 cursor-pointer gap-3">
                <input
                  type="checkbox"
                  checked={completed}
                  disabled={pendingId != null}
                  onChange={() => toggleItem(item.id)}
                  className="mt-1 h-4 w-4 shrink-0 accent-slate-900 disabled:cursor-not-allowed"
                  aria-label={`${item.task}, assigned to ${item.assignee}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className={`text-sm font-medium ${completed ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                      {item.task}
                    </span>
                    <Badge tone={completed ? 'success' : 'soon'}>{item.status}</Badge>
                  </span>
                  <span className="mt-1 block text-sm text-slate-500">
                    Assigned to: {item.assignee}
                    {item.due ? <span> · Due: {item.due}</span> : null}
                  </span>
                </span>
              </label>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <button
                  type="button"
                  onClick={() => setEditingId(item.id)}
                  disabled={pendingId != null}
                  className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-60"
                >
                  Edit
                </button>
                {item.timestamp != null ? <TimeLink seconds={item.timestamp} onSeek={onSeek} /> : null}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function ActionItemEditor({ item, onSave, onCancel }) {
  const [task, setTask] = useState(item.task)
  const [assignee, setAssignee] = useState(item.rawAssignee ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    const nextTask = task.trim()
    if (!nextTask) {
      setError('Task cannot be empty.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave(item.id, { task: nextTask, assignee: assignee.trim() || null })
    } catch {
      setError('Unable to save this action item.')
      setSaving(false)
    }
  }

  return (
    <form
      className="rounded-xl border border-slate-300 p-3"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <label className="block text-xs font-medium text-slate-500" htmlFor={`action-task-${item.id}`}>
        Task
      </label>
      <textarea
        id={`action-task-${item.id}`}
        value={task}
        rows={2}
        onChange={(event) => setTask(event.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
      />
      <label className="mt-3 block text-xs font-medium text-slate-500" htmlFor={`action-assignee-${item.id}`}>
        Assignee
      </label>
      <input
        id={`action-assignee-${item.id}`}
        value={assignee}
        onChange={(event) => setAssignee(event.target.value)}
        placeholder="Unassigned"
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
      />
      {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <Button size="sm" type="submit" loading={saving}>
          Save
        </Button>
        <Button size="sm" variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
