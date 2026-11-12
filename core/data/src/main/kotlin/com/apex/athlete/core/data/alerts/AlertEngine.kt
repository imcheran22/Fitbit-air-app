package com.apex.athlete.core.data.alerts

import com.apex.athlete.core.analytics.recovery.FatigueLevel
import com.apex.athlete.core.analytics.recovery.FatigueSignal
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

enum class AlertType { RECOVERY_LOW, FATIGUE_SIGNAL, DATA_STALE, TAKEOUT_NUDGE }

/**
 * The few numbers from the day's analysis that the rules read. Built from a `DayAnalysis` by
 * [toAlertSignals]; kept separate so the rules are pure and testable without a database.
 */
data class AlertSignals(
    /** The civil day the analysis is for. */
    val epochDay: Long,
    /** Whole-percentage recovery score; null unless recovery was actually scored (not calibrating, not unavailable). */
    val recoveryPercent: Int?,
    /** True when last night's sleep is in, so the morning score will not move any more. */
    val recoveryIsFinal: Boolean,
    val fatigueLevel: FatigueLevel,
    val fatigueSignals: Set<FatigueSignal>,
    /** Days in a row HRV or resting heart rate have been outside the normal range. */
    val daysOutsideNormal: Int,
)

/** The alert-related preferences (a view of `AppSettings`, see [toAlertPrefs]). */
data class AlertPrefs(
    val notificationsEnabled: Boolean = false,
    val notifyRecovery: Boolean = true,
    val notifyFatigue: Boolean = true,
    val notifyStale: Boolean = true,
    val quietStartMinute: Int = 22 * 60,
    val quietEndMinute: Int = 7 * 60,
    val takeoutNudgeDays: Int = 0,
    val lastTakeoutImportMillis: Long? = null,
    val lastAlertDay: Long? = null,
)

/** The civil day each alert type was last raised. */
typealias AlertLedger = Map<AlertType, Long>

data class AlertInput(
    val signals: AlertSignals?,
    /** When the newest reading (heart rate or sleep) was recorded; null if the store has none. */
    val lastDataMillis: Long?,
    val nowMillis: Long,
    val zone: ZoneId,
    val demoMode: Boolean,
    val prefs: AlertPrefs,
    val ledger: AlertLedger,
)

/**
 * One alert to show.
 *
 * @property body the full text, shown once the phone is unlocked.
 * @property numbers every numeral in [body], exactly as printed, each a slot filled from the input.
 * @property lockScreenText what shows on a locked screen: never a number or a reading.
 */
data class Alert(
    val type: AlertType,
    val epochDay: Long,
    val title: String,
    val body: String,
    val numbers: List<String>,
    val lockScreenText: String,
)

data class AlertDecision(
    /** Show these now, then record them in the ledger. */
    val raise: List<Alert>,
    /** Due, but inside quiet hours. Not recorded, so a later run raises them if they still hold. */
    val heldForQuietHours: List<Alert>,
)

/**
 * Decides which alerts to raise. Pure: same input, same decision.
 *
 * Rules (all need notifications enabled and a real, non-demo store):
 * - **Recovery low:** recovery scored and final, at or below [RED_BAND_MAX] (the red band), for today. Own toggle.
 * - **Readings unlike usual:** several short-term signals agree (see [isIllnessLike]); wording never names a condition. Own toggle.
 * - **Data stale:** newest reading older than [STALE_HOURS]. Own toggle.
 * - **Takeout nudge:** the last archive import is older than the owner's chosen number of days; off when that is 0.
 *
 * At most one alert of each type per civil day (the [AlertLedger]); quiet hours hold everything back
 * and handle windows that cross midnight. Wording is calm, never diagnostic, and every numeral
 * comes from the input.
 */
object AlertEngine {
    const val RED_BAND_MAX = 33
    const val STALE_HOURS = 36L
    private const val HOUR_MS = 3_600_000L
    private const val DAY_MS = 24 * HOUR_MS

    fun decide(input: AlertInput): AlertDecision {
        val p = input.prefs
        if (input.demoMode || !p.notificationsEnabled) return AlertDecision(emptyList(), emptyList())
        val today = Instant.ofEpochMilli(input.nowMillis).atZone(input.zone).toLocalDate().toEpochDay()

        val due = ArrayList<Alert>()
        due += listOfNotNull(
            recovery(input, today).takeIf { p.notifyRecovery },
            fatigue(input, today).takeIf { p.notifyFatigue },
            stale(input, today).takeIf { p.notifyStale },
            takeout(input, today),
        )
        val fresh = due.filter { input.ledger[it.type] != today }
        return if (isQuietTime(input.nowMillis, input.zone, p.quietStartMinute, p.quietEndMinute)) {
            AlertDecision(emptyList(), fresh)
        } else {
            AlertDecision(fresh, emptyList())
        }
    }

