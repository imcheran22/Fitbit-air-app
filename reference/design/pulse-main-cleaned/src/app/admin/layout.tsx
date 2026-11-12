import type { Metadata } from "next"
import { connection } from "next/server"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Mark } from "@/components/brand/Mark"
import { AdminBreadcrumb, AdminSidebar, AdminTabs } from "./AdminNav"
import { adminGate } from "./gate"

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin · Pulse" }, manifest: null }

const BACK =
  "inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-[14px] font-medium text-foreground-secondary ring-1 ring-border outline-none transition-[background-color,color] duration-150 ease-standard hover:bg-foreground/[0.05] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:h-10"

/**
 * The admin dashboard (docs/setup.md "Accounts, admins and invites"): its own frame, apart from the app. A sidebar
 * of grouped pages with the signed-in admin at its foot, a top bar with the trail, and dense pages on the theme's
 * tokens. Admins only (adminGate).
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await connection()
  const { user } = await adminGate()
  const initial = (user.name || user.email).trim()[0]?.toUpperCase() ?? "?"
  return (
    <div className="min-h-svh bg-background text-foreground">
      <a href="#admin-main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-card lg:flex">
        <Link href="/admin" className="m-3 flex items-center gap-3 rounded-lg p-2 outline-none hover:bg-foreground/[0.04] focus-visible:ring-3 focus-visible:ring-ring/50">
          <span className="grid size-9 place-items-center rounded-lg bg-foreground/[0.06]">
            <Mark className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] leading-5 font-semibold">Pulse</span>
            <span className="block text-[12px] leading-4 text-muted-foreground">Admin dashboard</span>
          </span>
        </Link>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <AdminSidebar />
        </div>
        <div className="m-3 flex items-center gap-3 rounded-lg p-2 ring-1 ring-border">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-coach/15 text-[14px] font-semibold text-foreground">
            {initial}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[14px] leading-5 font-medium">{user.name}</span>
            <span className="block truncate text-[12px] leading-4 text-muted-foreground">{user.email}</span>
          </span>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-border bg-background/90 pt-[var(--inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] backdrop-blur-md">
          <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <span className="flex min-w-0 items-center gap-3">
              <Mark className="size-6 shrink-0 lg:hidden" />
              <AdminBreadcrumb />
            </span>
            <Link href="/" className={BACK}>
              <ArrowLeft aria-hidden className="size-4" strokeWidth={2} />
              <span className="hidden sm:inline">Back to Pulse</span>
              <span className="sm:hidden">Pulse</span>
            </Link>
          </div>
          <div className="px-4 sm:px-6 lg:hidden">
            <AdminTabs />
          </div>
        </header>

        <main id="admin-main" className="pt-6 pr-[max(env(safe-area-inset-right),16px)] pb-[max(env(safe-area-inset-bottom),40px)] pl-[max(env(safe-area-inset-left),16px)] sm:pr-[max(env(safe-area-inset-right),24px)] sm:pl-[max(env(safe-area-inset-left),24px)] lg:px-8 lg:pt-8">
          <div className="mx-auto max-w-[1200px]">{children}</div>
        </main>
      </div>
    </div>
  )
}
