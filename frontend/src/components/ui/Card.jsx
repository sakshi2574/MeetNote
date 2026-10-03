export default function Card({ children, className = '', ...props }) {
  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
      {...props}
    >
      {children}
    </section>
  )
}
