import { useEffect, useRef, useState } from 'react'
import { exportMeeting } from '../../api/exports.js'
import {
  EXPORT_FORMATS,
  EXPORT_SECTIONS,
  defaultExportSections,
  exportErrorMessage,
  fallbackExportFilename,
  filenameFromDisposition,
  hasSelectedSection,
  saveBlob,
} from '../../lib/meetingExport.js'
import Button from '../ui/Button.jsx'

export default function ExportMeetingDialog({ meeting, onClose, onExported }) {
  const [format, setFormat] = useState('pdf')
  const [sections, setSections] = useState(defaultExportSections)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const busyRef = useRef(false)
  const controllerRef = useRef(null)
  const firstFormatRef = useRef(null)
  const anySection = hasSelectedSection(sections)
  const formatLabel = EXPORT_FORMATS.find((item) => item.id === format)?.label ?? format.toUpperCase()

  useEffect(() => {
    firstFormatRef.current?.focus()
    return () => controllerRef.current?.abort()
  }, [])

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      controllerRef.current?.abort()
      onClose()
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  function close() {
    controllerRef.current?.abort()
    onClose()
  }

  function toggleSection(sectionId) {
    setError('')
    setSections((current) => ({ ...current, [sectionId]: !current[sectionId] }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (busyRef.current) return
    if (!anySection) {
      setError('Select at least one section to export.')
      return
    }

    busyRef.current = true
    const controller = new AbortController()
    controllerRef.current = controller
    setExporting(true)
    setError('')

    try {
      const response = await exportMeeting(meeting.id, format, sections, { signal: controller.signal })
      const filename =
        filenameFromDisposition(response.headers?.['content-disposition']) ||
        fallbackExportFilename(meeting.title, format)
      saveBlob(response.data, filename)
      onExported(filename)
    } catch (exportError) {
      if (controller.signal.aborted) return
      setError(await exportErrorMessage(exportError))
    } finally {
      busyRef.current = false
      if (controllerRef.current === controller) controllerRef.current = null
      if (!controller.signal.aborted) setExporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="Close" onClick={close} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-meeting-heading"
        aria-describedby="export-meeting-description"
        aria-busy={exporting}
        className="relative z-10 max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-lg"
      >
        <h2 id="export-meeting-heading" className="text-base font-semibold text-slate-900">
          Export meeting
        </h2>
        <p id="export-meeting-description" className="mt-1 text-sm text-slate-500">
          Download the saved notes for “{meeting.title}”.
        </p>
        <form className="mt-4 space-y-5" onSubmit={handleSubmit}>
          <fieldset disabled={exporting}>
            <legend className="text-sm font-medium text-slate-700">Format</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {EXPORT_FORMATS.map((item, index) => (
                <label
                  key={item.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-slate-300 ${
                    format === item.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    ref={index === 0 ? firstFormatRef : undefined}
                    type="radio"
                    name="export-format"
                    value={item.id}
                    checked={format === item.id}
                    onChange={() => setFormat(item.id)}
                    className="mt-0.5 accent-slate-900"
                  />
                  <span>
                    <span className="block font-medium text-slate-900">{item.label}</span>
                    <span className="block text-xs leading-5 text-slate-500">{item.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset disabled={exporting}>
            <legend className="text-sm font-medium text-slate-700">Include</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {EXPORT_SECTIONS.map((section) => (
                <label key={section.id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={Boolean(sections[section.id])}
                    onChange={() => toggleSection(section.id)}
                    className="h-4 w-4 rounded border-slate-300 accent-slate-900"
                  />
                  {section.label}
                </label>
              ))}
            </div>
          </fieldset>
          {exporting ? (
            <p role="status" className="text-sm text-slate-600">
              Preparing your {formatLabel} file. Long transcripts can take a few seconds.
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-rose-700">
              {error}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" loading={exporting} disabled={!anySection} aria-busy={exporting}>
              {exporting ? 'Exporting...' : 'Export'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