    private fun recovery(i: AlertInput, today: Long): Alert? {
        val s = i.signals ?: return null
        val pct = s.recoveryPercent ?: return null
        if (s.epochDay != today || !s.recoveryIsFinal || pct > RED_BAND_MAX) return null
        val n = pct.toString()
        return Alert(
            AlertType.RECOVERY_LOW, today,
            title = "Recovery is low today",
            body = "Recovery is $n%, in your lowest band. An easy day is reasonable.",
            numbers = listOf(n),
            lockScreenText = PUBLIC_TEXT,
        )
    }

    /** Several fast-moving signals agree (at least two of: HRV drop, high resting heart rate, fast breathing), or the strongest sustained pattern. */
    fun isIllnessLike(s: AlertSignals): Boolean {
        val acute = s.fatigueSignals.count {
            it == FatigueSignal.HRV_ACUTE_DROP || it == FatigueSignal.RESTING_HR_ELEVATED || it == FatigueSignal.RESPIRATORY_RATE_ELEVATED
        }
        return acute >= 2 || s.fatigueLevel == FatigueLevel.HIGH
    }

    private fun fatigue(i: AlertInput, today: Long): Alert? {
        val s = i.signals ?: return null
        if (s.epochDay != today || !isIllnessLike(s)) return null
        val days = s.daysOutsideNormal
        val body = if (days >= 2) {
            "Your readings have been outside your usual range for $days days. Consider an easy day."
        } else {
            "Your readings look unlike your usual range. Consider an easy day."
        }
        return Alert(
            AlertType.FATIGUE_SIGNAL, today,
            title = "Readings outside your usual range",
            body = body,
            numbers = if (days >= 2) listOf(days.toString()) else emptyList(),
            lockScreenText = PUBLIC_TEXT,
        )
    }

    private fun stale(i: AlertInput, today: Long): Alert? {
        val last = i.lastDataMillis ?: return null
        val age = i.nowMillis - last
        if (age <= STALE_HOURS * HOUR_MS) return null
        val hours = (age / HOUR_MS).toString()
        return Alert(
            AlertType.DATA_STALE, today,
            title = "No new data",
            body = "No new readings have arrived for $hours hours. Open Apex to sync, or check that your wearable is connected.",
            numbers = listOf(hours),
            lockScreenText = PUBLIC_TEXT,
        )
    }

    private fun takeout(i: AlertInput, today: Long): Alert? {
        val limit = i.prefs.takeoutNudgeDays
        val last = i.prefs.lastTakeoutImportMillis ?: return null // never imported: nothing to be overdue
        if (limit <= 0) return null
        val days = (i.nowMillis - last) / DAY_MS
        if (days < limit) return null
        val n = days.toString()
        return Alert(
            AlertType.TAKEOUT_NUDGE, today,
            title = "Time for a fresh Takeout import",
            body = "It has been $n days since your last Takeout import. Importing a new archive keeps your older history complete.",
            numbers = listOf(n),
            lockScreenText = PUBLIC_TEXT,
        )
    }

    /** True from [startMinute] up to (not including) [endMinute], minutes after local midnight. A window with start after end crosses midnight; equal bounds mean no quiet hours. */
    fun isQuietTime(nowMillis: Long, zone: ZoneId, startMinute: Int, endMinute: Int): Boolean {
        if (startMinute == endMinute) return false
        val t = Instant.ofEpochMilli(nowMillis).atZone(zone).toLocalTime()
        val m = t.hour * 60 + t.minute
        return if (startMinute < endMinute) m in startMinute until endMinute else m >= startMinute || m < endMinute
    }

    /** Milliseconds from [nowMillis] to the next local [hour]:[minute] (tomorrow if it has passed). Used to schedule the after-the-morning run. */
    fun delayUntilNextMorning(nowMillis: Long, zone: ZoneId, hour: Int = 8, minute: Int = 30): Long {
        val now = Instant.ofEpochMilli(nowMillis).atZone(zone)
        var target = now.toLocalDate().atTime(hour, minute).atZone(zone)
        if (!target.isAfter(now)) target = LocalDate.from(now).plusDays(1).atTime(hour, minute).atZone(zone)
        return target.toInstant().toEpochMilli() - nowMillis
    }

    const val PUBLIC_TEXT = "Apex has an update for you. Unlock your phone to read it."
}
