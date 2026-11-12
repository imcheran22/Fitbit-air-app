import { Children, cloneElement, isValidElement } from "react"
import { cn } from "@/lib/utils"
import { ConnectionBanner } from "@/components/metrics/ConnectionBanner"
import type { InfoContent } from "./InfoButton"
import { COLLAPSE_HERO } from "@/lib/collapse"
import { CollapsingHeader, type HeaderStats } from "./CollapsingHeader"
import { DateSwitcher, type DateSwitcherProps } from "./DateSwitcher"
import { DetailHeader, type DetailHeaderProps } from "./DetailHeader"
import { CONTENT_COLUMN, LoadingStatus } from "./PageShell"
import { PageEnter } from "./PageEnter"

export type DetailShellProps = {
  title: string
  subtitle?: string
  info?: InfoContent
  /** Overrides the primary screen return target for nested screens. */
  backHref?: string
  /** `placement: "header"` makes the date the header title (Recovery, Strain, Sleep); else the pill sits under the header. */
  dateSwitcher?: DateSwitcherProps
  dismiss?: DetailHeaderProps["dismiss"]
  align?: DetailHeaderProps["align"]
  titleIcon?: React.ReactNode
  action?: React.ReactNode
  ground?: "default" | "healthspan"
  /** The hero component. With `collapse`, it must accept `compact` (or forward it to the component inside). */
  hero?: React.ReactNode
  stats?: HeaderStats
  collapse?: boolean
  summary?: React.ReactNode
  notch?: boolean
  insight?: React.ReactNode
  primary?: React.ReactNode
  /** Items may use xl column/row spans to balance the dense two-column layout. */
  secondary?: React.ReactNode[]
  footer?: React.ReactNode
  /** A route's loading.tsx: says "Loading…" to screen readers while the aria-hidden skeleton shows. */
  loading?: boolean
  contained?: boolean
}

export function DetailShell({ title, subtitle, info, backHref, dateSwitcher, dismiss, align, titleIcon, action, ground, hero, stats, collapse, summary, notch, insight, primary, secondary, footer, loading, contained = false }: DetailShellProps) {
  const side = summary ?? (hero ? insight : null)
  const inHeader = dateSwitcher?.placement === "header"
  const headerProps = { title, subtitle, info, backHref, dismiss, align, titleIcon, action, dateTitle: inHeader ? dateSwitcher : undefined }
  // Render the compact hero on the server so server-component wrappers can accept it too.
  const compact = collapse && isValidElement<{ compact?: boolean }>(hero) ? cloneElement(hero, { compact: true }) : null
  const header = compact ? <CollapsingHeader {...headerProps} compact={compact} stats={stats} /> : <DetailHeader {...headerProps} />
  return (
    <div data-ground={ground === "healthspan" ? "healthspan" : undefined} className={contained ? "flex h-full min-h-0 flex-col" : undefined}>
      {contained ? <div className="shrink-0">{header}</div> : header}
      <PageEnter className={cn(CONTENT_COLUMN, contained && "flex min-h-0 flex-1 flex-col")} aria-busy={loading || undefined}>
        {loading && <LoadingStatus title={title} />}
        <ConnectionBanner className="mb-4 shrink-0 xl:mb-6" />
        {dateSwitcher && !inHeader && (
          <div className="mb-6 flex justify-center">
            <DateSwitcher {...dateSwitcher} placement="header" />
          </div>
        )}
        <div className={cn("flex flex-col gap-8", contained && "min-h-0 flex-1")}>
          {(hero || side) && (
            <div className={cn("flex flex-col gap-6", side && "xl:grid xl:grid-cols-[minmax(360px,max-content)_minmax(0,1fr)] xl:items-center xl:gap-8 xl:has-data-[hero-align=start]:items-start")}>
              {hero && (
                // Clip overhanging hero glows at the screen edge to prevent horizontal page growth.
                <div
                  {...(compact ? { [COLLAPSE_HERO]: "" } : {})}
                  className="flex min-w-0 justify-center max-md:-mx-4 max-md:overflow-x-clip max-md:px-4 xl:has-data-[hero-align=start]:sticky xl:has-data-[hero-align=start]:top-24"
                >
                  {hero}
                </div>
              )}
              {side && (
                <div className={cn("min-w-0", notch && summary && "relative")}>
                  {notch && summary && (
                    <span
                      aria-hidden
                      className="absolute -top-2 left-1/2 size-4 -translate-x-1/2 rotate-45 rounded-tl-[3px] bg-card-top shadow-[inset_1px_1px_0_var(--card-edge)] xl:top-1/2 xl:-left-2 xl:translate-x-0 xl:-translate-y-1/2 xl:bg-card xl:shadow-none"
                    />
                  )}
                  {side}
                </div>
              )}
            </div>
          )}
          {(summary || !hero) && insight}
          {primary}
          {secondary && secondary.length > 0 && (
            <div className="grid grid-cols-1 gap-3 xl:grid-flow-row-dense xl:grid-cols-2 xl:gap-4">{Children.toArray(secondary)}</div>
          )}
          {footer}
        </div>
      </PageEnter>
    </div>
  )
}
