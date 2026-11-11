package app.fitdash.metrics

import app.fitdash.health.SleepSession
import app.fitdash.health.SleepStage
import app.fitdash.health.StageType
import app.fitdash.health.Sample
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import kotlin.math.min
import kotlin.math.roundToInt

data class SleepSummary(
    val asleep: Duration,
    val deep: Duration,
    val rem: Duration,
    val light: Duration,
    val awake: Duration,
    val hasStages: Boolean,
    val score: Int,
    val stages: List<SleepStage>,
    val start: Instant,
    val end: Instant,
    val timeInBed: Duration,
    val restorative: Double?,
    val overnightHr: Double?,
    val efficiency: Double,
    val awakenings: Int?,
    val latency: Duration?,
    val parts: SleepScoreParts? = null,
    val goalPercent: Int = 100,
)

// A night typed in by hand: waking up on `date`, and a bedtime after the wake-up time means the evening before.
fun loggedNight(bed: LocalTime, wake: LocalTime, date: LocalDate, zone: ZoneId): Pair<Instant, Instant> {
    val end = date.atTime(wake).atZone(zone).toInstant()
    val start = (if (bed < wake) date else date.minusDays(1)).atTime(bed).atZone(zone).toInstant()
    return start to end
}

fun nightEnding(date: LocalDate, sessions: List<SleepSession>, zone: ZoneId): SleepSession? =
    sessions
        .filter { it.end.atZone(zone).toLocalDate() == date && Duration.between(it.start, it.end).seconds >= Tuning.MIN_NIGHT_HOURS * 3600 }
        .maxByOrNull { Duration.between(it.start, it.end) }

private fun SleepSession.total(vararg types: StageType): Duration =
    stages.filter { it.type in types }.fold(Duration.ZERO) { acc, s -> acc + Duration.between(s.start, s.end) }

private fun SleepSession.hasStages() =
    stages.any { it.type == StageType.DEEP || it.type == StageType.REM || it.type == StageType.LIGHT }

fun asleepDuration(night: SleepSession): Duration =
    if (night.stages.isEmpty()) Duration.between(night.start, night.end)
    else night.total(StageType.LIGHT, StageType.DEEP, StageType.REM, StageType.SLEEPING)

fun deepRemShare(night: SleepSession): Double? {
    if (!night.hasStages()) return null
    val asleep = asleepDuration(night).seconds.toDouble()
    if (asleep <= 0) return null
    return night.total(StageType.DEEP, StageType.REM).seconds / asleep
}

// Four parts, so a long but broken night cannot score 100:
//   duration 50 (asleep against the goal), efficiency 15 (asleep ÷ in bed, 70% → 0, 90% → full),
//   restoration 20 (deep + REM share, 25% → 0, 40% → full), restfulness 15 (awake share and awakenings).
// Without stages only duration is known, so the score is duration alone and says so in the sheet.
fun sleepScore(night: SleepSession, targetHours: Double = Tuning.SLEEP_TARGET_HOURS): Int {
    val hours = asleepDuration(night).seconds / 3600.0
    val durationFrac = min(hours / targetHours, 1.0)
    if (!night.hasStages()) return (durationFrac * 100).roundToInt().coerceIn(0, 100)
    val duration = durationFrac * Tuning.SLEEP_W_DURATION
    val efficiency = ((sleepEfficiency(night) - 0.70) / 0.20).coerceIn(0.0, 1.0) * Tuning.SLEEP_W_EFFICIENCY
    val restoration = (((deepRemShare(night) ?: 0.0) - 0.25) / 0.15).coerceIn(0.0, 1.0) * Tuning.SLEEP_W_RESTORATION
    val inBed = Duration.between(night.start, night.end).seconds.toDouble().coerceAtLeast(1.0)
    val awakeShare = night.total(StageType.AWAKE).seconds / inBed
    val awakePart = (1 - (awakeShare - 0.05) / 0.10).coerceIn(0.0, 1.0)
    val wakePart = (1 - ((awakenings(night) ?: 0) - 2).coerceAtLeast(0) * 0.2).coerceIn(0.0, 1.0)
    val restfulness = min(awakePart, wakePart) * Tuning.SLEEP_W_RESTFULNESS
    return (duration + efficiency + restoration + restfulness).roundToInt().coerceIn(0, 100)
}

// The four parts separately, for the sleep sheet. Null without stages.
data class SleepScoreParts(val duration: Int, val efficiency: Int, val restoration: Int, val restfulness: Int)

