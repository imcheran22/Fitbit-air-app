import type { DayData } from '../types'
import { scoreLabel } from '../lib/format'
import { TEXT, type Lang } from '../lib/i18n'

interface Props {
  today: DayData
  week: DayData[]
  lang: Lang
}

interface Driver {
  label: string
  value: string
  detail: string
  impact: number
  polarity: 'up' | 'down' | 'flat'
}

function avg(values: number[]): number {
  const clean = values.filter((v) => Number.isFinite(v) && v > 0)
  return clean.length ? clean.reduce((sum, v) => sum + v, 0) / clean.length : 0
}

function signed(n: number, unit = ''): string {
  const rounded = Math.round(n)
  return `${rounded > 0 ? '+' : ''}${rounded}${unit}`
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function tone(driver: Driver): string {
  if (driver.polarity === 'up') return 'var(--color-recovery)'
  if (driver.polarity === 'down') return 'var(--color-strain)'
  return 'var(--color-solar)'
}

export default function RecoveryCoach({ today, week, lang }: Props) {
  const copy = TEXT[lang]
  const baselineDays = week.slice(0, -1)
  const sleepAvg = avg(baselineDays.map((d) => d.sleep.score))
  const hrvAvg = avg(baselineDays.map((d) => d.heart.hrv))
  const rhrAvg = avg(baselineDays.map((d) => d.heart.resting))
  const stressAvg = avg(baselineDays.map((d) => d.stress))
  const hybridAvg = avg(baselineDays.map((d) => d.bodyBattery))

  const sleepDelta = today.sleep.score - sleepAvg
  const hrvDeltaPct = hrvAvg ? ((today.heart.hrv - hrvAvg) / hrvAvg) * 100 : 0
  const rhrDelta = rhrAvg - today.heart.resting
  const stressDelta = stressAvg - today.stress
  const hybridDelta = today.bodyBattery - hybridAvg
  const heartUnit = lang === 'en' ? 'bpm' : 'ppm'

  const drivers: Driver[] = [
    {
      label: copy.sleep,
      value: String(today.sleep.score),
      detail: `${signed(sleepDelta)} ${copy.vsBase}`,
      impact: clamp(Math.abs(sleepDelta) * 4, 8, 100),
      polarity: sleepDelta >= 2 ? 'up' : sleepDelta <= -2 ? 'down' : 'flat',
    },
    {
      label: 'HRV',
      value: `${today.heart.hrv}ms`,
      detail: `${signed(hrvDeltaPct, '%')} ${copy.vsBase}`,
      impact: clamp(Math.abs(hrvDeltaPct) * 3, 8, 100),
      polarity: hrvDeltaPct >= 5 ? 'up' : hrvDeltaPct <= -5 ? 'down' : 'flat',
    },
    {
      label: 'RHR',
      value: `${today.heart.resting}`,
      detail: `${signed(rhrDelta)} ${heartUnit} ${copy.vsBase}`,
      impact: clamp(Math.abs(rhrDelta) * 12, 8, 100),
      polarity: rhrDelta >= 2 ? 'up' : rhrDelta <= -2 ? 'down' : 'flat',
    },
    {
      label: copy.stress,
      value: String(today.stress),
      detail: `${signed(stressDelta)} ${copy.vsBase}`,
      impact: clamp(Math.abs(stressDelta) * 5, 8, 100),
      polarity: stressDelta >= 5 ? 'up' : stressDelta <= -5 ? 'down' : 'flat',
    },
    {
      label: 'Hybrid',
      value: String(today.bodyBattery),
      detail: `${signed(hybridDelta)} ${copy.vsBase}`,
      impact: clamp(Math.abs(hybridDelta) * 3, 8, 100),
      polarity: hybridDelta >= 5 ? 'up' : hybridDelta <= -5 ? 'down' : 'flat',
    },
  ]

  const positive = drivers.filter((d) => d.polarity === 'up').length
  const negative = drivers.filter((d) => d.polarity === 'down').length
  const mode =
    today.readiness >= 75
      ? copy.push
      : today.readiness >= 55
      ? negative > positive
        ? copy.easyBuild
        : copy.build
      : copy.protect
  const coaching =
    mode === copy.push
      ? copy.highLoadOk
      : mode === copy.protect
      ? copy.protectCoach
      : today.exertion <= 10
      ? copy.zone2Coach
      : copy.moderateCoach

  return (
    <div className="grid gap-5 lg:grid-cols-[0.9fr_1.4fr]">
      <div className="flex flex-col justify-between rounded-xl border border-line bg-surface-2/60 p-4">
        <div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
              {copy.recoveryMode}
            </span>
            <span className="rounded-full border border-line-strong px-2.5 py-1 font-mono text-[10px] uppercase text-solar-bright">
              {mode}
            </span>
          </div>
          <div className="mt-5 flex items-end gap-3">
            <span className="font-display text-6xl font-bold leading-none tnum text-ink">
              {today.readiness}
            </span>
            <div className="pb-2">
              <div className="font-mono text-xs uppercase text-solar-bright">
                {scoreLabel(today.readiness, lang)}
              </div>
              <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-elevated">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${today.readiness}%`,
                    background:
                      'linear-gradient(90deg, var(--color-strain), var(--color-solar), var(--color-recovery))',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
        <p className="mt-5 text-[13px] leading-relaxed text-muted">{coaching}</p>
      </div>

      <div className="grid gap-3">
        {drivers.map((d) => (
          <div
            key={d.label}
            className="grid grid-cols-[64px_1fr] items-center gap-3 border-b border-line pb-3 last:border-b-0 last:pb-0 sm:grid-cols-[72px_1fr_auto]"
          >
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-faint">
                {d.label}
              </div>
              <div className="mt-0.5 font-display text-lg font-semibold tnum text-ink">
                {d.value}
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-elevated">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${d.impact}%`,
                  background: tone(d),
                }}
              />
            </div>
            <div
              className="col-span-2 text-right font-mono text-[11px] tnum sm:col-span-1 sm:w-24"
              style={{ color: tone(d) }}
            >
              {d.detail}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
