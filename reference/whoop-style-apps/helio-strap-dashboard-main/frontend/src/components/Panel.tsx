import type { ReactNode } from 'react'

interface Props {
  title?: string
  hint?: string
  right?: ReactNode
  className?: string
  children: ReactNode
  delay?: number
  id?: string
}

export default function Panel({
  title,
  hint,
  right,
  className = '',
  children,
  delay = 0,
  id,
}: Props) {
  return (
    <section
      id={id}
      className={`panel panel-hover animate-rise scroll-mt-6 p-5 ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {(title || right) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && (
              <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
                {title}
              </h2>
            )}
            {hint && (
              <p className="mt-1 text-[13px] text-faint">{hint}</p>
            )}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  )
}