fun sleepScoreParts(night: SleepSession, targetHours: Double = Tuning.SLEEP_TARGET_HOURS): SleepScoreParts? {
    if (!night.hasStages()) return null
    val hours = asleepDuration(night).seconds / 3600.0
    val inBed = Duration.between(night.start, night.end).seconds.toDouble().coerceAtLeast(1.0)
    val awakeShare = night.total(StageType.AWAKE).seconds / inBed
    val awakePart = (1 - (awakeShare - 0.05) / 0.10).coerceIn(0.0, 1.0)
    val wakePart = (1 - ((awakenings(night) ?: 0) - 2).coerceAtLeast(0) * 0.2).coerceIn(0.0, 1.0)
    return SleepScoreParts(
        (min(hours / targetHours, 1.0) * Tuning.SLEEP_W_DURATION).roundToInt(),
        (((sleepEfficiency(night) - 0.70) / 0.20).coerceIn(0.0, 1.0) * Tuning.SLEEP_W_EFFICIENCY).roundToInt(),
        ((((deepRemShare(night) ?: 0.0) - 0.25) / 0.15).coerceIn(0.0, 1.0) * Tuning.SLEEP_W_RESTORATION).roundToInt(),
        (min(awakePart, wakePart) * Tuning.SLEEP_W_RESTFULNESS).roundToInt(),
    )
}

// Awake stages between first falling asleep and the last sleep stage. Null without stages.
fun awakenings(night: SleepSession): Int? {
    if (!night.hasStages()) return null
    val sorted = night.stages.sortedBy { it.start }
    val first = sorted.indexOfFirst { it.type != StageType.AWAKE }
    val last = sorted.indexOfLast { it.type != StageType.AWAKE }
    if (first < 0) return 0
    return sorted.subList(first, last + 1).count { it.type == StageType.AWAKE }
}

// Time from getting into bed to the first sleep stage. Null without stages.
fun sleepLatency(night: SleepSession): Duration? {
    if (!night.hasStages()) return null
    val firstSleep = night.stages.filter { it.type != StageType.AWAKE }.minOfOrNull { it.start } ?: return null
    return Duration.between(night.start, firstSleep).coerceAtLeast(Duration.ZERO)
}

fun sleepEfficiency(night: SleepSession): Double {
    val inBed = Duration.between(night.start, night.end).seconds.toDouble()
    if (inBed <= 0) return 0.0
    return (asleepDuration(night).seconds / inBed).coerceIn(0.0, 1.0)
}

fun napsEnding(date: LocalDate, sessions: List<SleepSession>, zone: ZoneId): List<SleepSession> =
    sessions
        .filter { it.end.atZone(zone).toLocalDate() == date && Duration.between(it.start, it.end).seconds < Tuning.MIN_NIGHT_HOURS * 3600 }
        .sortedBy { it.start }

fun summarizeSleep(
    date: LocalDate,
    sessions: List<SleepSession>,
    zone: ZoneId,
    targetHours: Double = Tuning.SLEEP_TARGET_HOURS,
    heartRate: List<Sample> = emptyList(),
): SleepSummary? {
    val night = nightEnding(date, sessions, zone) ?: return null
    return SleepSummary(
        asleep = asleepDuration(night),
        deep = night.total(StageType.DEEP),
        rem = night.total(StageType.REM),
        light = night.total(StageType.LIGHT),
        awake = night.total(StageType.AWAKE),
        hasStages = night.hasStages(),
        score = sleepScore(night, targetHours),
        stages = night.stages,
        start = night.start,
        end = night.end,
        timeInBed = Duration.between(night.start, night.end),
        restorative = deepRemShare(night),
        overnightHr = lowestRollingMean(heartRate.filter { !it.time.isBefore(night.start) && !it.time.isAfter(night.end) }, Duration.ofMinutes(Tuning.RHR_WINDOW_MINUTES)),
        efficiency = sleepEfficiency(night),
        awakenings = awakenings(night),
        latency = sleepLatency(night),
        parts = sleepScoreParts(night, targetHours),
        goalPercent = (asleepDuration(night).toMinutes() * 100 / (targetHours * 60)).toInt().coerceAtMost(100),
    )
}

val NSF_SLEEP = Source("National Sleep Foundation 2015", "Hirshkowitz et al., National Sleep Foundation's sleep time duration recommendations. Sleep Health 1(1):40–43.")

// Recommended hours a night by age; null under 14, where fitdash is not aimed.
fun sleepGuideline(age: Int): IntRange? = when {
    age < 14 -> null
    age <= 17 -> 8..10
    age <= 64 -> 7..9
    else -> 7..8
}
