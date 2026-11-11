/**
 * Modelo de datos normalizado de Helio Strap.
 *
 * Tanto el modo demo como el adaptador de Zepp (backend) producen este
 * mismo shape. La UI sólo conoce este modelo — así, cambiar la fuente de
 * datos no toca ningún componente.
 */

export type SleepStage = 'deep' | 'light' | 'rem' | 'awake'

export interface SleepSegment {
  stage: SleepStage
  /** minutos que dura el segmento */
  minutes: number
}

export interface SleepData {
  /** minutos dormidos en total */
  totalMinutes: number
  score: number // 0-100
  bedtime: string // ISO
  wakeTime: string // ISO
  segments: SleepSegment[]
  efficiency: number // 0-100 (%)
}

export interface Point {
  /** minuto del día 0-1439, o índice en la serie */
  t: number
  v: number
}

export interface HeartRateData {
  resting: number
  current: number
  min: number
  max: number
  hrv: number // ms (RMSSD)
  /** serie del día (1 punto cada ~5 min) */
  series: Point[]
}

export interface ActivityData {
  steps: number
  stepsGoal: number
  distanceKm: number
  calories: number
  activeMinutes: number
  /** pasos por hora, 24 valores */
  hourly: number[]
}

export interface Workout {
  id: string
  type: string // "Correr", "Fuerza", ...
  start: string // ISO
  durationMin: number
  calories: number
  avgHr: number
  distanceKm?: number
}

export interface DayData {
  date: string // ISO (YYYY-MM-DD)
  /** "energía / readiness" — la métrica héroe, 0-100 */
  readiness: number
  bodyBattery: number // 0-100
  stress: number // 0-100
  exertion: number // 0-100
  spo2: number // %
  sleep: SleepData
  heart: HeartRateData
  activity: ActivityData
  workouts: Workout[]
}

export interface HealthSnapshot {
  device: {
    name: string
    model: string
    battery: number | null // 0-100; null = Zepp no expone la batería
    lastSync: string // ISO
  }
  user: {
    name: string
  }
  today: DayData
  /** historial para tendencias, orden ascendente, hoy al final (hasta 30 días) */
  week: DayData[]
  source: 'demo' | 'zepp'
}

export interface DailyBrief {
  date: string
  generatedAt: string
  source: 'openai' | 'local' | 'local-fallback'
  title: string
  summary: string
  recommendation: string
  focus: string
  bullets: string[]
  warnings: string[]
}
