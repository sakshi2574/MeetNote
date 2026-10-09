import assert from 'node:assert/strict'
import test from 'node:test'

import { speakerMark } from './speakerLabel.js'

test('numbered speakers show their number', () => {
  assert.equal(speakerMark('Speaker 1'), '1')
  assert.equal(speakerMark('Speaker 2'), '2')
  assert.equal(speakerMark('speaker 12'), '12')
})

test('other labels keep a single initial', () => {
  assert.equal(speakerMark('Alex'), 'A')
  assert.equal(speakerMark('Unknown'), 'U')
  assert.equal(speakerMark(''), '?')
})
