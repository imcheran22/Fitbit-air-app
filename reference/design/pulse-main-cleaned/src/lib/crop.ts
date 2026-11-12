// Avatar crop math (Settings › Account › Photo). Pure: no DOM, so it's unit-tested beside this file.
// The crop is a square in image pixels, centred at (cx, cy) with side `min(w, h) / zoom`. Zoom 1 is cover fit: the
// circle exactly fills the shorter side, so the photo can never be zoomed or dragged to leave a gap in the circle.

export type Crop = { cx: number; cy: number; zoom: number }
export type Size = { w: number; h: number }

export const MAX_ZOOM = 4

/** Side of the crop square in image pixels. */
export const cropSide = (img: Size, zoom: number) => Math.min(img.w, img.h) / zoom

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Keeps zoom in [1, MAX_ZOOM] and the crop square inside the image, so the circle stays filled. */
export function clampCrop(img: Size, c: Crop): Crop {
  const zoom = clamp(c.zoom, 1, MAX_ZOOM)
  const half = cropSide(img, zoom) / 2
  return { zoom, cx: clamp(c.cx, half, img.w - half), cy: clamp(c.cy, half, img.h - half) }
}

/** Opens centred at cover fit, the way phone photo croppers do. */
export const initialCrop = (img: Size): Crop => ({ cx: img.w / 2, cy: img.h / 2, zoom: 1 })

/** Drags the photo by (dx, dy) screen pixels inside a circle `circle` pixels wide. */
export function panCrop(img: Size, c: Crop, dx: number, dy: number, circle: number): Crop {
  const k = cropSide(img, c.zoom) / circle
  return clampCrop(img, { ...c, cx: c.cx - dx * k, cy: c.cy - dy * k })
}

/** Zooms to `zoom` keeping the photo point under `focal` (screen px from the circle's centre) still: pinch and wheel. */
export function zoomCrop(img: Size, c: Crop, zoom: number, circle: number, focal = { x: 0, y: 0 }): Crop {
  const z = clamp(zoom, 1, MAX_ZOOM)
  const before = cropSide(img, c.zoom) / circle
  const after = cropSide(img, z) / circle
  return clampCrop(img, { zoom: z, cx: c.cx + focal.x * (before - after), cy: c.cy + focal.y * (before - after) })
}

/** The source rectangle to draw into the exported square. */
export function cropRect(img: Size, c: Crop) {
  const side = cropSide(img, c.zoom)
  return { x: c.cx - side / 2, y: c.cy - side / 2, side }
}
