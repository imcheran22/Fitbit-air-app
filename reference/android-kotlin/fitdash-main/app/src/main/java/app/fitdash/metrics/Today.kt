package app.fitdash.metrics

import app.fitdash.health.GenericSeries
import app.fitdash.health.HealthSnapshot
import app.fitdash.health.SleepSession
import app.fitdash.health.SourceStatus
import app.fitdash.health.Workout
import app.fitdash.health.latestDataTime
import app.fitdash.health.syncApp
import app.fitdash.settings.DayJournal
import app.fitdash.settings.Tag
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZonedDateTime

data class WeekDay(val date: LocalDate, val score: Int?)

data class SleepDay(val date: LocalDate, val hours: Double?, val score: Int?)

data class ActivityDay(val date: LocalDate, val steps: Long?, val distanceKm: Double?, val kcal: Double?)

data class TodayData(
    val date: LocalDate,
    val isToday: Boolean,
    val goals: Goals,
    val readiness: ReadinessResult,
    val sleep: SleepSummary?,
    val heart: HeartSummary?,
    val vitals: List<VitalReading>,
    val activity: ActivitySummary?,
    val movementScore: Int?,
    val readinessWeek: List<WeekDay>,
    val sleepWeek: List<SleepDay>,
    val activityWeek: List<ActivityDay>,
    val suggestions: List<Suggestion>,
    val generic: List<GenericSeries>,
    val sources: List<SourceStatus>,
    val naps: List<SleepSession>,
    val previous: DayScores,
    val restingHrEstimated: Boolean,
    val trend: List<DayTrend>,
    val daysWithData: Set<LocalDate>,
    val estimatedRestingHrDates: Set<LocalDate>,
    val series: Map<MetricKind, List<DayValue>>,
    val genericDaily: Map<String, List<DayValue>>,
    val waterLiters: Double,
    val waterGoal: Double,
    val heightMeters: Double?,
    val bmi: Double?,
    val bmiBand: BmiBand?,
    val heartDay: HeartDay? = null,
    val workouts: List<Workout> = emptyList(),
    val weekWorkouts: WeekWorkouts = WeekWorkouts(0, 0),
    // Heart rate inside each of the day's workouts, 30-second means, keyed by the workout's start.
    val workoutHr: Map<Instant, List<Double>> = emptyMap(),
    // How far back the day picker and trends may go: 29 days, or 179 with the history permission.
    val daysBack: Long = Tuning.BASELINE_DAYS - 1,
    // When the wearable last wrote anything, and which app to open to make it sync.
    val latestData: Instant? = null,
    val syncApp: String? = null,
    val regularity: FitnessValue<Regularity>? = null,
    val regularityProgress: Int = 0,
    val regularityLastWeek: Int? = null,
    val streaks: List<Streak> = emptyList(),
    val fitness: FitnessData = FitnessData(null, emptyList(), null, emptyList(), false, null, FitnessValue(SleepDebt(0.0, emptyList()), Explanation("", emptyList(), SLEEP_DEBT_SOURCE)), null, emptyMap()),
    val tagEffects: List<TagEffect> = emptyList(),
    val yesterdayTags: Set<Tag> = emptySet(),
    val taggedDays: Int = 0,
    val timeline: DayTimelineData? = null,
    // The bedtime target from Settings, else the median of the last 14 nights.
    val bedtime: LocalTime? = null,
)

data class DayScores(val sleep: Int?, val readiness: Int?, val movement: Int?)

data class DayTrend(val date: LocalDate, val recovery: Int?, val sleepScore: Int?, val steps: Long?, val restingHr: Double?, val hrv: Double?)

