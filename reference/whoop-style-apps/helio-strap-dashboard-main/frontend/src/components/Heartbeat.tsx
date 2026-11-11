interface Props {
  bpm: number
  size?: number
}

/**
 * Corazón que late al ritmo real: la duración de cada latido = 60/bpm seg,
 * así pulsa exactamente a las pulsaciones actuales del usuario.
 */
export default function Heartbeat({ bpm, size = 18 }: Props) {
  const period = bpm > 0 ? 60 / bpm : 1 // segundos por latido

  return (
    <span className="inline-flex items-center gap-1.5">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        className="text-strain"
        style={{
          animation: `heartbeat ${period.toFixed(3)}s ease-in-out infinite`,
          transformOrigin: 'center',
          filter: 'drop-shadow(0 0 4px rgba(255,94,91,0.5))',
        }}
        aria-label={`${bpm} pulsaciones por minuto`}
      >
        <path d="M12 20s-7-4.35-9.5-8.5C1 8.5 2.5 5 6 5c2 0 3 1.5 6 4 3-2.5 4-4 6-4 3.5 0 5 3.5 3.5 6.5C19 15.65 12 20 12 20Z" />
      </svg>
      <span className="font-mono tnum text-ink">{bpm}</span>
    </span>
  )
}
