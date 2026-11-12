// The Pulse wordmark geometry, copied from the app's src/components/brand/Wordmark.tsx (docs/design/brand.md).
// The app component is React and imports app aliases, so the site keeps its own copy of the path builder.
// If the wordmark changes there, change it here.
const CAP = 20
export const STROKE = { bold: 3.2, black: 4.4 } as const

function build(s: number) {
  const h = s / 2
  const r = 5
  const gap = 5.5
  const base = CAP - h
  const d: string[] = []

  const yb = 11.5 + h
  d.push(`M${h} ${CAP}V${h}H${19 - h - r}A${r} ${r} 0 0 1 ${19 - h} ${h + r}V${yb - r}A${r} ${r} 0 0 1 ${19 - h - r} ${yb}H${h}`)
  let x = 19 + gap

  d.push(`M${x + h} 0V${base - r}A${r} ${r} 0 0 0 ${x + h + r} ${base}H${x + 20 - h - r}A${r} ${r} 0 0 0 ${x + 20 - h} ${base - r}V0`)
  x += 20 + gap

  const k = 0.8 * s + 1.3
  const rise = 7.5
  const dip = 2.5
  const b = x + 12
  const sx = b + 2.5 * k - 1
  const sw = 21
  const rs = Math.min(r, (CAP / 2 - h) / 2)
  const ym = CAP / 2
  d.push(
    `M${x + h} 0V${base}H${b}L${b + k} ${base - rise}L${b + 2 * k} ${base + dip}L${b + 2.5 * k} ${base}` +
      `H${sx + sw - h - rs}A${rs} ${rs} 0 0 0 ${sx + sw - h} ${base - rs}V${ym + rs}A${rs} ${rs} 0 0 0 ${sx + sw - h - rs} ${ym}` +
      `H${sx + h + rs}A${rs} ${rs} 0 0 1 ${sx + h} ${ym - rs}V${h + rs}A${rs} ${rs} 0 0 1 ${sx + h + rs} ${h}H${sx + sw}`,
  )
  x = sx + sw + gap

  d.push(`M${x + 17} ${h}H${x + h}V${base}H${x + 17}M${x + h} ${ym}H${x + 15}`)
  const width = x + 17

  const ux = -k, uy = -(rise + dip), vx = 0.5 * k, vy = -dip
  const angle = Math.acos((ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy)))
  const bottom = base + dip + h / Math.sin(angle / 2)

  return { d: d.join(""), viewBox: `0 0 ${+width.toFixed(2)} ${+bottom.toFixed(2)}` }
}

export const GLYPHS = { bold: build(STROKE.bold), black: build(STROKE.black) }
