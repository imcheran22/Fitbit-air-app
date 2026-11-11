import { useEffect, useId, useState, type ReactNode } from 'react'

interface RingProps {
  value: number // 0-100
  size?: number
  stroke?: number
  /** ángulo total del arco en grados (360 = círculo completo) */
  sweep?: number
  from?: string
  to?: string
  trackColor?: string
  glow?: boolean
  children?: ReactNode
  delay?: number
}

/**
 * Anillo/medidor SVG genérico con animación de barrido.
 * Es la base del "anillo solar" héroe y de los anillos secundarios.
 */
export default function Ring({
  value,
  size = 220,
  stroke = 14,
  sweep = 360,
  from = 'var(--color-solar-deep)',
  to = 'var(--color-solar-bright)',
  trackColor = 'rgba(255,240,220,0.07)',
  glow = false,
  children,
  delay = 0,
}: RingProps) {
  const id = useId().replace(/:/g, '')
  const r = (size - stroke) / 2
  const cx = size / 2
  const cy = size / 2
  const circ = 2 * Math.PI * r
  const arc = (sweep / 360) * circ
  const pct = Math.max(0, Math.min(100, value)) / 100

  const [draw, setDraw] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setDraw(pct), 80 + delay)
    return () => clearTimeout(t)
  }, [pct, delay])

  // rota para empezar arriba; si es arco parcial, lo centra abajo
  const rotation = sweep >= 360 ? -90 : 90 + (360 - sweep) / 2

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ display: 'block' }}>
        <defs>
          <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
          {glow && (
            <filter id={`glow-${id}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          )}
        </defs>
        <g transform={`rotate(${rotation} ${cx} ${cy})`}>
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={trackColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${arc} ${circ}`}
          />
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={`url(#grad-${id})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${arc * draw} ${circ}`}
            filter={glow ? `url(#glow-${id})` : undefined}
            style={{ transition: 'stroke-dasharray 1.1s cubic-bezier(0.22,1,0.36,1)' }}
          />
        </g>
      </svg>
      {children && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}
