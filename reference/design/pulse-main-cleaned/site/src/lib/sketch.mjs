// Hand-drawn diagrams for blog posts, drawn at build time with roughjs (the library behind Excalidraw's look).
// A post writes a fenced block with the language `sketch` and a JSON spec; sketchPlugin swaps it for a figure of
// two inline SVGs, a wide layout and a narrow one, and CSS shows the one that fits. No script ships.
// Kinds: bands, bars, flow, steps, line, compare. Spec reference: docs/blog-diagrams.md.
import rough from "roughjs"

// Colours are the site's tokens, so a diagram follows the theme.
const TONES = {
  green: "var(--recovery-green)",
  yellow: "var(--recovery-yellow)",
  red: "var(--recovery-red-text)",
  blue: "var(--strain-text)",
  sleep: "var(--sleep)",
  teal: "var(--optimal)",
  orange: "var(--warning)",
  grey: "var(--muted-foreground)",
}
const INK = "var(--foreground-secondary)"
const STRONG = "var(--foreground)"
const MUTED = "var(--muted-foreground)"
const tone = (t, where) => {
  if (t === undefined) return INK
  if (!(t in TONES)) throw new Error(`${where}: unknown tone "${t}". Use one of: ${Object.keys(TONES).join(", ")}`)
  return TONES[t]
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

// Caveat 500 advance widths in hundredths of an em, measured in Chromium: printable ASCII from space to "~", then a
// few others. Unknown characters count as half an em. Wrapping and collision checks use these, with 3% to spare.
const ASCII = [24,21,24,56,45,60,56,12,33,33,36,45,20,33,20,33,45,45,45,45,45,45,46,45,45,45,20,20,45,45,45,37,64,51,52,47,58,53,46,49,57,40,31,50,43,72,61,50,47,50,54,49,46,48,49,72,52,50,52,33,33,33,45,45,35,44,44,36,40,33,29,36,47,19,21,37,17,56,45,36,38,38,36,34,33,37,33,52,34,34,32,33,33,33,45]
const EXTRA = {"×": 45, "–": 45, "—": 57, "’": 12, "‘": 12, "“": 27, "”": 27, "°": 28, "₹": 55, "é": 33, "æ": 57, "ø": 35, "ü": 37, "€": 45, "£": 45, "…": 59, "·": 19, "≥": 55, "≤": 55, "→": 100}
const em = (ch) => {
  const code = ch.codePointAt(0)
  return (code >= 32 && code < 127 ? ASCII[code - 32] : (EXTRA[ch] ?? 50)) / 100
}
const textW = (str, size) => [...String(str)].reduce((w, ch) => w + em(ch), 0) * size * 1.03

function wrap(text, size, width) {
  const lines = []
  let line = ""
  for (const word of String(text).split(/\s+/)) {
    const next = line ? line + " " + word : word
    if (line && textW(next, size) > width) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

// Greedy rows for labels laid along one axis: items [{lo, hi}] sorted by lo; returns each item's row so that no two
// labels in a row touch.
function rows(items, gap = 12) {
  const ends = []
  return items.map(({ lo, hi }) => {
    let r = ends.findIndex((e) => lo >= e + gap)
    if (r === -1) {
      r = ends.length
      ends.push(hi)
    } else ends[r] = hi
    return r
  })
}

// "5 AZM" but "5%" and "42 ms" as written: a unit that starts with a letter gets a space.
const withUnit = (v, unit = "") => `${v}${/^[A-Za-z]/.test(unit) ? " " : ""}${unit}`

// Lays labels on one row: each wants to sit centred on `at` with width `w`, inside [lo, hi]. Pushes neighbours apart
// and returns the centres, or null when they cannot all fit on one row.
function spread(items, lo, hi, gap = 14) {
  const pos = items.map((it) => Math.min(Math.max(it.at, lo + it.w / 2), hi - it.w / 2))
  for (let i = 1; i < pos.length; i++) pos[i] = Math.max(pos[i], pos[i - 1] + (items[i - 1].w + items[i].w) / 2 + gap)
  for (let i = pos.length - 1; i >= 0; i--) {
    pos[i] = Math.min(pos[i], hi - items[i].w / 2)
    if (i < pos.length - 1) pos[i] = Math.min(pos[i], pos[i + 1] - (items[i].w + items[i + 1].w) / 2 - gap)
  }
  return pos.length && pos[0] - items[0].w / 2 < lo ? null : pos
}

// Tick or axis labels at given x positions: centred and pushed apart when they would touch.
function axisLabels(c, xs, texts, y, size) {
  const items = texts.map((t, i) => ({ at: xs[i], w: textW(t, size) }))
  const pos = spread(items, 2, c.W - 2, 10)
  texts.forEach((t, i) => {
    if (pos) c.text(pos[i], y, t, { anchor: "middle", size, fill: MUTED })
    else c.text(xs[i], y, t, { anchor: i === 0 ? "start" : i === texts.length - 1 ? "end" : "middle", size, fill: MUTED })
  })
}

function hash(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) % 2 ** 31 || 1
}

// Wide: 720 units across, shown at up to 820 px. Narrow: 400 units, for a phone column, with larger relative text.
const LAYOUTS = {
  wide: { W: 720, F: 28, S: 23, narrow: false },
  narrow: { W: 400, F: 25, S: 21, narrow: true },
}

class Canvas {
  constructor(seed, layout) {
    Object.assign(this, layout)
    this.g = rough.generator()
    this.seed = seed
    this.parts = []
  }
  opts(o) {
    return { roughness: 1.1, bowing: 1, strokeWidth: 2, stroke: INK, seed: this.seed++, ...o }
  }
  draw(d) {
    for (const p of this.g.toPaths(d)) {
      this.parts.push(`<path d="${p.d}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" fill="${p.fill ?? "none"}" stroke-linecap="round" stroke-linejoin="round"/>`)
    }
  }
  rect(x, y, w, h, o = {}) {
    this.draw(this.g.rectangle(x, y, w, h, this.opts(o)))
  }
  line(x1, y1, x2, y2, o = {}) {
    this.draw(this.g.line(x1, y1, x2, y2, this.opts(o)))
  }
  curve(points, o = {}) {
    this.draw(this.g.curve(points, this.opts(o)))
  }
  circle(x, y, d, o = {}) {
    this.draw(this.g.circle(x, y, d, this.opts(o)))
  }
  arrow(x1, y1, x2, y2, o = {}) {
    this.line(x1, y1, x2, y2, o)
    const a = Math.atan2(y2 - y1, x2 - x1)
    for (const s of [-1, 1]) {
      const b = a + Math.PI + s * 0.45
      this.line(x2, y2, x2 + 13 * Math.cos(b), y2 + 13 * Math.sin(b), o)
    }
  }
  // Text, wrapped to `width` when given. `y` is the first baseline. Returns the height used.
  text(x, y, str, { size = this.F, fill = INK, anchor = "start", width } = {}) {
    const lines = width ? wrap(str, size, width) : [String(str)]
    const lh = size * 1.05
    const spans = lines.map((l, i) => `<tspan x="${x}" dy="${i ? lh : 0}">${esc(l)}</tspan>`).join("")
    // data-w records the width a wrapped label must fit, so a browser check can confirm it does.
    this.parts.push(`<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}"${width ? ` data-w="${Math.round(width)}"` : ""}>${spans}</text>`)
    return lines.length * lh
  }
  svg(h, label, cls) {
    return `<svg class="${cls}" viewBox="0 0 ${this.W} ${Math.ceil(h)}" role="img" aria-label="${esc(label)}">${this.parts.join("")}</svg>`
  }
}

const KINDS = {
  // A scale split into coloured bands, with optional markers. {min, max, unit?, bands: [{to, label, tone}], markers?: [{at, label}]}
  bands(s, c) {
    const L = 24, R = c.W - 24, span = s.max - s.min
    const x = (v) => L + ((v - s.min) / span) * (R - L)
    const place = (cx, w) => {
      const at = Math.min(Math.max(cx, w / 2 + 4), c.W - w / 2 - 4)
      return { cx: at, lo: at - w / 2, hi: at + w / 2 }
    }
    // Marker labels sit above the bar; band labels below it. Either set stacks into rows when neighbours would touch.
    const marks = [...(s.markers ?? [])].sort((a, b) => a.at - b.at).map((m) => ({ ...m, ...place(x(m.at), textW(m.label, c.F)) }))
    // Markers share one row when they fit, pushed apart with angled arrows; otherwise they stack.
    const one = spread(marks.map((m) => ({ at: x(m.at), w: textW(m.label, c.F) })), 4, c.W - 4)
    if (one) marks.forEach((m, i) => (m.cx = one[i]))
    const mrow = one ? marks.map(() => 0) : rows(marks)
    const mrows = marks.length ? Math.max(...mrow) + 1 : 0
    const top = mrows ? 30 + mrows * 34 + 24 : 24
    let from = s.min
    const labels = s.bands.map((b) => {
      const t = tone(b.tone, "bands")
      c.rect(x(from), top, x(b.to) - x(from), 46, { fill: t, fillStyle: "hachure", hachureGap: 7, fillWeight: 1.6, stroke: t })
      const l = { label: b.label, t, ...place((x(from) + x(b.to)) / 2, textW(b.label, c.S)) }
      from = b.to
      return l
    })
    const brow = rows(labels)
    const lh = c.S * 1.35
    labels.forEach((l, i) => c.text(l.cx, top + 76 + brow[i] * lh, l.label, { anchor: "middle", fill: l.t, size: c.S }))
    const tickY = top + 76 + Math.max(...brow) * lh + 32
    const ticks = [s.min, ...s.bands.map((b) => b.to)]
    axisLabels(c, ticks.map(x), ticks.map((v) => withUnit(v, s.unit)), tickY, c.S - 2)
    marks.forEach((m, i) => {
      const ty = 30 + mrow[i] * 34
      c.text(m.cx, ty, m.label, { anchor: "middle", fill: STRONG })
      c.arrow(one ? m.cx : x(m.at), ty + 10, x(m.at), top - 6, { strokeWidth: 2.2, stroke: STRONG })
    })
    return tickY + 16
  },

  // Horizontal bars. {unit?, max?, legend?: [..], tones?: [..], bars: [{label, value | values: [..], tone?}]}
  bars(s, c) {
    const n = Math.max(...s.bars.map((b) => (b.values ?? [b.value]).length))
    const max = s.max ?? Math.max(...s.bars.flatMap((b) => b.values ?? [b.value]))
    const tones = s.tones ?? ["teal", "blue", "orange", "sleep"]
    // Wide: labels in a column on the left. Narrow: each label sits above its bars.
    const L = c.narrow ? 24 : 215
    const R = c.W - (c.narrow ? 76 : 90)
    let y = 20
    if (s.legend) {
      let lx = L
      s.legend.forEach((name, i) => {
        const t = tone(tones[i], "bars")
        c.rect(lx, y, 20, 20, { fill: t, fillStyle: "solid", stroke: t, roughness: 0.6 })
        c.text(lx + 30, y + 18, name, { size: c.S })
        lx += 46 + textW(name, c.S)
      })
      y += 46
    }
    for (const b of s.bars) {
      const vals = b.values ?? [b.value]
      if (c.narrow) y += c.text(L, y + c.S, b.label, { size: c.S, fill: STRONG, width: c.W - 48 }) + 8
      const lines = c.narrow ? 0 : wrap(b.label, c.S + 1, 190).length
      const lh = (c.S + 1) * 1.05
      const rowH = Math.max(vals.length * 26 + (c.narrow ? 6 : 18), lines * lh + 8)
      if (!c.narrow) c.text(200, y + rowH / 2 - ((lines - 1) * lh) / 2 + 7, b.label, { anchor: "end", size: c.S + 1, width: 190 })
      vals.forEach((v, i) => {
        const t = tone(b.tone ?? tones[i], "bars")
        const w = Math.max(3, (v / max) * (R - L))
        const by = y + (c.narrow ? 0 : rowH / 2 - (vals.length * 26) / 2 + 3) + i * 26
        c.rect(L, by, w, 20, { fill: t, fillStyle: "hachure", hachureGap: 5, stroke: t, roughness: 0.9 })
        c.text(L + w + 8, by + 17, `${withUnit(v, s.unit)}`, { size: c.S, fill: STRONG })
      })
      y += rowH + (c.narrow ? 14 : 8)
    }
    return y + 6
  },

  // Several inputs feeding one result. {inputs: [string | {label, note?, tone?}], output, tone?, note?}
  flow(s, c) {
    const items = s.inputs.map((i) => (typeof i === "string" ? { label: i } : i))
    const ot = tone(s.tone ?? "teal", "flow")
    const gap = 12
    const top = 20
    const bw = c.narrow ? c.W - 48 : 290
    const L = c.narrow ? 24 : 30
    // An input box holds its label and, when both fit, its note on the same line; otherwise the note goes under it.
    let y = top
    const boxes = items.map((it) => {
      const lines = wrap(it.label, c.S + 1, bw - 32)
      const inline = it.note && lines.length === 1 && textW(it.label, c.S + 1) + textW(it.note, c.S) + 44 <= bw
      const h = 22 + lines.length * (c.S + 1) * 1.05 + (it.note && !inline ? c.S * 1.1 + 6 : 0) + 4
      const box = { ...it, y, h, inline }
      y += h + gap
      return box
    })
    const inputsBottom = y - gap
    for (const b of boxes) {
      c.rect(L, b.y, bw, b.h, { stroke: tone(b.tone, "flow") })
      const th = c.text(L + 16, b.y + 14 + c.S, b.label, { size: c.S + 1, width: bw - 32 })
      if (b.note && b.inline) c.text(L + bw - 14, b.y + 14 + c.S, b.note, { anchor: "end", size: c.S, fill: MUTED })
      if (b.note && !b.inline) c.text(L + 16, b.y + 20 + c.S + th, b.note, { size: c.S, fill: MUTED, width: bw - 32 })
    }
    let end
    if (c.narrow) {
      const oy = inputsBottom + 54
      c.arrow(c.W / 2, oy - 46, c.W / 2, oy - 8, { strokeWidth: 1.8 })
      const lines = wrap(s.output, c.F + 3, bw - 30).length
      const oh = 40 + lines * (c.F + 3)
      c.rect(L, oy, bw, oh, { stroke: ot, strokeWidth: 2.6, fill: ot, fillStyle: "hachure", hachureGap: 12, fillWeight: 0.8 })
      c.text(c.W / 2, oy + 26 + c.F * 0.6, s.output, { anchor: "middle", size: c.F + 3, fill: STRONG, width: bw - 30 })
      end = oy + oh + 10
    } else {
      const ow = 230
      const ox = c.W - 30 - ow
      const lines = wrap(s.output, c.F + 4, ow - 20).length
      const oh = Math.max(90, 40 + lines * (c.F + 4) * 1.05)
      const oy = Math.max(top, (top + inputsBottom) / 2 - oh / 2)
      const mid = oy + oh / 2
      for (const b of boxes) c.curve([[L + bw + 6, b.y + b.h / 2], [ox - 70, (b.y + b.h / 2 + mid) / 2], [ox - 8, mid]], { strokeWidth: 1.6 })
      c.arrow(ox - 30, mid, ox - 6, mid, { strokeWidth: 1.6 })
      c.rect(ox, oy, ow, oh, { stroke: ot, strokeWidth: 2.6, fill: ot, fillStyle: "hachure", hachureGap: 12, fillWeight: 0.8 })
      c.text(ox + ow / 2, mid - ((lines - 1) * (c.F + 4) * 1.05) / 2 + 10, s.output, { anchor: "middle", size: c.F + 4, fill: STRONG, width: ow - 20 })
      end = Math.max(inputsBottom, oy + oh) + 10
    }
    if (s.note) end += c.text(c.W / 2, end + 26, s.note, { anchor: "middle", size: c.S, fill: MUTED, width: c.W - 48 }) + 10
    return end + 10
  },

  // Numbered steps: rows of up to three when wide (two by two for four), one column when narrow. {steps: [{title, text?}]}
  steps(s, c) {
    const per = c.narrow ? 1 : s.steps.length === 4 ? 2 : Math.min(3, s.steps.length)
    const gap = c.narrow ? 34 : 40
    const L = c.narrow ? 24 : 30
    const bw = (c.W - 2 * L - gap * (per - 1)) / per
    const inner = bw - 30
    let y = 20
    let n = 1
    for (let r = 0; r < s.steps.length; r += per) {
      const row = s.steps.slice(r, r + per)
      const heights = row.map((st) => 76 + wrap(st.title, c.F, inner).length * c.F * 1.05 + (st.text ? wrap(st.text, c.S, inner).length * c.S * 1.05 + 8 : 0))
      const bh = Math.max(...heights)
      row.forEach((st, i) => {
        const x = L + i * (bw + gap)
        c.rect(x, y, bw, bh, { stroke: tone(st.tone, "steps") })
        c.circle(x + 32, y + 32, 34, { stroke: "var(--optimal)", strokeWidth: 2.2 })
        c.text(x + 32, y + 41, n++, { anchor: "middle", fill: "var(--optimal)" })
        const th = c.text(x + 15, y + 86, st.title, { width: inner, fill: STRONG })
        if (st.text) c.text(x + 15, y + 86 + th + 2, st.text, { width: inner, size: c.S, fill: MUTED })
        if (i < row.length - 1) c.arrow(x + bw + 6, y + bh / 2, x + bw + gap - 6, y + bh / 2, { strokeWidth: 1.6 })
      })
      y += bh
      if (r + per < s.steps.length) {
        if (c.narrow) c.arrow(c.W / 2, y + 4, c.W / 2, y + gap - 4, { strokeWidth: 1.6 })
        y += c.narrow ? gap : 30
      }
    }
    return y + 14
  },

  // A trend. {series: [{label?, points: [..], tone?}], band?: {from, to, label?}, yLabel?, xLabels?: [..], notes?: [{at, text, series?}], min?, max?}
  line(s, c) {
    const L = c.narrow ? 30 : 50, R = c.W - 20
    // Notes sit on one row above the plot, so they never cross the line, each other or another note's arrow. Too
    // wide for one row, each wraps into an equal share of the width; only if that still fails do they stack in rows.
    const ns = c.S + 1, nlh = ns * 1.05
    const notes = [...(s.notes ?? [])].sort((a, b) => a.at - b.at)
    const len0 = Math.max(...s.series.map((se) => se.points.length))
    const nx = (i) => L + (i / Math.max(1, len0 - 1)) * (R - L)
    const share = (R - L) / Math.max(1, notes.length) - 14
    let placed = notes.map((n) => ({ ...n, wrapAt: undefined, lines: 1, w: textW(n.text, ns) }))
    let one = spread(placed.map((n) => ({ at: nx(n.at), w: n.w })), L, R)
    if (!one && notes.length > 1) {
      placed = notes.map((n) => {
        const lines = wrap(n.text, ns, share)
        return { ...n, wrapAt: share, lines: lines.length, w: Math.max(...lines.map((l) => textW(l, ns))) }
      })
      one = spread(placed.map((n) => ({ at: nx(n.at), w: n.w })), L, R)
    }
    placed.forEach((n, i) => {
      n.cx = one ? one[i] : Math.min(Math.max(nx(n.at), L + n.w / 2), R - n.w / 2)
      n.lo = n.cx - n.w / 2
      n.hi = n.cx + n.w / 2
    })
    const nrow = one ? placed.map(() => 0) : rows(placed)
    const maxLines = Math.max(1, ...placed.map((n) => n.lines))
    const stripTop = s.yLabel ? 72 : 40
    const T = notes.length ? stripTop + Math.max(...nrow) * 30 + (maxLines - 1) * nlh + 30 : s.yLabel ? 74 : 40
    const B = T + (c.narrow ? 190 : 230)
    const all = s.series.flatMap((se) => se.points).concat(s.band ? [s.band.from, s.band.to] : [])
    const lo = s.min ?? Math.min(...all), hi = s.max ?? Math.max(...all)
    const pad = (hi - lo) * 0.1 || 1
    const y = (v) => B - ((v - (lo - pad)) / (hi - lo + 2 * pad)) * (B - T)
    const len = Math.max(...s.series.map((se) => se.points.length))
    const x = (i) => L + (i / Math.max(1, len - 1)) * (R - L)
    if (s.yLabel) c.text(L - 20, 32, s.yLabel, { size: c.S, fill: MUTED })
    c.line(L - 14, B + 8, R, B + 8, { strokeWidth: 1.4, stroke: MUTED })
    if (s.band) {
      c.rect(L, y(s.band.to), R - L, y(s.band.from) - y(s.band.to), { stroke: "none", fill: "var(--optimal)", fillStyle: "hachure", hachureGap: 10, fillWeight: 0.7, hachureAngle: -30 })
      if (s.band.label) c.text(L + 6, y(s.band.from) + c.S + 4, s.band.label, { size: c.S, fill: "var(--optimal)" })
    }
    let legendX = R
    s.series.forEach((se, k) => {
      const t = tone(se.tone ?? ["blue", "orange", "teal"][k], "line")
      c.curve(se.points.map((v, i) => [x(i), y(v)]), { stroke: t, strokeWidth: 2.6, roughness: 0.8 })
      // A lone series named like the axis needs no legend.
      if (se.label && !(s.series.length === 1 && se.label === s.yLabel)) {
        c.text(legendX, s.yLabel ? 32 : 26, se.label, { anchor: "end", size: c.S, fill: t })
        legendX -= textW(se.label, c.S) + 24
      }
    })
    const xl = s.xLabels ?? []
    if (xl.length) axisLabels(c, xl.map((_, i) => L + (i / Math.max(1, xl.length - 1)) * (R - L)), xl, B + 38, c.S)
    placed.forEach((n, i) => {
      const v = s.series[n.series ?? 0].points[n.at]
      const ty = stripTop + nrow[i] * 30
      const h = c.text(n.cx, ty, n.text, { anchor: "middle", fill: STRONG, size: ns, width: n.wrapAt })
      c.arrow(one ? n.cx : x(n.at), ty + h - nlh + 9, x(n.at), y(v) - 10, { strokeWidth: 1.5, stroke: STRONG })
    })
    return B + (s.xLabels ? 54 : 22)
  },

  // Side-by-side columns of points, stacked when narrow. {columns: [{title, items: [..], tone?}]}
  compare(s, c) {
    const n = s.columns.length
    const per = c.narrow ? 1 : n
    const gap = 24, L = c.narrow ? 24 : 30
    const bw = (c.W - 2 * L - gap * (per - 1)) / per
    const size = c.S + 1
    const colH = (col) => 76 + wrap(col.title, c.F + 2, bw - 20).length * (c.F + 2) * 1.05 - (c.F + 2) + col.items.reduce((h, it) => h + wrap(it, size, bw - 50).length * size * 1.05 + 12, 0)
    const rowH = c.narrow ? null : Math.max(...s.columns.map(colH))
    let y = 20
    s.columns.forEach((col, i) => {
      const x = c.narrow ? L : L + i * (bw + gap)
      const top = c.narrow ? y : 20
      const bh = c.narrow ? colH(col) : rowH
      const t = tone(col.tone ?? ["blue", "teal", "orange"][i], "compare")
      c.rect(x, top, bw, bh, { stroke: t, strokeWidth: 2.2 })
      let ty = top + 42
      ty += c.text(x + bw / 2, ty, col.title, { anchor: "middle", fill: t, size: c.F + 2, width: bw - 20 }) + 8
      for (const it of col.items) {
        c.circle(x + 22, ty + 4 - size * 0.4, 7, { stroke: t, fill: t, fillStyle: "solid", roughness: 0.4 })
        ty += c.text(x + 36, ty + 4, it, { width: bw - 50, size }) + 12
      }
      if (c.narrow) y += bh + 18
    })
    return c.narrow ? y + 2 : rowH + 40
  },
}

export function renderSketch(spec, where = "sketch") {
  const kind = KINDS[spec.kind]
  if (!kind) throw new Error(`${where}: unknown kind "${spec.kind}". Use one of: ${Object.keys(KINDS).join(", ")}`)
  if (!spec.alt) throw new Error(`${where}: every sketch needs "alt", a one-sentence description for screen readers`)
  const seed = hash(JSON.stringify(spec))
  const svgs = Object.entries(LAYOUTS).map(([name, layout]) => {
    const c = new Canvas(seed, layout)
    return c.svg(kind(spec, c), spec.alt, name)
  })
  const caption = spec.caption ? `<figcaption>${esc(spec.caption)}</figcaption>` : ""
  return `<figure class="sketch">${svgs.join("")}${caption}</figure>`
}

// Sätteri mdast plugin (Astro 7's Markdown processor): ```sketch blocks become figures. A bad spec fails the build
// with the file and line.
export const sketchPlugin = {
  name: "pulse-sketch",
  code(node, ctx) {
    if (node.lang !== "sketch") return
    const file = ctx.fileURL ? ctx.fileURL.pathname.split("/").pop() : "post"
    const where = `${file} line ${node.position?.start.line ?? "?"}`
    let spec
    try {
      spec = JSON.parse(node.value)
    } catch (e) {
      throw new Error(`${where}: sketch is not valid JSON (${e.message})`)
    }
    ctx.replaceNode(node, { type: "html", value: renderSketch(spec, where) })
  },
}
