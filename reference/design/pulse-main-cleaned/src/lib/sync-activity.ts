import * as React from "react"

// Client-side "a sync is running" flag, so the band's syncing ring turns on the moment Sync now is pressed,
// before the server status catches up. A counter, so overlapping syncs keep it on until the last one ends.
let running = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** Marks a sync as running; call the returned function when it ends. */
export function startSyncing(): () => void {
  running++
  emit()
  let done = false
  return () => {
    if (done) return
    done = true
    running--
    emit()
  }
}

/** Runs a sync past the worker's 5-minute gate and waits for it. Plain fetch, never a Server Action: an action holds every link navigation until it returns. */
export async function syncNow(): Promise<{ ok: boolean; error?: string }> {
  const end = startSyncing()
  return fetch("/sync", { method: "POST", cache: "no-store" })
    .then((res) => res.json())
    .catch(() => ({ ok: false, error: "Couldn’t reach Pulse" }))
    .finally(end)
}

const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export const useSyncing = () => React.useSyncExternalStore(subscribe, () => running > 0, () => false)
