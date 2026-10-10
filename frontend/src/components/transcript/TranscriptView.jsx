import { useCallback, useEffect, useRef, useState } from 'react'
import Button from '../ui/Button.jsx'
import TranscriptSearch from './TranscriptSearch.jsx'
import TranscriptSegment from './TranscriptSegment.jsx'

export default function TranscriptView({ segments, playbackTime = 0, onSeek, onSaveSegment, onEditingChange }) {
  const [query, setQuery] = useState('')
  const listRef = useRef(null)
  const rowRefs = useRef(new Map())
  const editingRef = useRef(0)
  const visibleSegments = filterSegments(segments, query)
  const activeId = activeSegmentId(visibleSegments, playbackTime)

  const notifyEditing = useCallback((isEditing) => {
    editingRef.current += isEditing ? 1 : -1
    if (editingRef.current < 0) editingRef.current = 0
    onEditingChange?.(editingRef.current > 0)
  }, [onEditingChange])

  useEffect(() => {
    if (activeId == null || editingRef.current > 0) return
    const container = listRef.current
    const row = rowRefs.current.get(activeId)
    if (!container || !row) return

    const containerRect = container.getBoundingClientRect()
    const rowRect = row.getBoundingClientRect()
    if (rowRect.top < containerRect.top) {
      container.scrollTop -= containerRect.top - rowRect.top
    } else if (rowRect.bottom > containerRect.bottom) {
      container.scrollTop += rowRect.bottom - containerRect.bottom
    }
  }, [activeId])

  return (
    <div>
      <TranscriptSearch value={query} onChange={setQuery} onClear={() => setQuery('')} />
      {visibleSegments.length === 0 ? (
        <div className="mt-6 px-2 py-10 text-center">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
  No transcript matches found.
</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => setQuery('')}>
            Clear search
          </Button>
        </div>
      ) : (
        <div ref={listRef} className="mt-4 max-h-96 overflow-y-auto pr-1">
          {visibleSegments.map((segment) => (
            <TranscriptSegment
              key={segment.id}
              segment={segment}
              active={segment.id === activeId}
              onSeek={onSeek}
              onSave={onSaveSegment}
              onEditingChange={notifyEditing}
              rowRef={(node) => {
                if (node) rowRefs.current.set(segment.id, node)
                else rowRefs.current.delete(segment.id)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function filterSegments(segments, query) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return segments

  return segments.filter((segment) => {
    return (
      segment.text.toLowerCase().includes(normalized) ||
      segment.speaker.toLowerCase().includes(normalized)
    )
  })
}

function activeSegmentId(segments, playbackTime) {
  const time = Number(playbackTime)
  if (!Number.isFinite(time)) return null

  let chosen = null
  for (const segment of segments) {
    const start = Number(segment.startTime)
    const end = Number(segment.endTime)
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    const contains = time >= start && time <= end
    if (!contains) continue
    if (!chosen || start > chosen.start || (start === chosen.start && end < chosen.end)) {
      chosen = { id: segment.id, start, end }
    }
  }
  return chosen ? chosen.id : null
}
