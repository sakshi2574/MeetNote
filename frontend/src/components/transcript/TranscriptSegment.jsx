export default function TranscriptSegment({ segment }) {
  return (
    <article className="flex gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-slate-50">
      <time dateTime={segment.time} className="w-12 shrink-0 pt-0.5 font-mono text-xs text-slate-400">
        {segment.time}
      </time>
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-semibold text-teal-800"
      >
        {segment.speaker.slice(0, 1)}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">{segment.speaker}</p>
        <p className="mt-1 text-sm leading-6 text-slate-600">{segment.text}</p>
      </div>
    </article>
  )
}
