"use client"

import * as React from "react"
import { Check } from "lucide-react"
import { toast } from "sonner"
import { disablePush, currentSubscription, enablePush, pushSupported } from "@/lib/push-client"
import { useInstall } from "@/lib/install"
import { SectionShell } from "@/components/shells/SectionShell"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"

const ROW = "flex min-h-13 items-center justify-between gap-3 py-2"
const LABEL = "text-[15px] leading-[22px]"
const HINT = "text-[13px] leading-[18px] text-pretty text-muted-foreground"

/** Install the app (a button where the browser has a prompt, the Share steps on iOS) and turn notifications on or off for this device. */
export function AppSettings({ pushKey }: { pushKey: string | null }) {
  const { ready, installed, ios, canPrompt, install } = useInstall()
  // null until the browser is asked: the server render shows nothing for either row.
  const [push, setPush] = React.useState<"off" | "on" | "denied" | "unsupported" | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!pushKey) return
    let live = true
    const read = async () => {
      if (!pushSupported()) return "unsupported" as const
      if (Notification.permission === "denied") return "denied" as const
      const sub = await currentSubscription().catch(() => null)
      return sub && Notification.permission === "granted" ? ("on" as const) : ("off" as const)
    }
    read().then((v) => live && setPush(v))
    return () => {
      live = false
    }
  }, [pushKey])

  const toggle = async (on: boolean) => {
    if (!pushKey) return
    setBusy(true)
    if (on) {
      const r = await enablePush(pushKey)
      setPush(r === "ok" ? "on" : r === "denied" ? "denied" : "off")
      if (r === "error") toast.error("Couldn’t turn on notifications. Try again.")
    } else {
      await disablePush()
      setPush("off")
    }
    setBusy(false)
  }

  const showInstall = ready && !installed && (canPrompt || ios)
  const showPush = pushKey !== null && push !== null
  if (!showInstall && !showPush) return null
  return (
    <SectionShell variant="card" level={2} id="app" title="App">
      <div className="divide-y divide-border">
        {showInstall && (
          <div className={ROW}>
            <div className="min-w-0">
              <p className={LABEL}>Install Pulse</p>
              <p className={HINT}>{canPrompt ? "Opens full screen, like an app." : "Tap Share, then Add to Home Screen."}</p>
            </div>
            {canPrompt && (
              <Button type="button" variant="secondary" size="touch" onClick={install}>
                Install
              </Button>
            )}
          </div>
        )}
        {ready && installed && (
          <div className={ROW}>
            <p className={LABEL}>Installed</p>
            <Check aria-hidden className="size-5 text-muted-foreground" strokeWidth={2} />
          </div>
        )}
        {showPush && (
          <div className={ROW}>
            <div className="min-w-0">
              <p id="push-label" className={LABEL}>
                Notifications
              </p>
              <p className={HINT}>
                {push === "unsupported"
                  ? ios && !installed
                    ? "Add Pulse to your Home Screen first, then turn this on."
                    : "This browser can’t show notifications."
                  : push === "denied"
                    ? "Blocked in this browser’s settings."
                    : "Recovery ready, and when Pulse can’t sync."}
              </p>
            </div>
            {push !== "unsupported" && push !== "denied" && (
              <Switch aria-labelledby="push-label" checked={push === "on"} disabled={busy} onCheckedChange={toggle} />
            )}
          </div>
        )}
      </div>
    </SectionShell>
  )
}

/** Sign out: first drops this device's push subscription (so the next person to sign in here isn't sent your alerts), then posts to /logout. A plain form post when there's nothing to drop, so it works before hydration. */
export function SignOutForm({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <form
      method="post"
      action="/logout"
      className={className}
      onSubmit={async (e) => {
        const form = e.currentTarget
        if (!pushSupported() || !(await currentSubscription().catch(() => null))) return
        e.preventDefault()
        await disablePush()
        form.submit()
      }}
    >
      {children}
    </form>
  )
}
