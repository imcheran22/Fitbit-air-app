package app.fitdash.metrics

import app.fitdash.health.HealthSnapshot
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import kotlin.math.roundToInt

data class Goals(
    val steps: Int = Tuning.STEP_GOAL,
    val sleepHours: Double = Tuning.SLEEP_TARGET_HOURS,
    val waterLiters: Double = 2.5,
    val activeMinutes: Int = Tuning.ACTIVE_MINUTES_GOAL,
    val birthYear: Int? = null,
    val gender: Gender? = null,
    val bedtime: LocalTime? = null,
) {
    fun age(year: Int): Int? = birthYear?.let { year - it }
}

enum class Band { RECOVER, STEADY, PRIMED }

enum class Component { HRV, RESTING_HR, SLEEP }

sealed interface ReadinessResult {
    data object NoData : ReadinessResult
    data class Calibrating(val nights: Int) : ReadinessResult
    data class Ready(val score: Int, val band: Band, val parts: Map<Component, Double>) : ReadinessResult
}

fun band(score: Int): Band = when {
    score < Tuning.BAND_STEADY -> Band.RECOVER
    score < Tuning.BAND_PRIMED -> Band.STEADY
    else -> Band.PRIMED
}

fun hrvComponent(today: Double, baseline: Double): Double {
    val pct = (today / baseline - 1) * 100
    val slope = if (pct >= 0) (100 - Tuning.AT_BASELINE) / Tuning.HRV_PCT_SPAN
    else (Tuning.AT_BASELINE - Tuning.FLOOR) / Tuning.HRV_PCT_SPAN
    return (Tuning.AT_BASELINE + pct * slope).coerceIn(0.0, 100.0)
}

fun rhrComponent(today: Double, baseline: Double): Double {
    val delta = today - baseline
    val slope = if (delta <= 0) (100 - Tuning.AT_BASELINE) / Tuning.RHR_BPM_SPAN
    else (Tuning.AT_BASELINE - Tuning.FLOOR) / Tuning.RHR_BPM_SPAN
    return (Tuning.AT_BASELINE - delta * slope).coerceIn(0.0, 100.0)
}

private val WEIGHTS = mapOf(
    Component.HRV to Tuning.WEIGHT_HRV,
    Component.RESTING_HR to Tuning.WEIGHT_RHR,
    Component.SLEEP to Tuning.WEIGHT_SLEEP,
)

fun readiness(snapshot: HealthSnapshot, date: LocalDate, zone: ZoneId, goals: Goals = Goals()): ReadinessResult {
    val hrv = dailyMean(snapshot.hrv, zone)
    val rhr = dailyLast(snapshot.restingHr, zone)
    val night = nightEnding(date, snapshot.sleep, zone)

    if (hrv[date] == null && rhr[date] == null && night == null) return ReadinessResult.NoData

    val nights = (1..Tuning.BASELINE_DAYS).map { date.minusDays(it) }.count { d ->
        hrv[d] != null || rhr[d] != null || nightEnding(d, snapshot.sleep, zone) != null
    }
    if (nights < Tuning.MIN_NIGHTS) return ReadinessResult.Calibrating(nights)

    val parts = buildMap {
        val hrvToday = hrv[date]
        val hrvBase = baseline(hrv, date)
        if (hrvToday != null && hrvBase != null && hrvBase > 0) put(Component.HRV, hrvComponent(hrvToday, hrvBase))
        val rhrToday = rhr[date]
        val rhrBase = baseline(rhr, date)
        if (rhrToday != null && rhrBase != null) put(Component.RESTING_HR, rhrComponent(rhrToday, rhrBase))
        if (night != null) put(Component.SLEEP, sleepScore(night, goals.sleepHours).toDouble())
    }
    if (parts.isEmpty()) return ReadinessResult.NoData

    val total = parts.keys.sumOf { WEIGHTS.getValue(it) }
    val score = (parts.entries.sumOf { (k, v) -> v * WEIGHTS.getValue(k) } / total).roundToInt()
    return ReadinessResult.Ready(score, band(score), parts)
}
