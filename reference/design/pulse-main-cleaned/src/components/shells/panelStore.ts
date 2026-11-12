import * as React from "react"

/**
 * A side panel's open state, remembered on this device (a viewer convenience: localStorage, never required).
 * One store per panel key; the coach's chats and Settings' sections each have their own.
 */
export function panelStore(key: string) {
  const listeners = new Set<() => void>()
  let fallback: boolean | null = null
  const read = () => {
    try {
      return localStorage.getItem(key) !== "0"
    } catch {
      return true
    }
  }
  const set = (open: boolean) => {
    try {
      localStorage.setItem(key, open ? "1" : "0")
    } catch {
      // Storage blocked (private window): the toggle still works for this page view.
    }
    fallback = open
    listeners.forEach((l) => l())
  }
  const use = () =>
    React.useSyncExternalStore(
      (l) => (listeners.add(l), () => listeners.delete(l)),
      () => fallback ?? read(),
      () => true,
    )
  return { use, set }
}
