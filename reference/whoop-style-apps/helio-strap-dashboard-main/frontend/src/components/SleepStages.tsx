import type { SleepData, SleepStage } from '../types'
import { hm, clock } from '../lib/format'
import { TEXT, type Lang } from '../lib/i18n'

// Las etiquetas vienen del i18n (stageLabel); aquí solo color y nivel visual.
const STAGE_META: Record<SleepStage, { color: string; level: number }> = {
  deep: { color: '#5b4fd0', level: 3 },
  light: { color: '#9b8cf0', level: 2 },
  rem: { color: '#57b6d6', level: 1 },
  awake: { color: '#ff9d2e', level: 0 },
}
const ORDER: SleepStage[] = ['deep', 'light', 'rem', 'awake']

export default function SleepStages({
  sleep,
  lang,
}: {
  sleep: SleepData
  lang: Lang
}) {
  const copy = TEXT[lang]
  const stageLabel: Record<SleepStage, string> = {
    deep: copy.deep,
    light: copy.light,
    rem: copy.rem,
    awake: copy.awake,
  }
  const total = sleep.totalMinutes
  const totals: Record<SleepStage, number> = {
    deep: 0,
    light: 0,
    rem: 0,
    awake: 0,
  }
  sleep.segments.forEach((s) => (totals[s.stage] += s.minutes))

  // hipnograma escalonado (4 niveles) sobre un eje temporal
  const W = 640
  const H = 110
  const rowH = H / 4
  let acc = 0
  const pts: { x: number; level: number }[] = []
  sleep.segments.forEach((s) => {
    const x0 = (acc / total) * W
    acc += s.minutes
    const x1 = (acc / total) * W
    pts.push({ x: x0, level: STAGE_META[s.stage].level })
    pts.push({ x: x1, level: STAGE_META[s.stage].level })
  })
  const stepLine = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${(p.level * rowH + rowH / 2).toFixed(1)}`)
    .join(' ')

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
        {/* bandas por nivel */}
        {ORDER.map((st, i) => (
          <rect
            key={st}
            x={0}
            y={i * rowH}
            width={W}
            height={rowH}
            fill={STAGE_META[st].color}
            opacity={0.06}
          />
        ))}
        {/* segmentos coloreados */}
        {(() => {
          let a = 0
          return sleep.segments.map((s, idx) => {
            const x0 = (a / total) * W
            a += s.minutes
            const x1 = (a / total) * W
            const lvl = STAGE_META[s.stage].level
            return (
              <rect
                key={idx}
                x={x0}
                y={lvl * rowH + rowH * 0.2}
                width={Math.max(0.5, x1 - x0)}
                height={rowH * 0.6}
                rx={2}
                fill={STAGE_META[s.stage].color}
              />
            )
          })
        })()}
        <path d={stepLine} fill="none" stroke="rgba(255,240,220,0.22)" strokeWidth="1" />
      </svg>

      <div className="mt-3 flex justify-between font-mono text-[11px] text-faint">
        <span>{clock(sleep.bedtime, lang)}</span>
        <span>{clock(sleep.wakeTime, lang)}</span>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        {ORDER.map((st) => (
          <div key={st} className="rounded-lg bg-surface-2 px-3 py-2">
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: STAGE_META[st].color }}
              />
              <span className="text-[11px] text-muted">{stageLabel[st]}</span>
            </div>
            <div className="mt-1 font-mono text-sm text-ink tnum">
              {hm(totals[st])}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
