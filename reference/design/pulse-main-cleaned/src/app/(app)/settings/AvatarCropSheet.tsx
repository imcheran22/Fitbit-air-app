"use client"

import * as React from "react"
import { ZoomIn, ZoomOut } from "lucide-react"
import { clampCrop, cropRect, cropSide, initialCrop, MAX_ZOOM, panCrop, zoomCrop, type Crop } from "@/lib/crop"
import { ResponsiveSheet } from "@/components/shells/ResponsiveSheet"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"

/** Exported avatars are this many pixels square: sharp on a 3× phone at the 56 px Settings size, ~50–150 KB as WebP. */
export const AVATAR_PX = 512
/** Gap between the stage's edge and the circle, so the dimmed photo around it shows what's being left out. */
const INSET = 20
const KEY_STEP = 10
const KEY_ZOOM = 0.25

/** Decodes a picked file upright (EXIF orientation applied); null when the browser can't read it (HEIC on most). */
export async function decodePhoto(file: Blob): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" })
  } catch {
    return null
  }
}

/** The crop as a AVATAR_PX square: WebP, or JPEG where the browser can't encode WebP (it hands back PNG instead). */
export async function encodeAvatar(photo: CanvasImageSource & { width: number; height: number }, crop: Crop): Promise<Blob> {
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = AVATAR_PX
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("No 2D canvas")
  ctx.imageSmoothingQuality = "high"
  const r = cropRect({ w: photo.width, h: photo.height }, crop)
  ctx.drawImage(photo, r.x, r.y, r.side, r.side, 0, 0, AVATAR_PX, AVATAR_PX)
  const encode = (type: string, quality: number) => new Promise<Blob | null>((done) => canvas.toBlob(done, type, quality))
  const webp = await encode("image/webp", 0.85)
  if (webp?.type === "image/webp") return webp
  const jpeg = await encode("image/jpeg", 0.88)
  if (!jpeg) throw new Error("Couldn’t encode the photo")
  return jpeg
}

export type AvatarCropSheetProps = {
  /** The decoded photo; the sheet is open while it's set. Kept by the caller so the close animation still has it. */
  photo: ImageBitmap | null
  open: boolean
  pending: boolean
  error: string | null
  onCancel: () => void
  onUse: (crop: Crop) => void
}

/**
 * Settings › Account › Photo: position the picked photo in a circle before it's uploaded. Opens centred at cover fit;
 * drag (or arrow keys) to move, pinch, scroll, the slider or +/− to zoom. The photo can't leave a gap in the circle.
 */
