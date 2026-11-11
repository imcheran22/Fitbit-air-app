import { useCallback, useEffect, useState } from 'react'
import type { DailyBrief, HealthSnapshot } from './types'
import {
  AuthRequiredError,
  fetchDailyBrief,
  fetchSnapshot,
  hasSitePassword,
} from './lib/dataSource'
import { hm, localDateKey, numberFormat, scoreLabel } from './lib/format'
import { LANG_STORAGE_KEY, normalizeLang, TEXT, type Lang } from './lib/i18n'

import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import Panel from './components/Panel'
import HeroTriad from './components/HeroTriad'
import MiniRingStat from './components/MiniRingStat'
import HeartRateChart from './components/HeartRateChart'
import SleepStages from './components/SleepStages'
import ActivityBars from './components/ActivityBars'
import TrendChart from './components/TrendChart'
import Workouts from './components/Workouts'
import StatTile from './components/StatTile'
import Heartbeat from './components/Heartbeat'
import Icon from './components/Icon'
import RecoveryCoach from './components/RecoveryCoach'
import DailyBriefPanel from './components/DailyBriefPanel'
import PasswordGate from './components/PasswordGate'

const SECTION_IDS = ['top', 'heart', 'sleep', 'activity', 'trends']

export default function App() {
  const [data, setData] = useState<HealthSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [authRequired, setAuthRequired] = useState(false)
  const [authFailed, setAuthFailed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [brief, setBrief] = useState<DailyBrief | null>(null)
  const [briefError, setBriefError] = useState<string | null>(null)
  const [briefLoading, setBriefLoading] = useState(false)
  const [active, setActive] = useState('top')
  const [lang, setLang] = useState<Lang>(() =>
    normalizeLang(window.localStorage.getItem(LANG_STORAGE_KEY)),
  )
  const copy = TEXT[lang]
  const nf = numberFormat(lang)

  useEffect(() => {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang)
  }, [lang])

  // Scrollspy: resalta en el sidebar la sección visible.
  useEffect(() => {
    if (!data) return
    const els = SECTION_IDS.map((id) => document.getElementById(id)).filter(
      Boolean,
    ) as HTMLElement[]
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-12% 0px -68% 0px', threshold: 0 },
    )
    els.forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [data])

  const goto = useCallback((id: string) => {
    setActive(id)
    if (id === 'top') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const load = useCallback(async (refresh = false) => {
    setRefreshing(true)
    try {
      const snap = await fetchSnapshot(refresh)
      setData(snap)
      setError(null)
      setAuthRequired(false)
      setAuthFailed(false)
    } catch (e) {
      if (e instanceof AuthRequiredError) {
        // Si ya había una contraseña guardada y aun así dio 401, fue incorrecta.
        setAuthFailed(hasSitePassword())
        setAuthRequired(true)
      } else {
        setError(e instanceof Error ? e.message : 'Error al cargar')
      }
    } finally {
      setRefreshing(false)
    }
  }, [])

  const loadBrief = useCallback(async (refresh = false) => {
    setBriefLoading(true)
    try {
      setBrief(await fetchDailyBrief(refresh, lang))
      setBriefError(null)
    } catch (e) {
      setBriefError(
        e instanceof Error
          ? e.message
          : lang === 'en'
          ? 'Could not generate'
          : 'No se pudo generar',
      )
    } finally {
      setBriefLoading(false)
    }
  }, [lang])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!data) return

    const now = new Date()
    const eight = new Date(now)
    eight.setHours(8, 0, 0, 0)

    if (now >= eight) {
      loadBrief(false)
      return
    }

    const timeout = window.setTimeout(() => {
      loadBrief(false)
    }, eight.getTime() - now.getTime())

    return () => window.clearTimeout(timeout)
  }, [data?.today.date, loadBrief])

  if (authRequired) {
    return (
      <PasswordGate lang={lang} failed={authFailed} onSubmit={() => load()} />
    )
  }

  if (error) {
    return (
      <div className="grid min-h-svh place-items-center p-6 text-center">
        <div className="panel max-w-sm p-8">
          <Icon name="bolt" size={28} className="mx-auto text-strain" />
          <h1 className="mt-3 font-display text-xl text-ink">
            {copy.disconnected}
          </h1>
          <p className="mt-2 text-sm text-muted">{error}</p>
          <button
            onClick={() => load()}
            className="panel-hover mt-5 rounded-lg bg-surface-2 px-4 py-2 text-sm text-ink"
          >
            {copy.retry}
          </button>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="grid min-h-svh place-items-center">
        <div className="flex flex-col items-center gap-4">
          <div
            className="h-12 w-12 rounded-full"
            style={{
              background:
                'radial-gradient(circle, var(--color-solar-bright), var(--color-solar-deep))',
              animation: 'pulse-soft 1.4s ease-in-out infinite',
              boxShadow: '0 0 40px -6px var(--color-solar)',
            }}
          />
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-faint">
            {copy.syncing}
          </p>
        </div>
      </div>
    )
  }

  const { today, week } = data
  const a = today.activity
  const isCurrentDay = today.date === localDateKey()
  const recordLabel = isCurrentDay ? copy.today : copy.latestRecord
  const heartUnit = lang === 'en' ? 'bpm' : 'ppm'

  return (
    <div className="flex">
      <Sidebar active={active} onSelect={goto} lang={lang} />
      <main className="mx-auto w-full max-w-[1280px] px-5 py-6 md:px-8">
        <TopBar
          data={data}
          onRefresh={() => load(true)}
          refreshing={refreshing}
          lang={lang}
          onLangToggle={() => setLang((current) => (current === 'es' ? 'en' : 'es'))}
        />

        {/* Fila 1 — tríada héroe glanceable (Recovery · Strain · Sleep) */}
        <Panel id="top" delay={0}>
          <HeroTriad today={today} lang={lang} />
          <div className="mt-6 grid w-full grid-cols-3 gap-2 border-t border-line pt-5 sm:max-w-md">
            <MiniRingStat
              value={today.bodyBattery}
              label="Hybrid"
              display={String(today.bodyBattery)}
              from="#2f9e74"
              to="var(--color-recovery)"
            />
            <MiniRingStat
              value={today.stress}
              label={copy.stress}
              display={String(today.stress)}
              from="var(--color-solar)"
              to="var(--color-strain)"
            />
            <MiniRingStat
              value={today.spo2}
              label="SpO₂"
              display={String(today.spo2)}
              from="var(--color-info)"
              to="#7fe6ff"
            />
          </div>
        </Panel>

        {/* Fila 2 — corazón */}
        <div className="mt-4 grid grid-cols-12 gap-4">
          <Panel
            id="heart"
            className="col-span-12"
            title={`${copy.heartRate} · ${recordLabel}`}
            delay={60}
            right={
              <div className="flex items-center gap-4 font-mono text-[11px] text-muted tnum">
                <span className="flex items-center gap-1">
                  <span className="text-faint">{copy.activeShort}</span>
                  <Heartbeat bpm={today.heart.current} size={15} />
                </span>
                <span>
                  <span className="text-faint">{copy.maxShort}</span>{' '}
                  <b className="text-strain">{today.heart.max}</b>
                </span>
                <span>
                  <span className="text-faint">hrv</span>{' '}
                  <b className="text-ink">{today.heart.hrv}ms</b>
                </span>
              </div>
            }
          >
            <HeartRateChart
              series={today.heart.series}
              resting={today.heart.resting}
              lang={lang}
            />
            <div className="mt-4 grid grid-cols-4 gap-3 border-t border-line pt-4">
              {[
                { l: copy.resting, v: `${today.heart.resting}`, u: heartUnit },
                { l: copy.minimum, v: `${today.heart.min}`, u: heartUnit },
                { l: copy.maximum, v: `${today.heart.max}`, u: heartUnit },
                { l: 'SpO₂', v: `${today.spo2}`, u: '%' },
              ].map((s) => (
                <div key={s.l}>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-faint">
                    {s.l}
                  </div>
                  <div className="mt-1 font-display text-xl font-semibold tnum text-ink">
                    {s.v}
                    <span className="ml-1 font-mono text-xs text-muted">{s.u}</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <Panel
          className="mt-4"
          title={copy.recoveryBreakdown}
          hint={copy.baseline7}
          delay={90}
        >
          {/* Baseline fijo a 7 días aunque `week` traiga más historial (30D). */}
          <RecoveryCoach today={today} week={week.slice(-7)} lang={lang} />
        </Panel>

        <Panel
          className="mt-4"
          title={copy.aiMorningBrief}
          hint={copy.aiMorningHint}
          delay={110}
        >
          <DailyBriefPanel
            brief={brief}
            error={briefError}
            loading={briefLoading}
            lang={lang}
            onRefresh={() => loadBrief(true)}
          />
        </Panel>

        {/* Fila 2 — tarjetas rápidas */}
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <StatTile
            icon="steps"
            label={copy.steps}
            value={nf.format(a.steps)}
            sub={`${copy.goal} ${nf.format(a.stepsGoal)}`}
            delay={0}
          />
          <StatTile
            icon="route"
            label={copy.distance}
            value={a.distanceKm}
            unit="km"
            delay={40}
          />
          <StatTile
            icon="flame"
            label={copy.calories}
            value={nf.format(a.calories)}
            unit="kcal"
            accent="var(--color-strain)"
            delay={80}
          />
          <StatTile
            icon="bolt"
            label="Exertion"
            value={today.exertion}
            unit="%"
            delay={120}
          />
          <StatTile
            icon="heart"
            label="HRV"
            value={today.heart.hrv}
            unit="ms"
            accent="var(--color-strain)"
            delay={160}
          />
          <StatTile
            icon="drop"
            label="SpO₂"
            value={today.spo2}
            unit="%"
            accent="var(--color-info)"
            delay={200}
          />
        </div>

        {/* Fila 3 — sueño + entrenos */}
        <div className="mt-4 grid grid-cols-12 gap-4">
          <Panel
            id="sleep"
            className="col-span-12 lg:col-span-7"
            title={copy.lastNightSleep}
            delay={0}
            right={
              <div className="text-right">
                <div className="font-display text-lg font-semibold text-ink">
                  {hm(today.sleep.totalMinutes)}
                </div>
                <div className="font-mono text-[11px] text-faint">
                  {scoreLabel(today.sleep.score, lang)} · {today.sleep.efficiency}%{' '}
                  {copy.efficiency}
                </div>
              </div>
            }
          >
            <SleepStages sleep={today.sleep} lang={lang} />
          </Panel>

          <Panel
            className="col-span-12 lg:col-span-5"
            title={`${copy.workouts} · ${recordLabel}`}
            delay={60}
          >
            <Workouts workouts={today.workouts} lang={lang} />
          </Panel>
        </div>

        {/* Fila 4 — actividad por hora */}
        <div className="mt-4 grid grid-cols-12 gap-4">
          <Panel
            id="activity"
            className="col-span-12"
            title={`${copy.hourlySteps} · ${recordLabel}`}
            delay={0}
          >
            <ActivityBars hourly={a.hourly} />
          </Panel>
        </div>

        {/* Fila 5 — tendencias: readiness, estrés, HRV y sueño, cada una con
            su propio toggle 7D/30D para comparar tu semana vs tu mes. */}
        <Panel id="trends" className="mt-4" title={copy.navTrends} delay={60}>
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
            <div>
              <h3 className="mb-1 font-mono text-[11px] uppercase tracking-wider text-muted">
                {copy.readiness7}
              </h3>
              <TrendChart
                data={week}
                metric={(d) => d.readiness}
                lang={lang}
                colorFrom="var(--color-recovery)"
                colorTo="var(--color-solar-bright)"
              />
            </div>
            <div>
              <h3 className="mb-1 font-mono text-[11px] uppercase tracking-wider text-muted">
                {copy.stress}
              </h3>
              <TrendChart
                data={week}
                metric={(d) => d.stress}
                lang={lang}
                colorFrom="var(--color-solar)"
                colorTo="var(--color-strain)"
                invert
              />
            </div>
            <div>
              <h3 className="mb-1 font-mono text-[11px] uppercase tracking-wider text-muted">
                HRV
              </h3>
              <TrendChart
                data={week}
                metric={(d) => d.heart.hrv}
                lang={lang}
                colorFrom="var(--color-effort)"
                colorTo="#7fe6ff"
                scale="auto"
                unit="ms"
              />
            </div>
            <div>
              <h3 className="mb-1 font-mono text-[11px] uppercase tracking-wider text-muted">
                {copy.sleep}
              </h3>
              <TrendChart
                data={week}
                metric={(d) => d.sleep.score}
                lang={lang}
                colorFrom="var(--color-sleep)"
                colorTo="#b8b4ff"
              />
            </div>
          </div>
        </Panel>

        <footer className="mt-8 flex items-center justify-between border-t border-line pt-4 font-mono text-[11px] text-faint">
          <span>{copy.footerProduct}</span>
          <span>
            {copy.footerSource}: {data.source}
          </span>
        </footer>
      </main>
    </div>
  )
}
