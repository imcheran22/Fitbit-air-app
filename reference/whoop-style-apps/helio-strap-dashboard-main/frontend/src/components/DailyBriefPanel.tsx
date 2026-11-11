import { useState } from 'react'
import type { DailyBrief } from '../types'
import { TEXT, type Lang } from '../lib/i18n'
import Icon from './Icon'

interface Props {
  brief: DailyBrief | null
  error?: string | null
  loading: boolean
  lang: Lang
  onRefresh: () => void
}

export default function DailyBriefPanel({
  brief,
  error,
  loading,
  lang,
  onRefresh,
}: Props) {
  const copy = TEXT[lang]
  const [open, setOpen] = useState(false)

  const summary = error ?? brief?.summary ?? copy.autoBriefEmpty
  const warnings = brief?.warnings ?? []
  const bullets = brief?.bullets ?? []
  const hasDetail = Boolean(brief?.recommendation || bullets.length)

  return (
    <div>
      {/* Cabecera glanceable: título-modo + foco + refrescar */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-lg font-semibold text-ink">
              {brief?.title ?? copy.readyToGenerate}
            </h3>
            {brief?.focus && (
              <span className="rounded-full bg-elevated px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-solar-bright">
                {copy.focus}: {brief.focus}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{summary}</p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="panel-hover grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-elevated text-solar disabled:opacity-60"
          title={copy.refreshAnalysis}
        >
          <Icon name="sync" size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Alertas: siempre visibles aunque esté colapsado */}
      {warnings.length > 0 && (
        <div className="mt-3 grid gap-2">
          {warnings.map((w) => (
            <div
              key={w}
              className="rounded-lg border border-strain/30 bg-strain/10 px-3 py-2 text-[13px] text-ink"
            >
              {w}
            </div>
          ))}
        </div>
      )}

      {/* Detalle colapsable: recomendación + bullets */}
      {open && hasDetail && (
        <div className="mt-4 animate-rise border-t border-line pt-4">
          {brief?.recommendation && (
            <p className="border-l-2 border-solar pl-3 text-[14px] leading-relaxed text-ink">
              {brief.recommendation}
            </p>
          )}
          {bullets.length > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {bullets.map((b) => (
                <div
                  key={b}
                  className="rounded-lg border border-line bg-surface-2/40 px-3 py-2 text-[13px] text-muted"
                >
                  {b}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {hasDetail && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="mt-3 flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-faint transition-colors hover:text-ink"
        >
          {open ? copy.showLess : copy.showMore}
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-transform"
            style={{ transform: open ? 'rotate(180deg)' : 'none' }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}
    </div>
  )
}
