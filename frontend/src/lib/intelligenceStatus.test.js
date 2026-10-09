import assert from 'node:assert/strict'
import test from 'node:test'

import { formatIntelligence, intelligenceView, shouldPollIntelligence } from './intelligenceStatus.js'

test('pending and processing keep polling', () => {
  assert.equal(shouldPollIntelligence('pending'), true)
  assert.equal(shouldPollIntelligence('processing'), true)
  assert.equal(shouldPollIntelligence('completed'), false)
  assert.equal(shouldPollIntelligence('failed'), false)
  assert.equal(shouldPollIntelligence(null), false)
})

test('saved key points keep their transcript timestamps', () => {
  const formatted = formatIntelligence({
    status: 'completed',
    summary: '  The beta launches Tuesday. ',
    summary_source: 'ai',
    key_points: [
      { text: 'Payment review is pending.', timestamp: 18 },
      { text: 'Older point', timestamp: null },
      { text: '   ' },
    ],
  })
  assert.equal(formatted.summary, 'The beta launches Tuesday.')
  assert.deepEqual(
    formatted.keyPoints.map((point) => [point.text, point.timestamp]),
    [
      ['Payment review is pending.', 18],
      ['Older point', null],
    ],
  )
})

test('summary tab states follow transcription and insight status', () => {
  const ready = formatIntelligence({ status: 'completed', summary: 'Launch plan.', key_points: [] })
  const empty = formatIntelligence({ status: 'completed', summary: null, key_points: [] })

  assert.equal(intelligenceView(ready, 'processing').state, 'waiting')
  assert.equal(intelligenceView(formatIntelligence({ status: 'processing' }), 'completed').state, 'processing')
  assert.equal(intelligenceView(formatIntelligence({ status: 'failed', error: 'Nope.' }), 'completed').message, 'Nope.')
  assert.equal(intelligenceView(ready, 'completed').state, 'ready')
  assert.equal(intelligenceView(empty, 'completed').state, 'insufficient')
  assert.equal(intelligenceView(formatIntelligence(null), null).state, 'idle')
})
