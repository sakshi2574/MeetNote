import { useEffect, useRef } from 'react'
import Button from './Button.jsx'

export default function ConfirmDialog({
  title,
  description,
  confirmLabel = 'Delete',
  confirming = false,
  onConfirm,
  onCancel,
}) {
  const cancelRef = useRef(null)

  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key !== 'Escape' || confirming) return
      event.preventDefault()
      event.stopPropagation()
      onCancel()
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [confirming, onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40"
        aria-label="Cancel"
        onClick={onCancel}
        disabled={confirming}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        aria-busy={confirming}
        className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-lg"
      >
        <h2 id="confirm-dialog-title" className="text-base font-semibold text-slate-900">
          {title}
        </h2>
        <p id="confirm-dialog-description" className="mt-2 text-sm leading-6 text-slate-600">
          {description}
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={confirming}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={confirming} aria-busy={confirming}>
            {confirming ? 'Deleting...' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
