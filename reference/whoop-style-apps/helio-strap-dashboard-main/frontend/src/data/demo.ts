import type {
  DayData,
  HealthSnapshot,
  Point,
  SleepSegment,
  Workout,
} from '../types'

/**
 * Generador de datos demo determinista (semilla fija) para que el
 * dashboard se vea idéntico en cada carga. Imita lo que devolvería el
 * adaptador de Zepp.
 */

// PRNG simple y determinista (mulberry32)
function rng(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v))

function buildSleep(r: () => number) {
  // Una noche típica: ciclos de ~90 min entre ligero/profundo/REM
  const segs: SleepSegment[] = []
  const cycles = 5
  for (let c = 0; c < cycles; c++) {
    segs.push({ stage: 'light', minutes: Math.round(18 + r() * 12) })
    segs.push({ stage: 'deep', minutes: Math.round(22 + r() * 18) })
    segs.push({ stage: 'light', minutes: Math.round(14 + r() * 10) })
    segs.push({ stage: 'rem', minutes: Math.round(16 + r() * 18) })
    if (r() > 0.6) segs.push({ stage: 'awake', minutes: Math.round(2 + r() * 7) })
  }
  const totalMinutes = segs.reduce((s, x) => s + x.minutes, 0)
  const awake = segs
    .filter((s) => s.stage === 'awake')
    .reduce((s, x) => s + x.minutes, 0)
  const efficiency = Math.round(((totalMinutes - awake) / totalMinutes) * 100)
  return { segs, totalMinutes, efficiency }
}

function buildHrSeries(r: () => number, resting: number): Point[] {
  const series: Point[] = []
  for (let m = 0; m < 1440; m += 5) {
    const hour = m / 60
    // baja de noche, sube de día, picos en franjas de ejercicio
    let base = resting + 8 + Math.sin(((hour - 6) / 24) * Math.PI * 2) * 12
    if (hour > 7 && hour < 8) base += 35 + r() * 25 // entreno mañana
    if (hour > 18 && hour < 19) base += 20 + r() * 20 // tarde
    if (hour < 6) base = resting + r() * 4 - 2 // sueño
    const v = clamp(Math.round(base + (r() - 0.5) * 10), 42, 178)
    series.push({ t: m, v })
  }
  return series
}

function buildHourlySteps(r: () => number, total: number): number[] {
  const weights = [
    0.2, 0.1, 0.05, 0.05, 0.1, 0.4, 1.2, 2.4, 1.8, 1.2, 1.4, 1.6, 1.9, 1.3,
    1.1, 1.2, 1.6, 2.1, 2.6, 1.9, 1.2, 0.9, 0.6, 0.3,
  ].map((w) => w * (0.7 + r() * 0.6))
  const sum = weights.reduce((s, w) => s + w, 0)
  return weights.map((w) => Math.round((w / sum) * total))
}

const WORKOUT_TYPES = ['Correr', 'Fuerza', 'Caminata', 'Ciclismo', 'Yoga']

function buildDay(dayIndex: number, dateISO: string): DayData {
  const r = rng(1000 + dayIndex * 7)
  const resting = Math.round(52 + r() * 8)
  const { segs, totalMinutes, efficiency } = buildSleep(r)
  const sleepScore = clamp(Math.round(efficiency * 0.6 + r() * 25 + 18), 40, 98)

  const steps = Math.round(5200 + r() * 8000)
  const series = buildHrSeries(r, resting)
  const hrVals = series.map((p) => p.v)

  const readiness = clamp(
    Math.round(sleepScore * 0.5 + (100 - resting) * 0.3 + r() * 22),
    35,
    99,
  )

  const workouts: Workout[] = []
  const nW = r() > 0.5 ? (r() > 0.7 ? 2 : 1) : 0
  for (let i = 0; i < nW; i++) {
    const type = WORKOUT_TYPES[Math.floor(r() * WORKOUT_TYPES.length)]
    const durationMin = Math.round(25 + r() * 60)
    workouts.push({
      id: `${dateISO}-${i}`,
      type,
      start: `${dateISO}T${i === 0 ? '07' : '18'}:${String(
        Math.floor(r() * 59),
      ).padStart(2, '0')}:00`,
      durationMin,
      calories: Math.round(durationMin * (6 + r() * 6)),
      avgHr: Math.round(120 + r() * 40),
      distanceKm:
        type === 'Correr' || type === 'Ciclismo' || type === 'Caminata'
          ? Math.round((durationMin / 8) * 10) / 10
          : undefined,
    })
  }

  const bedHour = 22 + (r() > 0.5 ? 1 : 0)
  const bedtime = `${dateISO}T${String(bedHour).padStart(2, '0')}:${String(
    Math.floor(r() * 59),
  ).padStart(2, '0')}:00`
  const wake = new Date(
    new Date(bedtime).getTime() + totalMinutes * 60000,
  ).toISOString()

  return {
    date: dateISO,
    readiness,
    bodyBattery: clamp(Math.round(readiness * 0.7 + r() * 30), 20, 100),
    stress: clamp(Math.round(28 + r() * 45), 8, 92),
    exertion: clamp(Math.round(4 + r() * 24), 0, 100),
    spo2: Math.round(95 + r() * 3),
    sleep: {
      totalMinutes,
      score: sleepScore,
      bedtime,
      wakeTime: wake,
      segments: segs,
      efficiency,
    },
    heart: {
      resting,
      current: hrVals[hrVals.length - 1],
      min: Math.min(...hrVals),
      max: Math.max(...hrVals),
      hrv: Math.round(38 + r() * 45),
      series,
    },
    activity: {
      steps,
      stepsGoal: 10000,
      distanceKm: Math.round((steps / 1350) * 10) / 10,
      calories: Math.round(1800 + r() * 900),
      activeMinutes: Math.round(35 + r() * 70),
      hourly: buildHourlySteps(r, steps),
    },
    workouts,
  }
}

const HISTORY_DAYS = 30

export function buildDemoSnapshot(): HealthSnapshot {
  const today = new Date('2026-06-25')
  const week: DayData[] = []
  for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    week.push(buildDay(HISTORY_DAYS - 1 - i, d.toISOString().slice(0, 10)))
  }
  return {
    device: {
      name: 'Helio Strap',
      model: 'Amazfit Helio',
      battery: 78,
      lastSync: new Date('2026-06-25T08:42:00').toISOString(),
    },
    user: { name: 'Atleta' },
    today: week[week.length - 1],
    week,
    source: 'demo',
  }
}
