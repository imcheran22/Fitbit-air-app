interface Props {
  hourly: number[]
}

/** Pasos por hora — barras con acento solar y etiquetas cada 6 h. */
export default function ActivityBars({ hourly }: Props) {
  const max = Math.max(...hourly, 1)
  return (
    <div>
      <div className="flex h-32 items-end gap-[3px]">
        {hourly.map((v, h) => {
          const pct = (v / max) * 100
          const hot = v > max * 0.6
          return (
            <div
              key={h}
              className="group relative flex-1"
              style={{ height: '100%', display: 'flex', alignItems: 'flex-end' }}
            >
              <div
                className="w-full rounded-t-sm transition-all"
                style={{
                  height: `${Math.max(2, pct)}%`,
                  background: hot
                    ? 'linear-gradient(180deg, var(--color-solar-bright), var(--color-solar-deep))'
                    : 'var(--color-line-strong)',
                }}
              />
              <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-ink opacity-0 transition-opacity group-hover:opacity-100">
                {v}
              </span>
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] text-faint">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </div>
    </div>
  )
}
