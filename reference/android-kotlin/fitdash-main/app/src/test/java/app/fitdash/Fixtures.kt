package app.fitdash

import app.fitdash.health.HealthSnapshot
import app.fitdash.health.Sample
import app.fitdash.health.SleepSession
import app.fitdash.health.SleepStage
import app.fitdash.health.StageType
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId

val IST: ZoneId = ZoneId.of("Asia/Kolkata")
val TODAY: LocalDate = LocalDate.of(2026, 10, 11)

fun at(date: String, time: String): Instant = LocalDateTime.parse("${date}T$time").atZone(IST).toInstant()

fun at(date: LocalDate, hour: Int, minute: Int = 0): Instant = date.atTime(hour, minute).atZone(IST).toInstant()

// Starts 23:00 the evening before `date`. With stages: 20% deep, 25% REM, 50% light, 5% awake.
fun night(date: LocalDate, hours: Double, stages: Boolean = false): SleepSession {
    val start = at(date.minusDays(1), 23)
    val total = (hours * 3600).toLong()
    val end = start.plusSeconds(total)
    if (!stages) return SleepSession(start, end, emptyList())
    var t = start
    val parts = listOf(StageType.DEEP to 0.20, StageType.REM to 0.25, StageType.LIGHT to 0.50, StageType.AWAKE to 0.05)
    val list = parts.map { (type, f) ->
        val e = t.plusSeconds((total * f).toLong())
        SleepStage(t, e, type).also { t = e }
    }
    return SleepSession(start, end, list)
}

fun day(
    date: LocalDate,
    hrv: Double? = null,
    rhr: Double? = null,
    sleepHours: Double? = null,
    stages: Boolean = false,
) = HealthSnapshot(
    sleep = listOfNotNull(sleepHours?.let { night(date, it, stages) }),
    hrv = listOfNotNull(hrv?.let { Sample(at(date, 5), it) }),
    restingHr = listOfNotNull(rhr?.let { Sample(at(date, 7), it) }),
)

// `days` days of identical data ending the day before `today`.
fun history(
    today: LocalDate,
    days: Int,
    hrv: Double? = 40.0,
    rhr: Double? = 60.0,
    sleepHours: Double? = 8.0,
    stages: Boolean = false,
): HealthSnapshot = (1..days)
    .map { day(today.minusDays(it.toLong()), hrv, rhr, sleepHours, stages) }
    .fold(HealthSnapshot()) { a, b -> a + b }

operator fun HealthSnapshot.plus(o: HealthSnapshot) = HealthSnapshot(
    sleep = sleep + o.sleep,
    hrv = hrv + o.hrv,
    restingHr = restingHr + o.restingHr,
    heartRate = heartRate + o.heartRate,
    spo2 = spo2 + o.spo2,
    respiratoryRate = respiratoryRate + o.respiratoryRate,
    skinTempDelta = skinTempDelta + o.skinTempDelta,
    hourlySteps = hourlySteps + o.hourlySteps,
    dailyActivity = dailyActivity + o.dailyActivity,
    workouts = workouts + o.workouts,
    generic = generic + o.generic,
    sources = sources + o.sources,
    estimatedRestingHrDates = estimatedRestingHrDates + o.estimatedRestingHrDates,
    waterDaily = waterDaily + o.waterDaily,
    heightMeters = o.heightMeters ?: heightMeters,
    weightKg = o.weightKg ?: weightKg,
    windowDays = maxOf(windowDays, o.windowDays),
)
