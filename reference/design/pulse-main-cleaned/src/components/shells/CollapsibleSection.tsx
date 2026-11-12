"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"
import { FOLDED_COOKIE, nextFolded } from "@/lib/folded"
import { cn } from "@/lib/utils"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

function remember(id: string, open: boolean) {
  const m = document.cookie.match(new RegExp(`(?:^|; )${FOLDED_COOKIE}=([^;]*)`))
  const next = nextFolded(m ? decodeURIComponent(m[1]) : undefined, id, open)
  document.cookie = `${FOLDED_COOKIE}=${encodeURIComponent(next)}; path=/; max-age=31536000; samesite=lax`
}

export type CollapsibleSectionProps = {
  /** Stable id: the section's anchor and its key in the cookie. */
  id: string
  title: string
  /** Closed on first render (from the cookie). */
  defaultOpen?: boolean
  /** Shown beside the title, open or closed (a "See all" link). */
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}

/**
 * A page section whose body folds away (spec §11 LG1): SectionShell's section header, with the title a 44 px toggle and
 * a chevron. The choice is kept per browser in a cookie, so a folded section stays folded on the next visit.
 */
export function CollapsibleSection({ id, title, defaultOpen = true, action, className, children }: CollapsibleSectionProps) {
  const [open, setOpen] = React.useState(defaultOpen)
  const headingId = `${id}-title`
  const toggle = (o: boolean) => {
    setOpen(o)
    remember(id, o)
  }
  return (
    <Collapsible open={open} onOpenChange={toggle} asChild>
      <section id={id} aria-labelledby={headingId} className={cn("scroll-mt-20 min-w-0", className)}>
        <div className={cn("flex min-h-[34px] items-center justify-between gap-3", open && "mb-3 xl:mb-4")}>
          <h2 id={headingId} className="text-[22px] leading-7 font-semibold tracking-[-0.01em] text-balance xl:text-2xl">
            <CollapsibleTrigger className="group -mx-2 -my-1.5 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              {title}
              <ChevronDown aria-hidden className="size-5 text-muted-foreground transition-transform duration-150 ease-standard group-data-[state=closed]:-rotate-90" strokeWidth={2} />
            </CollapsibleTrigger>
          </h2>
          {action && <div className="flex shrink-0 items-center gap-3 text-xs leading-4 font-medium text-muted-foreground">{action}</div>}
        </div>
        <CollapsibleContent>{children}</CollapsibleContent>
      </section>
    </Collapsible>
  )
}
