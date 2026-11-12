import { act, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CoachViewport } from "./CoachViewport"

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.style.position = ""
  document.body.style.inset = ""
})

const stubFrames = () => {
  const callbacks: FrameRequestCallback[] = []
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callbacks.push(callback)
    return callbacks.length
  })
  vi.stubGlobal("cancelAnimationFrame", vi.fn())
  return { callbacks, flush: () => act(() => callbacks.splice(0).forEach((callback) => callback(0))) }
}

describe("CoachViewport", () => {
  it("keeps the chat inside the visible viewport as the keyboard opens, pans and closes", () => {
    const viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0, scale: 1 })
    vi.stubGlobal("visualViewport", viewport)
    const { callbacks, flush } = stubFrames()
    const { container, unmount } = render(<CoachViewport><div>Chat</div></CoachViewport>)
    const frame = container.firstElementChild as HTMLElement
    expect(frame.style.getPropertyValue("--coach-height")).toBe("844px")
    expect(frame.hasAttribute("data-keyboard")).toBe(false)
    expect(document.body.style.position).toBe("fixed") // the page behind can't scroll

    // iOS: the keyboard shrinks the visual viewport and pans it.
    viewport.height = 480
    viewport.dispatchEvent(new Event("resize"))
    viewport.offsetTop = 24
    viewport.dispatchEvent(new Event("scroll"))
    expect(callbacks).toHaveLength(1)
    flush()
    expect(frame.style.getPropertyValue("--coach-height")).toBe("480px")
    expect(frame.style.getPropertyValue("--coach-top")).toBe("24px")
    expect(frame.hasAttribute("data-keyboard")).toBe(true)

    viewport.height = 844
    viewport.offsetTop = 0
    viewport.dispatchEvent(new Event("resize"))
    flush()
    expect(frame.style.getPropertyValue("--coach-height")).toBe("844px")
    expect(frame.style.getPropertyValue("--coach-top")).toBe("0px")
    expect(frame.hasAttribute("data-keyboard")).toBe(false)

    unmount()
    expect(document.body.style.position).toBe("")
    viewport.dispatchEvent(new Event("resize"))
    expect(callbacks).toHaveLength(0)
  })

  it("sees the keyboard even when the layout height shrinks with it (iOS)", () => {
    const viewport = Object.assign(new EventTarget(), { height: 874, offsetTop: 0, scale: 1 })
    vi.stubGlobal("visualViewport", viewport)
    vi.stubGlobal("innerHeight", 874)
    const { flush } = stubFrames()
    const { container } = render(<CoachViewport><div>Chat</div></CoachViewport>)
    const frame = container.firstElementChild as HTMLElement
    viewport.height = 520
    vi.stubGlobal("innerHeight", 520)
    viewport.dispatchEvent(new Event("resize"))
    flush()
    expect(frame.hasAttribute("data-keyboard")).toBe(true)
  })

  it("leaves pinch zoom alone and restores the page's own positioning", () => {
    const viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0, scale: 1 })
    vi.stubGlobal("visualViewport", viewport)
    const { flush } = stubFrames()
    document.body.style.position = "relative"
    const { container, unmount } = render(<CoachViewport><div>Chat</div></CoachViewport>)
    const frame = container.firstElementChild as HTMLElement
    viewport.scale = 2
    viewport.height = 422
    viewport.offsetTop = 120
    viewport.dispatchEvent(new Event("resize"))
    flush()
    expect(frame.style.getPropertyValue("--coach-height")).toBe("844px")
    expect(frame.style.getPropertyValue("--coach-top")).toBe("0px")
    unmount()
    expect(document.body.style.position).toBe("relative")
  })
})
