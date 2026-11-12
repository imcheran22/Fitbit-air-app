import { describe, expect, it } from "vitest"
import { clampCrop, cropRect, initialCrop, MAX_ZOOM, panCrop, zoomCrop } from "./crop"

const landscape = { w: 4000, h: 3000 }
const portrait = { w: 3000, h: 4000 }
const inside = (img: { w: number; h: number }, r: { x: number; y: number; side: number }) =>
  r.x >= 0 && r.y >= 0 && r.x + r.side <= img.w + 1e-9 && r.y + r.side <= img.h + 1e-9

describe("crop", () => {
  it("opens centred at cover fit: the shorter side fills the circle", () => {
    expect(cropRect(landscape, initialCrop(landscape))).toEqual({ x: 500, y: 0, side: 3000 })
    expect(cropRect(portrait, initialCrop(portrait))).toEqual({ x: 0, y: 500, side: 3000 })
  })

  it("never zooms out past cover fit or in past the maximum", () => {
    expect(zoomCrop(landscape, initialCrop(landscape), 0.2, 300).zoom).toBe(1)
    expect(zoomCrop(landscape, initialCrop(landscape), 99, 300).zoom).toBe(MAX_ZOOM)
  })

  it("can't drag the photo off the circle", () => {
    // At cover fit a landscape photo moves sideways only, by at most the 500 px overhang on each side.
    const left = panCrop(landscape, initialCrop(landscape), 10_000, 10_000, 300)
    expect(cropRect(landscape, left)).toEqual({ x: 0, y: 0, side: 3000 })
    const right = panCrop(landscape, initialCrop(landscape), -10_000, -10_000, 300)
    expect(cropRect(landscape, right)).toEqual({ x: 1000, y: 0, side: 3000 })
  })

  it("drags in screen pixels scaled to the photo", () => {
    // 3000 image px across a 300 px circle: 1 screen px is 10 image px.
    expect(panCrop(landscape, initialCrop(landscape), 20, 0, 300).cx).toBe(2000 - 200)
  })

  it("zooms about the focal point and stays filled when zooming back out near an edge", () => {
    const c = zoomCrop(landscape, initialCrop(landscape), 2, 300, { x: 150, y: 0 })
    // The point under the right edge of the circle (image x 3500) stays under it.
    expect(c.cx + 150 * (1500 / 300)).toBeCloseTo(3500)
    const pushed = panCrop(landscape, c, -10_000, -10_000, 300)
    const out = zoomCrop(landscape, pushed, 1, 300, { x: -150, y: -150 })
    expect(inside(landscape, cropRect(landscape, out))).toBe(true)
  })

  it("clamps any crop back inside the image", () => {
    for (const zoom of [0.5, 1, 1.7, 3, 10])
      for (const cx of [-1e4, 0, 2000, 1e4])
        for (const cy of [-1e4, 0, 1500, 1e4]) expect(inside(landscape, cropRect(landscape, clampCrop(landscape, { cx, cy, zoom })))).toBe(true)
  })
})
