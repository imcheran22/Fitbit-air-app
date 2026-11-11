import Icon, { type IconName } from './Icon'
import { TEXT, type Lang } from '../lib/i18n'

export interface NavItem {
  id: string
  icon: IconName
  label: string
}

const NAV: Array<Omit<NavItem, 'label'> & { labelKey: keyof typeof TEXT.es }> = [
  { id: 'top', icon: 'sun', labelKey: 'navHome' },
  { id: 'sleep', icon: 'moon', labelKey: 'navSleep' },
  { id: 'heart', icon: 'heart', labelKey: 'navHeart' },
  { id: 'activity', icon: 'route', labelKey: 'navActivity' },
  { id: 'trends', icon: 'gauge', labelKey: 'navTrends' },
]

interface Props {
  active: string
  onSelect: (id: string) => void
  lang: Lang
}

export default function Sidebar({ active, onSelect, lang }: Props) {
  const copy = TEXT[lang]
  return (
    <aside className="sticky top-0 hidden h-svh w-[68px] flex-col items-center gap-1 border-r border-line py-5 lg:flex">
      <button
        onClick={() => onSelect('top')}
        title="Zepp alternative dashboard"
        className="mb-6 grid h-10 w-10 place-items-center rounded-xl glow-solar"
      >
        <Icon name="sun" size={22} className="text-solar-bright" />
      </button>
      {NAV.map((n) => {
        const isActive = n.id === active
        return (
          <button
            key={n.id}
            title={copy[n.labelKey]}
            onClick={() => onSelect(n.id)}
            className={`group relative grid h-11 w-11 place-items-center rounded-xl transition-colors ${
              isActive
                ? 'bg-surface-2 text-solar-bright'
                : 'text-faint hover:bg-surface hover:text-muted'
            }`}
          >
            {isActive && (
              <span className="absolute left-0 h-5 w-0.5 -translate-x-3 rounded-full bg-solar" />
            )}
            <Icon name={n.icon} size={19} />
          </button>
        )
      })}
    </aside>
  )
}