fun buildToday(snapshot: HealthSnapshot, now: ZonedDateTime, date: LocalDate = now.toLocalDate(), goals: Goals = Goals(), augmented: Boolean = false, journal: Map<LocalDate, DayJournal> = emptyMap()): TodayData {
    val zone = now.zone
    val snap = if (augmented) snapshot else withEstimatedRestingHr(snapshot, zone, now.toLocalDate())
    val isToday = date == now.toLocalDate()
    val readiness = readiness(snap, date, zone, goals)
    val series = MetricKind.entries.associateWith { metricSeries(snap, it, date, zone, goals) }
    val sleep = summarizeSleep(date, snap.sleep, zone, goals.sleepHours, snap.heartRate)
    val heart = heartSummary(snap, date, zone)
    val activity = activitySummary(snap, date, zone, goals.steps)
    val hrvDaily = dailyMean(snap.hrv, zone)
    val rhrDaily = dailyLast(snap.restingHr, zone)
    val trend = window(date, snap.windowDays).map { d ->
        DayTrend(
            date = d,
            recovery = (readiness(snap, d, zone, goals) as? ReadinessResult.Ready)?.score,
            sleepScore = summarizeSleep(d, snap.sleep, zone, goals.sleepHours)?.score,
            steps = stepsOn(snap, d, zone),
            restingHr = rhrDaily[d],
            hrv = hrvDaily[d],
        )
    }
    val dayWorkouts = activity?.workouts ?: workoutsOn(snap, date, zone)
    val prev = date.minusDays(1)
    val prevActivity = activitySummary(snap, prev, zone, goals.steps)
    // On today, compare steps so far with yesterday up to the same hour; a full day against a partial one always reads as a drop.
    val prevMovement = (if (isToday) movementAtHour(snap, prev, zone, now.hour, goals.steps) else null)
        ?: prevActivity?.goalPercent?.coerceAtMost(100)
    val week = trend.takeLast(Tuning.WEEK_DAYS.toInt())
    val bmiValue = snap.weightKg?.let { w -> snap.heightMeters?.let { h -> bmi(w, h) } }
    val reg = regularity(snap.sleep, date, zone)
    val vitals = vitals(snap, date, zone)
    val dayHr = heartDay(snap, date, zone)
    val bedtime = goals.bedtime ?: medianBedtime(
        snap.sleep
            .filter { Duration.between(it.start, it.end).seconds >= Tuning.MIN_NIGHT_HOURS * 3600 && !it.end.atZone(zone).toLocalDate().isAfter(date) }
            .map { it.start },
        zone,
    )
    val days = window(date)
    return TodayData(
        date = date,
        isToday = isToday,
        goals = goals,
        readiness = readiness,
        sleep = sleep,
        heart = heart,
        vitals = vitals,
        activity = activity,
        movementScore = activity?.goalPercent?.coerceAtMost(100),
        readinessWeek = week.map { WeekDay(it.date, it.recovery) },
        sleepWeek = week.map { d ->
            val s = summarizeSleep(d.date, snap.sleep, zone, goals.sleepHours)
            SleepDay(d.date, s?.asleep?.let { it.seconds / 3600.0 }, s?.score)
        },
        activityWeek = week.map { d ->
            val a = snap.dailyActivity.firstOrNull { it.date == d.date }
            ActivityDay(d.date, d.steps, a?.distanceMeters?.div(1000), a?.kcal)
        },
        suggestions = if (isToday) suggestions(readiness, sleep, heart, activity, now.hour, goals.steps) else emptyList(),
        generic = snap.generic.filter { it.points.isNotEmpty() },
        sources = snap.sources,
        naps = napsEnding(date, snap.sleep, zone),
        previous = DayScores(
            summarizeSleep(prev, snap.sleep, zone, goals.sleepHours)?.score,
            trend.getOrNull(trend.size - 2)?.recovery,
            prevMovement,
        ),
        restingHrEstimated = date in snap.estimatedRestingHrDates,
        trend = trend,
        daysWithData = (snap.sleep.map { it.end.atZone(zone).toLocalDate() } +
            snap.dailyActivity.filter { it.steps > 0 }.map { it.date } +
            snap.hourlySteps.filter { it.steps > 0 }.map { it.start.atZone(zone).toLocalDate() }).toSet(),
        estimatedRestingHrDates = snap.estimatedRestingHrDates,
        series = series,
        streaks = streaks(series, goals),
        genericDaily = snap.generic.filter { it.points.isNotEmpty() }.associate { it.label to genericDailySeries(it.points, date, zone, snap.windowDays) },
        waterLiters = snap.waterDaily[date] ?: 0.0,
        waterGoal = goals.waterLiters,
        heightMeters = snap.heightMeters,
        bmi = bmiValue,
        bmiBand = bmiValue?.let(::bmiBand),
        heartDay = dayHr,
        workouts = dayWorkouts,
        workoutHr = dayWorkouts.associate { it.start to spanLine(snap.heartRate, it.start, it.end) },
        weekWorkouts = weekWorkouts(snap, date, zone),
        daysBack = snap.windowDays - 1,
        latestData = snap.latestDataTime(),
        syncApp = snap.syncApp(),
        fitness = fitness(snap, date, zone, goals),
        regularity = reg.value,
        regularityProgress = reg.progress,
        regularityLastWeek = regularity(snap.sleep, date.minusDays(7), zone).value?.value?.sri,
        tagEffects = tagEffects(journal, series, days),
        yesterdayTags = journal[prev]?.tags.orEmpty(),
        taggedDays = days.count { !journal[it]?.tags.isNullOrEmpty() },
        timeline = dayTimeline(snap.sleep, date, zone, bedtime, now, dayWorkouts, dayHr?.line, activity?.hourly.orEmpty()),
        bedtime = bedtime,
    )
}
