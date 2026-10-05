import { useState } from 'react'
import { updateActionItem } from '../../api/actionItems.js'
import Badge from '../ui/Badge.jsx'

function listKey(items) {
  return items.map((item) => [item.id, item.status, item.task, item.assignee, item.due].join(':')).join('|')
}

export default function ActionItems({ items }) {
  const [local, setLocal] = useState(null)
  const [pendingId, setPendingId] = useState(null)
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

          return (
            <li key={item.id}>
              <label className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 p-3 transition-colors hover:border-slate-300">
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
            </li>
          )
        })}
      </ul>
    </div>
  )
}
