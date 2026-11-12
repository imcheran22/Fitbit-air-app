"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Bot, ChevronRight, LayoutDashboard, MailPlus, ShieldCheck, Users, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

type Page = { href: string; label: string; icon: LucideIcon }
export const ADMIN_GROUPS: { label: string; pages: Page[] }[] = [
  { label: "General", pages: [{ href: "/admin", label: "Overview", icon: LayoutDashboard }] },
  {
    label: "Manage",
    pages: [
      { href: "/admin/people", label: "People", icon: Users },
      { href: "/admin/invites", label: "Invites", icon: MailPlus },
    ],
  },
  {
    label: "Configure",
    pages: [
      { href: "/admin/access", label: "Access", icon: ShieldCheck },
      { href: "/admin/coach", label: "AI coach", icon: Bot },
    ],
  },
]
const PAGES = ADMIN_GROUPS.flatMap((g) => g.pages)

const isCurrent = (pathname: string, href: string) => (href === "/admin" ? pathname === href : pathname.startsWith(href))

/** Sidebar from 1024 px: grouped pages. */
export function AdminSidebar() {
  const pathname = usePathname()
  return (
    <nav aria-label="Admin" className="grid gap-5">
      {ADMIN_GROUPS.map((g) => (
        <div key={g.label}>
          <p className="px-2 pb-1.5 text-[12px] leading-4 font-medium text-muted-foreground">{g.label}</p>
          <ul className="grid gap-0.5">
            {g.pages.map(({ href, label, icon: Icon }) => {
              const on = isCurrent(pathname, href)
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "flex h-9 items-center gap-2.5 rounded-md px-2 text-[14px] outline-none transition-[background-color,color] duration-150 ease-standard focus-visible:ring-3 focus-visible:ring-ring/50",
                      on ? "bg-foreground/[0.08] font-medium text-foreground" : "text-foreground-secondary hover:bg-foreground/[0.05] hover:text-foreground",
                    )}
                  >
                    <Icon aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
                    {label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

/** The top bar's trail: Admin › current page. */
export function AdminBreadcrumb() {
  const pathname = usePathname()
  const page = PAGES.find((p) => isCurrent(pathname, p.href))
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[14px]">
      <Link href="/admin" className="inline-flex h-10 shrink-0 items-center text-muted-foreground outline-none hover:text-foreground focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50">
        Admin
      </Link>
      {page && page.href !== "/admin" && (
        <>
          <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          <span aria-current="page" className="truncate font-medium">
            {page.label}
          </span>
        </>
      )}
    </nav>
  )
}

/** Fades a scrolling row's trailing edge so cut-off items read as "more this way". */
export const SCROLL_FADE = "[mask-image:linear-gradient(to_left,transparent,black_32px)]"

/** Keeps a scrolling row's current item (aria-current) in view: on a phone it may start off-screen. */
export function useCurrentInView<T extends HTMLElement>() {
  const ref = React.useRef<T>(null)
  const pathname = usePathname()
  const query = useSearchParams().toString()
  React.useEffect(() => {
    ref.current?.querySelector("[aria-current=page]")?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [pathname, query])
  return ref
}

/** Below 1024 px: the pages as a scrolling tab row under the top bar. */
export function AdminTabs() {
  const pathname = usePathname()
  const ref = useCurrentInView<HTMLElement>()
  return (
    <nav ref={ref} aria-label="Admin" className={cn("-mx-4 scroll-px-4 overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-6 sm:scroll-px-6 sm:px-6", SCROLL_FADE)}>
      <ul className="flex w-max gap-1">
        {PAGES.map(({ href, label }) => {
          const on = isCurrent(pathname, href)
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "relative grid h-10 place-items-center px-3 text-[14px] font-medium outline-none transition-[color] duration-150 ease-standard focus-visible:ring-3 focus-visible:ring-ring/50",
                  on ? "text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** A list that scrolls its current item into view (the coach page's item row on a phone). */
export function CurrentInViewList({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useCurrentInView<HTMLUListElement>()
  return (
    <ul ref={ref} className={className}>
      {children}
    </ul>
  )
}
