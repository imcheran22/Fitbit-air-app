package com.apex.athlete.ui.settings

/** Pure helpers for the Settings screen, kept free of Android types so they run as plain JVM tests. */

internal const val MINUTES_PER_DAY = 24 * 60

/** Reminder intervals offered for the Takeout nudge; 0 means off. */
internal val TAKEOUT_NUDGE_CHOICES: List<Int> = listOf(0, 14, 30, 60, 90)

/** The choices to list: the standard ones, plus the stored value if it is not one of them. */
internal fun takeoutChoices(current: Int): List<Int> =
    if (current in TAKEOUT_NUDGE_CHOICES || current < 0) TAKEOUT_NUDGE_CHOICES
    else (TAKEOUT_NUDGE_CHOICES + current).sorted()

/** Moves a minute-of-day by [delta] minutes, wrapping around midnight in both directions. */
internal fun stepMinuteOfDay(minuteOfDay: Int, delta: Int): Int =
    Math.floorMod(minuteOfDay + delta, MINUTES_PER_DAY)

/** Steps only the hour part, keeping the minutes. */
internal fun stepHour(minuteOfDay: Int, delta: Int): Int = stepMinuteOfDay(minuteOfDay, delta * 60)

/** Steps only the minutes (in [step] increments), without carrying into the hour. */
internal fun stepMinutePart(minuteOfDay: Int, delta: Int, step: Int = 5): Int {
    val hour = Math.floorMod(minuteOfDay, MINUTES_PER_DAY) / 60
    val minute = Math.floorMod(minuteOfDay, 60)
    val snapped = (minute / step) * step
    val next = Math.floorMod(snapped + delta * step, 60)
    return hour * 60 + next
}

/** Blank input clears the runtime client ID (the build one applies); anything else is trimmed. */
internal fun normalizeClientId(raw: String): String? = raw.trim().ifEmpty { null }

/** Whether the typed text differs from what is saved, ignoring surrounding spaces. */
internal fun clientIdChanged(draft: String, saved: String?): Boolean =
    normalizeClientId(draft) != saved?.trim()?.ifEmpty { null }

/** Clock text for a minute-of-day, following the 24-hour setting. */
internal fun formatMinuteOfDay(minuteOfDay: Int, clock24h: Boolean, locale: java.util.Locale = java.util.Locale.getDefault()): String {
    val time = java.time.LocalTime.of(Math.floorMod(minuteOfDay, MINUTES_PER_DAY) / 60, Math.floorMod(minuteOfDay, 60))
    val pattern = if (clock24h) "HH:mm" else "h:mm a"
    return java.time.format.DateTimeFormatter.ofPattern(pattern, locale).format(time)
}
