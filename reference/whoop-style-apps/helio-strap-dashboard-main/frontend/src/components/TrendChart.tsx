import { useState } from 'react'
import type { DayData } from '../types'
import { weekday, scoreTone } from '../lib/format'
import { TEXT, type Lang } from '../lib/i18n'

interface Props {
  /** historial disponible, ascendente, hoy al final (hasta 30 días) */
  data: DayData[]
  metric: (d: DayData) => number
  lang: Lang
  /** gradiente de la línea/área — reutiliza los colores ya usados para esta
   *  métrica en otras partes del dashboard (anillos, HeroTriad, etc.) */
  colorFrom: string
  colorTo: string
  /** true para métricas donde BAJO es bueno (p. ej. estrés) */
  invert?: boolean
  /**
   * 'fixed100' — la métrica ya es un score 0-100 (readiness, sueño, estrés):
   *   usa una escala absoluta con grid en 25/50/75, y colorea cada punto por
   *   zona (scoreTone) porque 0-100 tiene un significado universal.
   * 'auto' — la métrica NO es un score (p. ej. HRV en ms): escala dinámica al
   *   rango de los datos visibles, sin colorear por zona (un valor absoluto
   *   de HRV no es "bueno/malo" sin conocer tu propio baseline — eso ya lo
   *   cubre RecoveryCoach comparando contra tus propios 7 días).
   */
  scale?: 'fixed100' | 'auto'
  /** sufijo mostrado junto al valor actual del footer, p. ej. 'ms' */
  unit?: string
}

type Range = 7 | 30

/** Tendencia de una métrica como línea + área + puntos, con toggle 7D/30D. */
export default function TrendChart({
  data,
  metric,
  lang,
  colorFrom,
  colorTo,
  invert = false,
  scale = 'fixed100',
  unit = '',
}: Props) {
  const copy = TEXT[lang]
  const [range, setRange] = useState<Range>(7)

  // Si aún no hay 30 días de historial (cuenta nueva), el toggle 30D usa lo
  // que haya disponible en vez de reventar o mostrar huecos.
  const days = data.slice(-range)
  const dense = days.length > 10

  const vals = days.map(metric)
  const width = 320
  const height = 150
  const padX = 18
  const padTop = 14
  const padBottom = 28
  const plotH = height - padTop - padBottom
  const step = days.length > 1 ? (width - padX * 2) / (days.length - 1) : 0

  // Rango vertical: absoluto 0-100 para scores, dinámico para el resto.
  let lo = 0
  let hi = 100
  if (scale === 'auto' && vals.length) {
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const pad = Math.max(2, (max - min) * 0.2)
    lo = Math.max(0, Math.floor(min - pad))
    hi = Math.ceil(max + pad)
    if (hi - lo < 4) hi = lo + 4 // evita aplastar la línea si hay poca variación
  }
  const norm = (v: number) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)))
  const dotColor = (v: number) => (scale === 'auto' ? colorTo : scoreTone(v, invert))

  const points = vals.map((v, i) => ({
    date: days[i].date,
    value: v,
    x: padX + i * step,
    y: padTop + (1 - norm(v)) * plotH,
  }))
  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ')
  const area = `${line} L ${points[points.length - 1]?.x ?? padX} ${height - padBottom} L ${padX} ${
    height - padBottom
  } Z`
  const latest = points[points.length - 1]

  // En vista de 30 días no caben todas las etiquetas: mostramos cada ~5º
  // punto + el más reciente, para no amontonar texto.
  const labelStep = dense ? Math.ceil(points.length / 6) : 1
  const showLabel = (i: number) => i === points.length - 1 || i % labelStep === 0

  const gridLines =
    scale === 'fixed100' ? [25, 50, 75] : [lo + (hi - lo) * 0.25, lo + (hi - lo) * 0.75]

  return (
    <div>
      <div className="mb-2 flex justify-end gap-1">
        {([7, 30] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`rounded-md px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors ${
              range === r
                ? 'bg-elevated text-solar-bright'
                : 'text-faint hover:text-muted'
            }`}
          >
            {r}D
          </button>
        ))}
      </div>
      <div className="h-44">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-full w-full overflow-visible"
          role="img"
          aria-label={lang === 'en' ? 'Metric trend over time' : 'Tendencia de la métrica en el tiempo'}
        >
          <defs>
            <linearGradient id={`area-${colorFrom}-${colorTo}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colorFrom} stopOpacity="0.28" />
              <stop offset="100%" stopColor={colorFrom} stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id={`line-${colorFrom}-${colorTo}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={colorFrom} />
              <stop offset="100%" stopColor={colorTo} />
            </linearGradient>
          </defs>

          {gridLines.map((v) => {
            const y = padTop + (1 - norm(v)) * plotH
            return (
              <g key={v}>
                <line
                  x1={padX}
                  x2={width - padX}
                  y1={y}
                  y2={y}
                  stroke="var(--color-line)"
                  strokeDasharray="4 7"
                />
                <text
                  x={width - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-faint font-mono text-[9px]"
                >
                  {Math.round(v)}
                </text>
              </g>
            )
          })}

          <path d={area} fill={`url(#area-${colorFrom}-${colorTo})`} />
          <path
            d={line}
            fill="none"
            stroke={`url(#line-${colorFrom}-${colorTo})`}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={dense ? 2.5 : 4}
          />

          {points.map((p, i) => {
            const active = i === points.length - 1
            const label = showLabel(i)
            const tone = dotColor(p.value)
            return (
              <g key={p.date}>
                {label && (
                  <line
                    x1={p.x}
                    x2={p.x}
                    y1={p.y + 9}
                    y2={height - padBottom}
                    stroke={tone}
                    strokeOpacity={active ? 0.5 : 0.22}
                    strokeWidth="2"
                  />
                )}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={active ? (dense ? 5 : 7) : dense ? 2.5 : 5}
                  fill={tone}
                  stroke="var(--color-bg)"
                  strokeWidth={dense ? 1.5 : 3}
                  style={{
                    filter: active ? `drop-shadow(0 0 10px ${colorTo})` : 'none',
                  }}
                />
                {label && (
                  <>
                    <text
                      x={p.x}
                      y={Math.max(11, p.y - 12)}
                      textAnchor="middle"
                      className={`fill-current font-mono text-[11px] tnum ${
                        active ? 'text-solar-bright' : 'text-muted'
                      }`}
                    >
                      {Math.round(p.value)}
                    </text>
                    <text
                      x={p.x}
                      y={height - 7}
                      textAnchor="middle"
                      className={`fill-current font-mono text-[10px] uppercase ${
                        active ? 'text-solar-bright' : 'text-faint'
                      }`}
                    >
                      {weekday(p.date, lang)}
                    </text>
                  </>
                )}
              </g>
            )
          })}
        </svg>
      </div>
      {latest && (
        <div className="-mt-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-faint">
          <span>{range === 7 ? copy.sevenDays : copy.thirtyDays}</span>
          <span className="text-solar-bright">
            {copy.current} {Math.round(latest.value)}
            {unit}
          </span>
        </div>
      )}
    </div>
  )
}
