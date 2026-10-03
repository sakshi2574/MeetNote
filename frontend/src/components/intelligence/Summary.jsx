export default function Summary({ summary }) {
  return (
    <div>
      <h3 className="text-base font-semibold text-slate-900">{summary.headline}</h3>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{summary.body}</p>
      <div className="mt-6 border-t border-slate-100 pt-6">
        <h3 className="text-base font-semibold text-slate-900">Key Discussion Points</h3>
        <ul className="mt-3 space-y-2">
          {summary.points.map((point) => (
            <li key={point} className="flex items-start gap-2.5 text-sm text-slate-700">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-700" aria-hidden="true" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
