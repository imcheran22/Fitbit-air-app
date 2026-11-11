package app.fitdash.metrics

import app.fitdash.health.SleepSession
import java.time.Duration
import java.time.Instant
import java.time.ZonedDateTime

data class WakingWindow(val start: ZonedDateTime, val end: ZonedDateTime) {
    operator fun contains(t: ZonedDateTime) = !t.isBefore(start) && t.isBefore(end)
}

// From half an hour after this morning's wake-up to an hour before the bedtime the sleep goal implies.
// No night recorded today: assume an 8 AM wake-up.
fun wakingWindow(sleep: List<SleepSession>, now: ZonedDateTime, sleepHours: Double): WakingWindow {
    val wake = sleep.map { it.end.atZone(now.zone) }.filter { it.toLocalDate() == now.toLocalDate() && !it.isAfter(now) }.maxOrNull()
        ?: now.toLocalDate().atTime(8, 0).atZone(now.zone)
    val awakeMinutes = ((24 - sleepHours) * 60).toLong()
    return WakingWindow(wake.plusMinutes(30), wake.plusMinutes(awakeMinutes - 60))
}

// Behind the even pace through the waking day by at least a glass, under the goal, and not reminded in the last two hours.
fun waterDue(drunkLiters: Double, goalLiters: Double, now: ZonedDateTime, window: WakingWindow, lastReminder: Instant?): Boolean {
    if (now !in window || drunkLiters >= goalLiters) return false
    if (lastReminder != null && Duration.between(lastReminder, now.toInstant()) < Duration.ofHours(2)) return false
    val share = Duration.between(window.start, now).seconds.toDouble() / Duration.between(window.start, window.end).seconds
    return drunkLiters < goalLiters * share - 0.25
}

// Fewer than 250 steps in the last hour, an hour into the waking day, with step data fresh enough to trust.
// A wearable that has not synced for a while reads as zero steps, so stale data never nudges.
fun moveDue(stepsLastHour: Long, latestStepData: Instant?, now: ZonedDateTime, window: WakingWindow, lastNudge: Instant?): Boolean {
    if (now !in window || now.isBefore(window.start.plusHours(1))) return false
    if (latestStepData == null || Duration.between(latestStepData, now.toInstant()) > Duration.ofMinutes(30)) return false
    if (lastNudge != null && Duration.between(lastNudge, now.toInstant()) < Duration.ofMinutes(55)) return false
    return stepsLastHour < 250
}
