export default function Card({ children, className = '', ...props }) {
  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm transition-colors dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${className}`}
      {...props}
    >
      {children}
    </section>
  )
}