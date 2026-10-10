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
        className={`h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-teal-900 [&::-webkit-search-cancel-button]:appearance-none ${
          value ? 'pr-16' : ''
        }`}
      />

      {value ? (
        <button
          type="button"
          onClick={onClear}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"
        >
          Clear
        </button>
      ) : null}
    </div>
  )
}