import { CircleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { Mark } from "@/components/brand/Mark"

/** The heartbeat mark in its breathing glow, a headline and one line under it. `compact` for the form screens. */
export function AuthHero({ title, body, compact = false }: { title: string; body: React.ReactNode; compact?: boolean }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className={cn("relative grid place-items-center", compact ? "mb-6 size-28" : "mb-10 size-40")}>
        {/* The glow breathes with the beat; still under reduced motion. */}
        <div
          aria-hidden
          className="absolute inset-0 rounded-full bg-[radial-gradient(closest-side,var(--optimal),color-mix(in_oklch,var(--strain-text),transparent_40%)_55%,transparent)] opacity-35 blur-2xl motion-safe:animate-beat-glow"
        />
        <Mark animated className={cn("relative", compact ? "size-16" : "size-24")} title="Pulse" />
      </div>
      <h1 className={cn("font-bold tracking-[-0.02em] text-balance", compact ? "text-[28px] leading-[34px]" : "text-[32px] leading-[38px]")}>{title}</h1>
      <p className="mt-3 max-w-[34ch] text-[16px] leading-6 text-pretty text-foreground-secondary">{body}</p>
    </div>
  )
}

/** A failed submit's message, announced. */
export function AuthAlert({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="flex gap-2.5 rounded-2xl bg-recovery-red/12 px-4 py-3 text-[14px] leading-5 text-pretty text-foreground">
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-recovery-red-text" strokeWidth={2.25} />
      {children}
    </p>
  )
}

export const AUTH_LINK =
  "rounded-sm text-[13px] leading-[18px] font-semibold text-foreground-secondary underline-offset-4 outline-none transition-[color] duration-150 ease-standard hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
export const AUTH_FOOTNOTE = "text-center text-[13px] leading-[18px] text-pretty text-muted-foreground"
