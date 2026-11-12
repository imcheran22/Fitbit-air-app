"use client"

import * as React from "react"

/**
 * The coach fills the screen, header to composer, and stays that way as the on-screen keyboard opens:
 * - Android Chrome: the viewport's `interactive-widget=resizes-content` (layout.tsx) makes the keyboard shrink the page
 *   instead of sliding it up, so the frame, sized to the viewport, just follows.
 * - iOS Safari (which ignores that): the frame is sized and moved to the visual viewport as the keyboard pans it.
 * The page behind is locked with `position: fixed` on the body, so it can't scroll under the frame. Not
 * `overflow: hidden`, which on iOS clips the frame along with the page.
 * `data-keyboard` is set while a keyboard is up, so the composer drops its home-indicator padding.
 */
export function CoachViewport({ children }: { children: React.ReactNode }) {
  const frame = React.useRef<HTMLDivElement>(null)

  React.useLayoutEffect(() => {
    const viewport = window.visualViewport
    const body = document.body.style
    const locked = { position: body.position, inset: body.inset }
    Object.assign(body, { position: "fixed", inset: "0" })
    // The tallest viewport seen at this width: the keyboard is up when the visible height falls well below it. Not
    // innerHeight, which iOS shrinks along with the keyboard.
    let full = { width: 0, height: 0 }
    let pending = 0
    const update = () => {
      pending = 0
      // Pinch zoom: leave the frame alone (Android reports a scale a hair off 1 at rest).
      if (viewport && Math.abs(viewport.scale - 1) > 0.01) return
      const height = viewport?.height ?? window.innerHeight
      if (full.width !== window.innerWidth || height > full.height) full = { width: window.innerWidth, height }
      frame.current?.style.setProperty("--coach-height", `${height}px`)
      frame.current?.style.setProperty("--coach-top", `${viewport?.offsetTop ?? 0}px`)
      frame.current?.toggleAttribute("data-keyboard", full.height - height > 120)
    }
    const schedule = () => {
      if (!pending) pending = requestAnimationFrame(update)
    }
    update()
    viewport?.addEventListener("resize", schedule)
    viewport?.addEventListener("scroll", schedule)
    window.addEventListener("resize", schedule)
    return () => {
      cancelAnimationFrame(pending)
      viewport?.removeEventListener("resize", schedule)
      viewport?.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      Object.assign(body, locked)
    }
  }, [])

  return (
    <div
      ref={frame}
      className="fixed inset-x-0 top-[var(--coach-top,0px)] h-[var(--coach-height,100dvh)] overflow-hidden md:left-[112px] xl:has-data-[chats=closed]:pl-[76px] xl:has-data-[chats=open]:pl-[284px]"
    >
      {children}
    </div>
  )
}
