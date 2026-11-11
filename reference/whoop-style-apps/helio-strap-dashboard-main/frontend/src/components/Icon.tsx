import type { ReactElement } from 'react'

interface Props {
  name: IconName
  size?: number
  className?: string
}

export type IconName =
  | 'heart'
  | 'steps'
  | 'moon'
  | 'flame'
  | 'drop'
  | 'bolt'
  | 'pulse'
  | 'gauge'
  | 'sun'
  | 'route'
  | 'sync'
  | 'battery'

const PATHS: Record<IconName, ReactElement> = {
  heart: (
    <path d="M12 20s-7-4.35-9.5-8.5C1 8.5 2.5 5 6 5c2 0 3 1.5 6 4 3-2.5 4-4 6-4 3.5 0 5 3.5 3.5 6.5C19 15.65 12 20 12 20Z" />
  ),
  steps: (
    <>
      <path d="M7 4c1.5 0 2.5 1.5 2.5 4S8.5 14 7 14s-2.5-2.5-2.5-6S5.5 4 7 4Z" />
      <path d="M5 16c2 0 3 1 3 2.5S7 21 5.5 21 3 19.5 3 18s.5-2 2-2Z" />
      <path d="M17 7c1.5 0 2.5 1.5 2.5 4S18.5 17 17 17s-2.5-2.5-2.5-6S15.5 7 17 7Z" />
      <path d="M15 19c2 0 3 1 3 2.5" opacity="0" />
    </>
  ),
  moon: <path d="M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5Z" />,
  flame: (
    <path d="M12 3c1 3 4 4 4 8a4 4 0 0 1-8 0c0-1.5.5-2.5 1.2-3.3C9 9 9 11 10.5 11c1 0 1.2-1 .8-2.2C10.7 6.7 11 4.3 12 3Z" />
  ),
  drop: <path d="M12 3c3 4 6 6.5 6 10a6 6 0 0 1-12 0c0-3.5 3-6 6-10Z" />,
  bolt: <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />,
  pulse: <path d="M2 12h5l2-6 4 12 2-6h7" />,
  gauge: (
    <>
      <path d="M4 18a8 8 0 1 1 16 0" />
      <path d="M12 14l4-3" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6" />
    </>
  ),
  sync: <path d="M21 12a9 9 0 1 1-3-6.7M21 4v4h-4" />,
  battery: (
    <>
      <rect x="2" y="8" width="17" height="8" rx="2" />
      <path d="M22 11v2" />
    </>
  ),
}

export default function Icon({ name, size = 18, className = '' }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  )
}
