import { useId } from 'react'
import type { Point } from '../types'
import { type Lang } from '../lib/i18n'

interface Props {
  series: Point[]
  resting: number
  height?: number
  lang: Lang
}

/** Spline monótona (Fritsch–Carlson) → curva suave sin overshoot. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return pts.length ? `M${pts[0].x},${pts[0].y}` : ''
  const n = pts.length
  const dx: number[] = []
  const slope: number[] = []
  for (let i = 0; i < n - 1; i++) {
    const h = pts[i + 1].x - pts[i].x || 1e-6
    dx.push(h)
    slope.push((pts[i + 1].y - pts[i].y) / h)
  }
  const m: number[] = [slope[0]]
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) m.push(0)
    else m.push((slope[i - 1] + slope[i]) / 2)
  }
  m.push(slope[n - 2])
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`
  for (let i = 0; i < n - 1; i++) {
    const x1 = pts[i].x + dx[i] / 3
    const y1 = pts[i].y + (m[i] * dx[i]) / 3
    const x2 = pts[i + 1].x - dx[i] / 3
    const y2 = pts[i + 1].y - (m[i + 1] * dx[i]) / 3
    d += ` C${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)} ${pts[
      i + 1
    ].x.toFixed(1)},${pts[i + 1].y.toFixed(1)}`
  }
  return d
}

/**
 * Curva de frecuencia cardíaca del día. Eje X = hora real (0-24 h), así los
 * picos de entreno caen en su hora; curva suavizada + pico marcado.
 */
export default function HeartRateChart({
  series,
  resting,
  height = 160,
  lang,
}: Props) {
  const id = useId().replace(/:/g, '')
  const en = lang === 'en'
  const W = 640
  const H = height
  const padX = 8
  const padTop = 16
  const padBottom = 18

  if (series.length < 2) {
    return (
      <div className="grid h-[160px] place-items-center text-[13px] text-faint">
        {en ? 'No heart-rate data' : 'Sin datos de frecuencia'}
      </div>
    )
  }

  const vals = series.map((p) => p.v)
  const min = Math.min(...vals, resting) - 6
  const max = Math.max(...vals) + 8

  // Eje X por minuto del día (0-1439). Si la serie no trae 't' usa el índice.
  const hasClock = series.every((p) => typeof p.t === 'number')
  const tx = (p: Point, i: number) =>
    hasClock ? p.t / 1439 : i / (series.length - 1)
  const x = (p: Point, i: number) => padX + tx(p, i) * (W - padX * 2)
  const y = (v: number) =>
    H - padBottom - ((v - min) / (max - min)) * (H - padTop - padBottom)

  const pts = series.map((p, i) => ({ x: x(p, i), y: y(p.v) }))
  const line = smoothPath(pts)
  const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${H - padBottom} L${pts[0].x.toFixed(
    1,
  )},${H - padBottom} Z`
  const restY = y(resting)

  // Pico del día
  const peakIdx = vals.indexOf(Math.max(...vals))
  const peak = { x: x(series[peakIdx], peakIdx), y: y(vals[peakIdx]), v: vals[peakIdx] }

  const ticks = [0, 6, 12, 18, 24]

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label={en ? 'Heart rate during the day' : 'Frecuencia cardíaca durante el día'}
    >
      <defs>
        <linearGradient id={`hr-fill-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-strain)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--color-strain)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`hr-line-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--color-solar)" />
          <stop offset="55%" stopColor="var(--color-effort)" />
          <stop offset="100%" stopColor="var(--color-strain)" />
        </linearGradient>
      </defs>

      {/* rejilla horaria */}
      {hasClock &&
        ticks.map((h) => {
          const gx = padX + (h / 24) * (W - padX * 2)
          return (
            <g key={h}>
              <line
                x1={gx}
                x2={gx}
                y1={padTop - 6}
                y2={H - padBottom}
                stroke="var(--color-line)"
                strokeWidth="1"
              />
              <text
                x={gx}
                y={H - 5}
                textAnchor={h === 0 ? 'start' : h === 24 ? 'end' : 'middle'}
                className="font-mono"
                fontSize="9"
                fill="var(--color-faint)"
              >
                {String(h).padStart(2, '0')}
              </text>
            </g>
          )
        })}

      {/* línea de reposo */}
      <line
        x1={padX}
        x2={W - padX}
        y1={restY}
        y2={restY}
        stroke="var(--color-line-strong)"
        strokeDasharray="3 5"
      />
      <text
        x={padX}
        y={restY - 5}
        className="font-mono"
        fontSize="10"
        fill="var(--color-faint)"
      >
        {en ? 'resting' : 'reposo'} {resting}
      </text>

      <path d={area} fill={`url(#hr-fill-${id})`} />
      <path
        d={line}
        fill="none"
        stroke={`url(#hr-line-${id})`}
        strokeWidth="2.25"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* pico del día */}
      <circle cx={peak.x} cy={peak.y} r="3.5" fill="var(--color-strain)" />
      <circle
        cx={peak.x}
        cy={peak.y}
        r="6.5"
        fill="none"
        stroke="var(--color-strain)"
        strokeOpacity="0.35"
        strokeWidth="2"
      />
      <text
        x={Math.min(peak.x, W - 24)}
        y={Math.max(peak.y - 12, 12)}
        textAnchor="middle"
        className="font-mono"
        fontSize="11"
        fontWeight="600"
        fill="var(--color-ink)"
      >
        {peak.v}
      </text>
    </svg>
  )
}
