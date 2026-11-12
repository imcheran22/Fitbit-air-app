import { AppLifecycle } from "./AppLifecycle"
import { Suspense } from "react"
import { AppNavigationProvider } from "./AppNavigation"
import { AppNav } from "./AppNav"
import { ShellStatusProvider, type ShellStatus } from "./ShellStatus"

export type AppShellProps = {
  status: ShellStatus
  /** Disable live polling for fixtures, which cannot finish a real sync. */
  live?: boolean
  children: React.ReactNode
}

export function AppShell({ status, live = false, children }: AppShellProps) {
  return (
    <ShellStatusProvider value={status} live={live}>
      <Suspense>
        <AppNavigationProvider>
          <a
            href="#main"
            className="sr-only rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
          >
            Skip to content
          </a>
          {/* DOM order puts navigation directly after the skip link for keyboard users. */}
          <AppNav />
          <AppLifecycle />
          {/* Clip horizontal overflow without creating a scroll container that breaks sticky headers. */}
          <main
            id="main"
            className="min-h-svh min-w-0 flex-1 overflow-x-clip pb-[calc(62px+max(env(safe-area-inset-bottom)-6px,12px)+24px)] md:pb-10 md:pl-[112px] xl:pl-[256px]"
          >
            {children}
          </main>
        </AppNavigationProvider>
      </Suspense>
    </ShellStatusProvider>
  )
}
