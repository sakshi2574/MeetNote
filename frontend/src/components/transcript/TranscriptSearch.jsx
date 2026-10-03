export default function TranscriptSearch({ value, onChange, onClear }) {
  return (
    <div className="relative">
      <label className="sr-only" htmlFor="transcript-search">
        Search transcript
      </label>
      <input
        id="transcript-search"
        type="search"
        value={value}
        placeholder="Search transcript..."
        onChange={(event) => onChange(event.target.value)}
        className={`h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-200 [&::-webkit-search-cancel-button]:appearance-none ${value ? 'pr-16' : ''}`}
      />
      {value ? (
        <button
          type="button"
          onClick={onClear}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          Clear
        </button>
      ) : null}
    </div>
  )
}
