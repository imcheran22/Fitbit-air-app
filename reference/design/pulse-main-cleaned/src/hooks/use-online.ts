"use client"

import * as React from "react"

const subscribe = (cb: () => void) => {
  addEventListener("online", cb)
  addEventListener("offline", cb)
  return () => {
    removeEventListener("online", cb)
    removeEventListener("offline", cb)
  }
}

/** `navigator.onLine`, live. Server and first client render say online, so hydration matches. */
export const useOnline = () => React.useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
