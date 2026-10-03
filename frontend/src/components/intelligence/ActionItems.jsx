import { useState } from 'react'
import Badge from '../ui/Badge.jsx'

export default function ActionItems({ items }) {
  const [records, setRecords] = useState(items)

  function toggleItem(id) {
    setRecords((current) =>
      current.map((item) => {
        if (item.id !== id) return item
        const completed = item.status !== 'Completed'
        return { ...item, status: completed ? 'Completed' : 'Pending' }
      }),
    )
  }

  return (
    <ul className="space-y-3">
      {records.map((item) => {
        const completed = item.status === 'Completed'

        return (
          <li key={item.id}>
            <label className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 p-3 transition-colors hover:border-slate-300">
              <input
                type="checkbox"
                checked={completed}
                onChange={() => toggleItem(item.id)}
                className="mt-1 h-4 w-4 shrink-0 accent-slate-900"
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
  )
}
