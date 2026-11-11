import type { HealthSnapshot } from '../types'
import Icon from './Icon'
import { localDateKey, longDate, relTime } from '../lib/format'
import { TEXT, type Lang } from '../lib/i18n'

interface Props {
  data: HealthSnapshot
  onRefresh: () => void
  refreshing: boolean
  lang: Lang
  onLangToggle: () => void
}

export default function TopBar({
  data,
  onRefresh,
  refreshing,
  lang,
  onLangToggle,
}: Props) {
  const copy = TEXT[lang]
  const isCurrentDay = data.today.date === localDateKey()
  const dateLabel = longDate(data.today.date, lang)
  const recordLabel = isCurrentDay ? dateLabel : `${copy.lastRecord} · ${dateLabel}`
  const sourceLabel =
    data.source === 'zepp'
      ? isCurrentDay
        ? copy.sourceLive
        : copy.sourceConnected
      : copy.demoMode
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              data.source === 'zepp' ? 'bg-recovery' : 'bg-solar'
            }`}
            style={{ animation: 'pulse-soft 2.4s ease-in-out infinite' }}
          />
          {sourceLabel}
        </div>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink">
          {copy.hello}, {data.user.name}
        </h1>
        <p className="mt-0.5 text-sm text-muted">{recordLabel}</p>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onLangToggle}
          className="panel panel-hover flex h-[52px] items-center gap-1 rounded-lg px-2 font-mono text-[11px] uppercase text-muted"
          title={copy.language}
        >
          <span
            className={`rounded-md px-2 py-1 ${
              lang === 'es' ? 'bg-surface-2 text-solar-bright' : 'text-faint'
            }`}
          >
            ES
          </span>
          <span
            className={`rounded-md px-2 py-1 ${
              lang === 'en' ? 'bg-surface-2 text-solar-bright' : 'text-faint'
            }`}
          >
            EN
          </span>
        </button>
        <div className="panel flex items-center gap-2.5 px-3.5 py-2">
          <Icon
            name="battery"
            size={16}
            className={data.device.battery != null ? 'text-recovery' : 'text-faint'}
          />
          <div className="leading-tight">
            <div
              className="font-mono text-sm tnum text-ink"
              title={
                data.device.battery == null ? copy.batteryUnavailable : undefined
              }
            >
              {data.device.battery != null ? `${data.device.battery}%` : '—'}
            </div>
            <div className="font-mono text-[10px] text-faint">
              {data.device.model}
            </div>
          </div>
        </div>
        <button
          onClick={onRefresh}
          className="panel panel-hover flex items-center gap-2 px-3.5 py-2.5 text-sm text-muted hover:text-ink"
        >
          <Icon
            name="sync"
            size={16}
            className={refreshing ? 'animate-spin text-solar' : 'text-solar'}
          />
          <span className="hidden font-mono text-[11px] sm:inline">
            {relTime(data.device.lastSync, lang)}
          </span>
        </button>
      </div>
    </header>
  )
}
