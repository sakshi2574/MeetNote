import { useEffect, useId, useRef, useState } from 'react'
import Button from '../ui/Button.jsx'

const fieldClass =
  'mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-60'

export default function EditMeetingDialog({ meeting, saving = false, error = '', onSave, onCancel }) {
  const [title, setTitle] = useState(meeting.title ?? '')
  const [description, setDescription] = useState(meeting.description ?? '')
  const [titleError, setTitleError] = useState('')
  const titleRef = useRef(null)
  const titleId = useId()
  const descriptionId = useId()
  const titleErrorId = useId()

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key !== 'Escape' || saving) return
      event.preventDefault()
      event.stopPropagation()
      onCancel()
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [saving, onCancel])

  function handleSubmit(event) {
    event.preventDefault()
    if (saving) return

    const nextTitle = title.trim()
    if (!nextTitle) {
      setTitleError('Title cannot be empty.')
      titleRef.current?.focus()
      return
    }

    setTitleError('')
    onSave({ title: nextTitle, description: description.trim() })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40"
        aria-label="Cancel"
        onClick={onCancel}
        disabled={saving}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-meeting-heading"
        aria-busy={saving}
        className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-lg"
      >
        <h2 id="edit-meeting-heading" className="text-base font-semibold text-slate-900">
          Edit meeting
        </h2>
        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor={titleId} className="text-sm font-medium text-slate-700">
              Title
            </label>
            <input
              ref={titleRef}
              id={titleId}
              value={title}
              maxLength={255}
              disabled={saving}
              aria-invalid={titleError ? true : undefined}
              aria-describedby={titleError ? titleErrorId : undefined}
              onChange={(event) => {
                setTitle(event.target.value)
                if (titleError) setTitleError('')
              }}
              className={`${fieldClass} h-10`}
            />
            {titleError ? (
              <p id={titleErrorId} role="alert" className="mt-1.5 text-sm text-rose-700">
                {titleError}
              </p>
            ) : null}
          </div>
          <div>
            <label htmlFor={descriptionId} className="text-sm font-medium text-slate-700">
              Description
            </label>
            <textarea
              id={descriptionId}
              value={description}
              rows={4}
              disabled={saving}
              onChange={(event) => setDescription(event.target.value)}
              className={`${fieldClass} resize-y py-2 leading-6`}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-rose-700">
              {error}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} aria-busy={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
