import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { SheetTrigger } from "./SheetTrigger"

export type EmptyStateProps = {
  icon?: LucideIcon
  /** One line, final copy from the spec. */
  body: string
  /** `href` renders a link; `sheet` opens that sheet over the screen (`?checkin=1`); `onClick` (client trees only) a button. */
  action?: { label: string; href?: string; sheet?: string; onClick?: () => void }
  className?: string
}

/** Shared empty state for metrics and lists (spec §4.8). */
export function EmptyState({ icon: Icon, body, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-2 py-8 text-center", className)}>
      {Icon && <Icon aria-hidden className="size-6 text-muted-foreground" strokeWidth={1.75} />}
      <p className="max-w-[36ch] text-[15px] leading-[22px] text-pretty text-foreground-secondary">{body}</p>
      {action &&
        (action.sheet ? (
          <Button asChild size="touch" variant="secondary" className="mt-2">
            <SheetTrigger sheet={action.sheet}>{action.label}</SheetTrigger>
          </Button>
        ) : action.href ? (
          <Button asChild size="touch" variant="secondary" className="mt-2">
            <Link href={action.href}>{action.label}</Link>
          </Button>
        ) : (
          <Button size="touch" variant="secondary" className="mt-2" onClick={action.onClick}>
            {action.label}
          </Button>
        ))}
    </div>
  )
}
