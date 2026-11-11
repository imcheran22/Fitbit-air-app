import Icon, { type IconName } from './Icon'

interface Props {
  icon: IconName
  label: string
  value: string | number
  unit?: string
  sub?: string
  accent?: string
  delay?: number
}

export default function StatTile({
  icon,
  label,
  value,
  unit,
  sub,
  accent = 'var(--color-solar)',
  delay = 0,
}: Props) {
  return (
    <div
      className="panel panel-hover animate-rise flex flex-col gap-3 p-4"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between">
        <span
          className="grid h-8 w-8 place-items-center rounded-lg"
          style={{ background: 'var(--color-surface-2)', color: accent }}
        >
          <Icon name={icon} size={16} />
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-faint">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="font-display text-2xl font-semibold tnum text-ink">
          {value}
        </span>
        {unit && <span className="font-mono text-xs text-muted">{unit}</span>}
      </div>
      {sub && <span className="-mt-1 text-[12px] text-faint">{sub}</span>}
    </div>
  )
}
