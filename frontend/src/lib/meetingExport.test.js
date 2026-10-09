import assert from 'node:assert/strict'
import test from 'node:test'

import {
  defaultExportSections,
  exportErrorMessage,
  exportParams,
  fallbackExportFilename,
  filenameFromDisposition,
  hasSelectedSection,
} from './meetingExport.js'

test('every section is selected by default', () => {
  const sections = defaultExportSections()
  assert.deepEqual(sections, {
    details: true,
    summary: true,
    transcript: true,
    action_items: true,
    decisions: true,
  })
  assert.equal(hasSelectedSection(sections), true)
  assert.equal(hasSelectedSection({ ...sections, details: false, summary: false, transcript: false, action_items: false, decisions: false }), false)
})

test('export params send every section flag', () => {
  assert.deepEqual(exportParams('docx', { details: true, transcript: false }), {
    format: 'docx',
    details: true,
    summary: false,
    transcript: false,
    action_items: false,
    decisions: false,
  })
})

test('the UTF-8 filename wins over the ASCII fallback', () => {
  const header = `attachment; filename="Cafe-sync-2026-10-09.pdf"; filename*=UTF-8''Caf%C3%A9%20sync%20%E0%A4%A8-2026-10-09.pdf`
  assert.equal(filenameFromDisposition(header), 'Café sync न-2026-10-09.pdf')
  assert.equal(filenameFromDisposition('attachment; filename="notes.txt"'), 'notes.txt')
  assert.equal(filenameFromDisposition("attachment; filename*=UTF-8''%E0%A4"), '')
  assert.equal(filenameFromDisposition('attachment; filename="../../evil.txt"'), '.. .. evil.txt')
  assert.equal(filenameFromDisposition(undefined), '')
})

test('fallback filenames are slugs of the title', () => {
  assert.equal(fallbackExportFilename('Weekly sync: Q4 / plan', 'pdf'), 'Weekly-sync-Q4-plan.pdf')
  assert.equal(fallbackExportFilename('会议', 'json'), 'meeting.json')
  assert.equal(fallbackExportFilename(null, 'txt'), 'meeting.txt')
})

test('error messages explain what happened', async () => {
  assert.match(await exportErrorMessage({ response: { status: 401 } }), /session has expired/)
  assert.match(await exportErrorMessage({ response: { status: 404 } }), /could not be found/)
  assert.match(await exportErrorMessage({}), /Unable to reach the MeetNote API/)

  const blob = new Blob([JSON.stringify({ detail: 'Select at least one section to export.' })], { type: 'application/json' })
  assert.equal(await exportErrorMessage({ response: { status: 422, data: blob } }), 'Select at least one section to export.')
  assert.equal(await exportErrorMessage({ response: { status: 500, data: new Blob(['oops']) } }), 'The export could not be created. Try again.')
})
