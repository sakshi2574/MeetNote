import assert from 'node:assert/strict'
import test from 'node:test'

import {
  shouldPollTranscription,
  shouldRefreshTranscript,
  transcriptionStatusView,
} from './transcriptionStatus.js'

test('pending and processing keep polling', () => {
  assert.equal(shouldPollTranscription('pending'), true)
  assert.equal(shouldPollTranscription('processing'), true)
  assert.equal(shouldPollTranscription('completed'), false)
  assert.equal(shouldPollTranscription('failed'), false)
  assert.equal(shouldPollTranscription(null), false)
})

test('status copy matches the meeting states', () => {
  assert.equal(transcriptionStatusView({ status: 'pending' }).message, 'Transcription queued')
  assert.equal(transcriptionStatusView({ status: 'processing' }).message, 'Transcribing')
  assert.equal(transcriptionStatusView({ status: 'processing' }).busy, true)
  assert.equal(transcriptionStatusView({ status: 'completed', language: 'en' }).message, 'Transcript ready. Detected language: en.')
  assert.equal(transcriptionStatusView({ status: 'failed', error: 'No speech was detected.' }).message, 'Transcription failed. No speech was detected.')
  assert.equal(transcriptionStatusView({ status: 'failed' }).failed, true)
  assert.equal(transcriptionStatusView({ status: null }).message, '')
})

test('a completed transcript is not replaced while a segment is being edited', () => {
  assert.equal(shouldRefreshTranscript('completed', false), true)
  assert.equal(shouldRefreshTranscript('completed', true), false)
  assert.equal(shouldRefreshTranscript('processing', false), false)
})
