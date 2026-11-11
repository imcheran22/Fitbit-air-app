import { locale, type Lang } from './i18n'

export function hm(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = Math.round(totalMinutes % 60)
  return `${h}h ${String(m).padStart(2, '0')}m`
}

export function clock(iso: string, lang: Lang = 'es'): string {
  return new Date(iso).toLocaleTimeString(locale(lang), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function weekday(iso: string, lang: Lang = 'es'): string {
  return new Date(iso).toLocaleDateString(locale(lang), { weekday: 'short' })
}

export function localDateKey(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function longDate(isoDate: string, lang: Lang = 'es'): string {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString(locale(lang), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

export function relTime(iso: string, lang: Lang = 'es'): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return lang === 'en' ? 'now' : 'ahora'
  if (min < 60) return lang === 'en' ? `${min} min ago` : `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return lang === 'en' ? `${h} h ago` : `hace ${h} h`
  return lang === 'en' ? `${Math.round(h / 24)} d ago` : `hace ${Math.round(h / 24)} d`
}

export const nf = new Intl.NumberFormat('es')

export function numberFormat(lang: Lang): Intl.NumberFormat {
  return new Intl.NumberFormat(locale(lang))
}

/**
 * Color semántico por zonas estilo WHOOP (verde / amarillo / rojo).
 * `invert` es para métricas donde BAJO es bueno (p. ej. estrés): así un
 * valor bajo cae en zona verde en vez de roja.
 */
export function scoreTone(v: number, invert = false): string {
  const score = invert ? 100 - v : v
  if (score >= 67) return 'var(--color-recovery)' // verde — recuperado
  if (score >= 34) return 'var(--color-recovery-mid)' // amarillo — medio
  return 'var(--color-recovery-low)' // rojo — bajo
}

export function scoreLabel(v: number, lang: Lang = 'es'): string {
  if (lang === 'en') {
    if (v >= 85) return 'Optimal'
    if (v >= 70) return 'Good'
    if (v >= 50) return 'Moderate'
    if (v >= 35) return 'Low'
    return 'Critical'
  }
  if (v >= 85) return 'Óptimo'
  if (v >= 70) return 'Bueno'
  if (v >= 50) return 'Moderado'
  if (v >= 35) return 'Bajo'
  return 'Crítico'
}
