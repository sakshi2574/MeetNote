import { useState } from 'react'
import Button from '../ui/Button.jsx'
import TranscriptSearch from './TranscriptSearch.jsx'
import TranscriptSegment from './TranscriptSegment.jsx'

export default function TranscriptView({ segments }) {
  const [query, setQuery] = useState('')
  const visibleSegments = filterSegments(segments, query)

  return (
    <div>
      <TranscriptSearch value={query} onChange={setQuery} onClear={() => setQuery('')} />
      {visibleSegments.length === 0 ? (
        <div className="mt-6 px-2 py-10 text-center">
          <p className="text-sm font-medium text-slate-900">No transcript matches found.</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => setQuery('')}>
            Clear search
          </Button>
        </div>
      ) : (
        <div className="mt-4 max-h-96 overflow-y-auto pr-1">
          {visibleSegments.map((segment) => (
            <TranscriptSegment key={segment.id} segment={segment} />
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
