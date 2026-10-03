export default function Decisions({ decisions }) {
  return (
    <ul className="space-y-4">
      {decisions.map((decision) => (
        <li key={decision.id} className="rounded-xl border border-slate-200 p-4">
          <div className="border-l-2 border-teal-700 pl-3">
            <p className="text-sm font-medium text-slate-900">{decision.text}</p>
            <p className="mt-2 font-mono text-xs text-slate-400">Timestamp: {decision.time}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{decision.context}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}
