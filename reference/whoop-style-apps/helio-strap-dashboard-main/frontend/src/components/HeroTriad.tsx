import type { DayData } from '../types'
import { scoreLabel } from '../lib/format'
import { type Lang } from '../lib/i18n'
import Ring from './Ring'

interface Props {
  today: DayData
  lang: Lang
}

/** gradiente por zona estilo WHOOP para el anillo de recuperación */
function recoveryZone(v: number): [string, string] {
  if (v >= 67) return ['var(--color-recovery-deep, #0bbf86)', '#5cf2c2']
  if (v >= 34) return ['#e0a516', '#ffd86a']
  return ['#d23a4a', '#ff7a86']
}

function Pillar({
  value,
  display,
  label,
  unit,
  from,
  to,
}: {
  value: number
  display: string
  label: string
  unit?: string
  from: string
  to: string
}) {
  return (
    <div className="flex items-center gap-3">
      <Ring value={value} size={74} stroke={7} sweep={300} from={from} to={to}>
        <span className="font-display text-base font-semibold tnum text-ink">
          {display}
        </span>
      </Ring>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
          {label}
        </div>
        <div className="font-display text-xl font-semibold tnum text-ink">
          {display}
          {unit && <span className="ml-1 font-mono text-xs text-faint">{unit}</span>}
        </div>
      </div>
    </div>
  )
}

export default function HeroTriad({ today, lang }: Props) {
  const en = lang === 'en'
  const [rFrom, rTo] = recoveryZone(today.readiness)
  const good = today.readiness >= 67
  // En español el adjetivo concuerda con "energía" (femenino): Moderado→Moderada.
  const label = scoreLabel(today.readiness, lang)
  const energyWord = (en ? label : label.replace(/o$/, 'a')).toLowerCase()

  return (
    <div className="flex flex-col items-center gap-6 md:flex-row md:items-center md:gap-8">
      {/* Recuperación — anillo héroe, color por zona */}
      <div className="relative shrink-0">
        <div
          aria-hidden
          className="absolute -inset-4 rounded-full"
          style={{
            background: `radial-gradient(circle, ${rTo}22, transparent 65%)`,
            filter: 'blur(8px)',
          }}
        />
        <Ring value={today.readiness} size={188} stroke={13} glow from={rFrom} to={rTo}>
          <span className="font-display text-5xl font-bold tnum text-ink">
            {today.readiness}
          </span>
          <span
            className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em]"
            style={{ color: rTo }}
          >
            {scoreLabel(today.readiness, lang)}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
            {en ? 'recovery' : 'recuperación'}
          </span>
        </Ring>
      </div>

      {/* Strain + Sueño + insight */}
      <div className="flex w-full flex-col gap-4">
        <Pillar
          value={today.exertion}
          display={String(today.exertion)}
          unit="%"
          label={en ? 'Strain' : 'Esfuerzo'}
          from="var(--color-effort)"
          to="#7fe6ff"
        />
        <Pillar
          value={today.sleep.score}
          display={String(today.sleep.score)}
          label={en ? 'Sleep' : 'Sueño'}
          from="var(--color-sleep)"
          to="#b8b4ff"
        />
        <p className="border-t border-line pt-3 text-[13px] leading-relaxed text-muted">
          {en ? 'Your energy is ' : 'Tu energía está '}
          <b className="text-ink">{energyWord}</b>
          {good
            ? en
              ? '. Good day to push.'
              : '. Buen día para empujar.'
            : en
              ? '. Consider a lighter session.'
              : '. Considera una sesión ligera.'}
        </p>
      </div>
    </div>
  )
}
