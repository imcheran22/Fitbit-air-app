import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AvatarCropSheet, encodeAvatar } from "./AvatarCropSheet"

const photo = { width: 4000, height: 3000, close() {} } as unknown as ImageBitmap

afterEach(() => vi.restoreAllMocks())

describe("AvatarCropSheet", () => {
  it("opens at cover fit; +/− zoom; Use photo hands it back; Cancel closes", () => {
    const onUse = vi.fn()
    const onCancel = vi.fn()
    render(<AvatarCropSheet photo={photo} open pending={false} error={null} onCancel={onCancel} onUse={onUse} />)
    const zoom = screen.getByRole("slider", { name: "Zoom" })
    expect(zoom).toHaveAttribute("aria-valuenow", "1")
    const stage = screen.getByRole("group", { name: /Photo position/ })
    fireEvent.keyDown(stage, { key: "-" })
    expect(zoom).toHaveAttribute("aria-valuenow", "1")
    fireEvent.keyDown(stage, { key: "+" })
    expect(zoom).toHaveAttribute("aria-valuenow", "1.25")
    fireEvent.click(screen.getByRole("button", { name: "Use photo" }))
    expect(onUse).toHaveBeenCalledWith({ cx: 2000, cy: 1500, zoom: 1.25 })
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it("shows an upload error inline and disables the actions while saving", () => {
    render(<AvatarCropSheet photo={photo} open pending error="Use a photo under 1 MB" onCancel={vi.fn()} onUse={vi.fn()} />)
    expect(screen.getByRole("alert")).toHaveTextContent("Use a photo under 1 MB")
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled()
  })
})

describe("encodeAvatar", () => {
  const fakeCanvas = (supported: string[]) => {
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
    // Browsers without a WebP encoder hand back PNG for an unsupported type.
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((done, type = "image/png") =>
      done(new Blob(["x"], { type: supported.includes(type) ? type : "image/png" }))
    )
    return drawImage
  }

  it("draws the crop square into 512 px as WebP", async () => {
    const drawImage = fakeCanvas(["image/webp", "image/jpeg"])
    expect((await encodeAvatar(photo, { cx: 2000, cy: 1500, zoom: 2 })).type).toBe("image/webp")
    expect(drawImage).toHaveBeenCalledWith(photo, 1250, 750, 1500, 1500, 0, 0, 512, 512)
  })

  it("falls back to JPEG where WebP can't be encoded", async () => {
    fakeCanvas(["image/jpeg"])
    expect((await encodeAvatar(photo, { cx: 2000, cy: 1500, zoom: 1 })).type).toBe("image/jpeg")
  })
})
