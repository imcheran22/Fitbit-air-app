import Ring from './Ring'

interface Props {
  value: number
  label: string
  display?: string
  from?: string
  to?: string
  suffix?: string
}

/** Anillo pequeño para métricas secundarias (sueño, batería corporal, estrés). */
export default function MiniRingStat({
  value,
  label,
  display,
  from,
  to,
  suffix,
}: Props) {
  return (
    <div className="flex flex-col items-center gap-2">
      <Ring value={value} size={92} stroke={8} sweep={300} from={from} to={to}>
        <span className="font-display text-lg font-semibold tnum text-ink">
          {display ?? value}
        </span>
        {suffix && (
          <span className="font-mono text-[9px] text-faint">{suffix}</span>
        )}
      </Ring>
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
        {label}
      </span>
    </div>
  )
}