export function AvatarCropSheet({ photo, open, pending, error, onCancel, onUse }: AvatarCropSheetProps) {
  const size = React.useMemo(() => (photo ? { w: photo.width, h: photo.height } : { w: 1, h: 1 }), [photo])
  const [crop, setCrop] = React.useState<Crop>(() => initialCrop(size))
  const [stage, setStage] = React.useState(0)
  const stageRef = React.useRef<HTMLDivElement>(null)
  const canvas = React.useRef<HTMLCanvasElement>(null)
  const pointers = React.useRef(new Map<number, { x: number; y: number }>())
  const circle = Math.max(1, stage - INSET * 2)

  // A new photo opens centred at cover fit (state reset during render, not in an effect).
  const [shown, setShown] = React.useState(photo)
  if (photo !== shown) {
    setShown(photo)
    setCrop(initialCrop(size))
  }

  // Draw the photo so the crop square sits exactly under the circle.
  React.useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext("2d")
    if (!el || !ctx || !photo || !stage) return
    const dpr = window.devicePixelRatio || 1
    const px = Math.round(stage * dpr)
    if (el.width !== px) el.width = el.height = px
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, px, px)
    const scale = circle / cropSide(size, crop.zoom)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(photo, stage / 2 - crop.cx * scale, stage / 2 - crop.cy * scale, size.w * scale, size.h * scale)
  }, [photo, size, crop, stage, circle])

  // The stage mounts inside the sheet's portal, after this component's effects, so it's set up in a callback ref:
  // its width (for the circle and the canvas resolution), and wheel / trackpad-pinch zoom about the cursor. Wheel is a
  // native listener because React's onWheel is passive and can't preventDefault the page scroll.
  const attachStage = React.useCallback(
    (el: HTMLDivElement | null) => {
      stageRef.current = el
      if (!el) return
      const ro = new ResizeObserver(([e]) => setStage(e.contentRect.width))
      ro.observe(el)
      const wheel = (e: WheelEvent) => {
        e.preventDefault()
        const box = el.getBoundingClientRect()
        const focal = { x: e.clientX - box.left - box.width / 2, y: e.clientY - box.top - box.height / 2 }
        setCrop((c) => zoomCrop(size, c, c.zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), box.width - INSET * 2, focal))
      }
      el.addEventListener("wheel", wheel, { passive: false })
      return () => {
        ro.disconnect()
        el.removeEventListener("wheel", wheel)
      }
    },
    [size]
  )

  const fromCentre = (p: { x: number; y: number }) => {
    const box = stageRef.current!.getBoundingClientRect()
    return { x: p.x - box.left - box.width / 2, y: p.y - box.top - box.height / 2 }
  }

  const down = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
  }
  const move = (e: React.PointerEvent) => {
    const map = pointers.current
    const last = map.get(e.pointerId)
    if (!last) return
    const before = [...map.values()]
    map.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const after = [...map.values()]
    if (after.length === 1) return setCrop((c) => panCrop(size, c, e.clientX - last.x, e.clientY - last.y, circle))
    // Two fingers: zoom by the change in their spread, about their midpoint, and follow the midpoint.
    const mid = (ps: { x: number; y: number }[]) => ({ x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 })
    const spread = (ps: { x: number; y: number }[]) => Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) || 1
    const [m0, m1] = [mid(before), mid(after)]
    setCrop((c) => {
      const zoomed = zoomCrop(size, c, (c.zoom * spread(after)) / spread(before), circle, fromCentre(m1))
      return panCrop(size, zoomed, m1.x - m0.x, m1.y - m0.y, circle)
    })
  }
  const up = (e: React.PointerEvent) => pointers.current.delete(e.pointerId)

  const key = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? KEY_STEP * 4 : KEY_STEP
    const pan: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    const zoom: Record<string, number> = { "+": KEY_ZOOM, "=": KEY_ZOOM, "-": -KEY_ZOOM, _: -KEY_ZOOM }
    if (pan[e.key]) setCrop((c) => panCrop(size, c, pan[e.key][0], pan[e.key][1], circle))
    else if (zoom[e.key]) setCrop((c) => zoomCrop(size, c, c.zoom + zoom[e.key], circle))
    else return
    e.preventDefault()
  }

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={(o) => !o && !pending && onCancel()}
      title="Photo"
      description="Drag to move. Pinch or scroll to zoom."
      footer={
        <>
          {error && (
            <Alert role="alert" className="border-0 bg-recovery-red/15 px-3 py-2">
              <AlertDescription className="text-recovery-red-text">{error}</AlertDescription>
            </Alert>
          )}
          <Button size="sheet" onClick={() => onUse(clampCrop(size, crop))} disabled={pending || !photo} aria-live="polite">
            {pending ? "Saving…" : "Use photo"}
          </Button>
          <Button size="sheet" variant="outline-pill" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        </>
      }
    >
      <div
        ref={attachStage}
        // vaul: dragging the photo mustn't drag the drawer closed.
        data-vaul-no-drag
        tabIndex={0}
        role="group"
        aria-roledescription="photo cropper"
        aria-label="Photo position. Arrow keys move it, plus and minus zoom."
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={key}
        className="relative mx-auto aspect-square w-full max-w-[400px] cursor-grab touch-none overflow-hidden rounded-xl bg-media-ground outline-none select-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring/70 active:cursor-grabbing"
      >
        <canvas ref={canvas} aria-hidden className="size-full" />
        {/* The mask: everything outside the circle dimmed, a hairline on the circle's edge. */}
        <div
          aria-hidden
          style={{ inset: INSET }}
          className="pointer-events-none absolute rounded-full shadow-[0_0_0_9999px_var(--dim)] ring-1 ring-on-media/50"
        />
      </div>
      <div className="mx-auto mt-3 flex max-w-[400px] items-center gap-3 text-muted-foreground">
        <ZoomOut aria-hidden strokeWidth={1.75} className="size-5 shrink-0" />
        <Slider
          aria-label="Zoom"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={[crop.zoom]}
          onValueChange={([z]) => setCrop((c) => zoomCrop(size, c, z, circle))}
        />
        <ZoomIn aria-hidden strokeWidth={1.75} className="size-5 shrink-0" />
      </div>
    </ResponsiveSheet>
  )
}
