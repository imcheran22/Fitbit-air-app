"use client"

import * as React from "react"

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }

// Chrome and Edge fire `beforeinstallprompt` once, early; it is kept here (module level, registered when this file
// loads) so Settings can offer "Install" later.
let deferred: InstallEvent | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

if (typeof window !== "undefined") {
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault()
    deferred = e as InstallEvent
    emit()
  })
  addEventListener("appinstalled", () => {
    deferred = null
    emit()
  })
}

const noop = () => () => {}
const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Running as an installed app (any browser). */
export const isStandalone = () =>
  matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

/** iPhone or iPad, where install is Share › Add to Home Screen (there is no prompt). iPadOS reports as a Mac with touch. */
export const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)

/** What Settings shows: nothing (installed), a button (Chrome, Edge), or the iOS steps. Server render says nothing. */
export function useInstall() {
  const canPrompt = React.useSyncExternalStore(subscribe, () => deferred !== null, () => false)
  // Both are device facts that never change while the page is open; the server render has no device, so it says "not ready".
  const ready = React.useSyncExternalStore(noop, () => true, () => false)
  const installed = React.useSyncExternalStore(noop, () => isStandalone(), () => false)
  const ios = React.useSyncExternalStore(noop, () => isIos(), () => false)
  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    deferred = null
    emit()
  }
  return { ready, installed, ios, canPrompt, install }
}
