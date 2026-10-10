import Spinner from './Spinner.jsx'

const variants = {
  primary:
    'bg-slate-900 text-white hover:bg-slate-800 dark:bg-teal-700 dark:text-white dark:hover:bg-teal-600',

  secondary:
    'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-600 dark:hover:bg-slate-700',

  danger:
    'border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:bg-slate-900 dark:text-rose-400 dark:hover:bg-rose-950',

  ghost:
    'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
}

const sizes = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  icon: 'h-10 w-10',
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  loading = false,
  disabled = false,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 dark:focus-visible:ring-teal-500 dark:focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-60 ${
        variants[variant] ?? variants.primary
      } ${sizes[size] ?? sizes.md} ${className}`}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  )
}