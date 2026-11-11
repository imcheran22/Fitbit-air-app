import type { DailyBrief, HealthSnapshot } from '../types'
import { buildDemoSnapshot } from '../data/demo'
import type { Lang } from './i18n'

/**
 * Única puerta de entrada a los datos para la UI.
 *
 * - 'demo'  → datos sintéticos locales (sin red).
 * - 'zepp'  → pega al backend Python que habla con la nube de Zepp/Huami.
 *
 * El modo se controla con VITE_DATA_SOURCE (.env). Por defecto: demo.
 */

const MODE = (import.meta.env.VITE_DATA_SOURCE as string) || 'demo'

const PW_KEY = 'helio-site-pw'

/** Error específico para "se requiere contraseña" (HTTP 401). */
export class AuthRequiredError extends Error {
  constructor() {
    super('AUTH_REQUIRED')
    this.name = 'AuthRequiredError'
  }
}

export function setSitePassword(pw: string): void {
  sessionStorage.setItem(PW_KEY, pw)
}

export function hasSitePassword(): boolean {
  return Boolean(sessionStorage.getItem(PW_KEY))
}

function authHeaders(): Record<string, string> {
  const pw = sessionStorage.getItem(PW_KEY)
  return pw ? { 'X-Site-Password': pw } : {}
}

export async function fetchSnapshot(refresh = false): Promise<HealthSnapshot> {
  if (MODE === 'zepp') {
    // refresh=1 le dice al backend que ignore su caché y baje datos frescos.
    const res = await fetch(`/api/snapshot${refresh ? '?refresh=1' : ''}`, {
      headers: authHeaders(),
    })
    if (res.status === 401) throw new AuthRequiredError()
    if (!res.ok) {
      throw new Error(`Backend Zepp respondió ${res.status}`)
    }
    return (await res.json()) as HealthSnapshot
  }

  // Modo demo: pequeño delay para simular sincronización.
  await new Promise((r) => setTimeout(r, 450))
  return buildDemoSnapshot()
}

export async function fetchDailyBrief(
  refresh = false,
  lang: Lang = 'es',
): Promise<DailyBrief> {
  if (MODE === 'zepp') {
    const params = new URLSearchParams({ lang })
    if (refresh) params.set('refresh', '1')
    const res = await fetch(`/api/daily-brief?${params.toString()}`, {
      headers: authHeaders(),
    })
    if (res.status === 401) throw new AuthRequiredError()
    if (!res.ok) {
      throw new Error(
        lang === 'en' ? `Brief returned ${res.status}` : `Brief respondió ${res.status}`,
      )
    }
    return (await res.json()) as DailyBrief
  }

  const demo = buildDemoSnapshot()
  const today = demo.today
  return {
    date: today.date,
    generatedAt: new Date().toISOString(),
    source: 'local',
    title:
      lang === 'en'
        ? `Build: readiness ${today.readiness}`
        : `Construir: readiness ${today.readiness}`,
    summary:
      lang === 'en'
        ? `Sleep ${today.sleep.score}, HRV ${today.heart.hrv} ms, Hybrid ${today.bodyBattery}, and stress ${today.stress}.`
        : `Sueño ${today.sleep.score}, HRV ${today.heart.hrv} ms, Hybrid ${today.bodyBattery} y estrés ${today.stress}.`,
    recommendation:
      lang === 'en'
        ? 'Good day for zone 2, technique, or controlled strength.'
        : 'Buen día para zona 2, técnica o fuerza controlada.',
    focus: lang === 'en' ? 'aerobic base' : 'base aeróbica',
    bullets:
      lang === 'en'
        ? [
            `Readiness ${today.readiness}: ${today.readiness >= 70 ? 'good' : 'moderate'}.`,
            `Sleep ${today.sleep.score} with ${Math.floor(today.sleep.totalMinutes / 60)}h ${String(today.sleep.totalMinutes % 60).padStart(2, '0')}m.`,
            `Exertion ${today.exertion}% with ${today.activity.steps} steps.`,
          ]
        : [
            `Readiness ${today.readiness}: ${today.readiness >= 70 ? 'bueno' : 'moderado'}.`,
            `Sueño ${today.sleep.score} con ${Math.floor(today.sleep.totalMinutes / 60)}h ${String(today.sleep.totalMinutes % 60).padStart(2, '0')}m.`,
            `Exertion ${today.exertion}% con ${today.activity.steps} pasos.`,
          ],
    warnings: [],
  }
}

export const dataMode = MODE
