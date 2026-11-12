// The admin dashboard's own small kit: a page header, a panel, a status pill and dates. Sentence case and plain
// weights throughout: this is a tool page, so it skips the app's caps labels and glass.
import { cn } from "@/lib/utils"

export function PageHeader({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 lg:mb-8">
      <div className="min-w-0">
        <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-balance">{title}</h1>
        <p className="mt-1.5 max-w-[60ch] text-[15px] leading-[22px] text-pretty text-muted-foreground">{description}</p>
      </div>
      {action}
    </header>
  )
}

export function Panel({ title, description, action, children, className, flush }: { title?: string; description?: string; action?: React.ReactNode; children: React.ReactNode; className?: string; flush?: boolean }) {
  return (
    <section aria-label={title} className={cn("min-w-0 rounded-xl bg-card shadow-card ring-1 ring-border", className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-4 px-4 pt-4 sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] leading-[22px] font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] leading-[18px] text-pretty text-muted-foreground">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={flush ? "pt-3" : "px-4 pt-3 pb-5 sm:px-5"}>{children}</div>
    </section>
  )
}

const TONE = {
  neutral: "bg-foreground/[0.06] text-foreground-secondary",
  good: "bg-optimal/15 text-foreground",
  warn: "bg-warning/15 text-foreground",
  coach: "bg-coach/15 text-foreground",
}

/** A small status word in a tinted pill; a dot carries the colour so it never relies on the text tint alone. */
export function Pill({ tone = "neutral", children }: { tone?: keyof typeof TONE; children: React.ReactNode }) {
  const dot = { neutral: "bg-muted-foreground", good: "bg-optimal", warn: "bg-warning", coach: "bg-coach" }[tone]
  return (
    <span className={cn("inline-flex h-6 max-w-full items-center gap-1.5 rounded-full px-2.5 text-[12px] leading-4 font-medium whitespace-nowrap", TONE[tone])}>
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", dot)} />
      <span className="truncate">{children}</span>
    </span>
  )
}

const DATE = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" })
export const shortDate = (ms: number) => DATE.format(ms)

/** "Today", "Yesterday", "5 days ago", then a date. */
export function relative(ms: number, now: number) {
  const days = Math.floor((now - ms) / 86_400_000)
  if (days <= 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 30) return `${days} days ago`
  return shortDate(ms)
}

/** One headline number: label and icon on top, the value, then what it means. */
export function StatCard({ label, value, note, icon: Icon }: { label: string; value: React.ReactNode; note: string; icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }> }) {
  return (
    <div className="min-w-0 rounded-xl bg-card p-4 shadow-card ring-1 ring-border sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] leading-5 font-medium text-pretty text-foreground-secondary sm:text-[14px]">{label}</p>
        <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      </div>
      <p className="mt-2 font-numeric text-[26px] leading-8 font-semibold tabular-nums sm:text-[30px] sm:leading-9">{value}</p>
      <p className="mt-1 text-[12px] leading-4 text-pretty text-muted-foreground">{note}</p>
    </div>
  )
}

/** Admin buttons: compact, 40 px tall on touch screens, with the destructive ones red and always visible (never tucked in a menu). */
const BASE =
  "inline-flex h-8 pointer-coarse:h-10 shrink-0 items-center justify-center gap-1.5 rounded-md px-3 text-[13px] font-medium whitespace-nowrap outline-none transition-[background-color,color,box-shadow,scale] duration-150 ease-standard focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-3.5"
export const BTN = {
  primary: `${BASE} bg-primary text-primary-foreground hover:bg-primary/85`,
  outline: `${BASE} bg-card text-foreground ring-1 ring-border hover:bg-foreground/[0.05]`,
  danger: `${BASE} bg-recovery-red/10 text-recovery-red-text ring-1 ring-recovery-red/30 hover:bg-recovery-red/20`,
}

/**
 * Admin tables become compact lists below a breakpoint (People at xl, Invites at md): the same rows, one line of
 * name and status each, with the other cells hidden and the header kept for screen readers. Explicit ARIA roles keep
 * the table semantics when the display changes.
 */
export const TH = "h-10 px-4 text-left text-[13px] leading-4 font-medium text-muted-foreground whitespace-nowrap bg-foreground/[0.025]"
export const TD = "align-middle text-[14px] leading-5"
