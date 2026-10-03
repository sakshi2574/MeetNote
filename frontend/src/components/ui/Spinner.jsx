export default function Spinner({ label = 'Loading' }) {
  return (
    <span role="status" className="inline-flex items-center">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      <span className="sr-only">{label}</span>
    </span>
  )
}
