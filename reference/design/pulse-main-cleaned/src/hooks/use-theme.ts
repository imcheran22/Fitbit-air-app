"use client"

import * as React from "react"
import { resolveTheme, THEME_KEY, type ThemeChoice } from "@/lib/theme"

const listeners = new Set<() => void>()

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === "light" || v === "dark" ? v : "system"
  } catch {
    return "system"
  }
}

const systemLight = () => matchMedia("(prefers-color-scheme: light)").matches

/** Puts the resolved theme on <html> (the class drives :root.light and shadcn's dark: variants). */
function apply(choice: ThemeChoice) {
  const resolved = resolveTheme(choice, systemLight())
  const root = document.documentElement
  root.classList.remove("light", "dark")
  root.classList.add(resolved)
  root.style.colorScheme = resolved
}

function subscribe(onChange: () => void) {
  const sync = () => {
    apply(read())
    onChange()
  }
  const mq = matchMedia("(prefers-color-scheme: light)")
  listeners.add(onChange)
  mq.addEventListener("change", sync)
  window.addEventListener("storage", sync) // another tab changed it
  return () => {
    listeners.delete(onChange)
    mq.removeEventListener("change", sync)
    window.removeEventListener("storage", sync)
  }
}

/**
 * The device's theme choice (Settings › Appearance) and what it resolves to. The no-flash script in the root layout
 * (THEME_SCRIPT) applies it before first paint; this keeps it in step with the system setting and other tabs.
 */
export function useTheme() {
  const theme = React.useSyncExternalStore(subscribe, read, () => "system" as const)
  const resolvedTheme = React.useSyncExternalStore(
    subscribe,
    () => resolveTheme(read(), systemLight()),
    () => undefined,
  )
  const setTheme = React.useCallback((choice: ThemeChoice) => {
    try {
      localStorage.setItem(THEME_KEY, choice)
    } catch {
      // Private mode: the choice lasts until reload.
    }
    apply(choice)
    listeners.forEach((l) => l())
  }, [])
  return { theme, resolvedTheme, setTheme }
}
