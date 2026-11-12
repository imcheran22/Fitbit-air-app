package com.apex.athlete.ui.common

import android.content.Context
import android.content.res.Resources
import android.text.format.DateFormat
import androidx.compose.runtime.staticCompositionLocalOf
import com.apex.athlete.R
import com.apex.athlete.core.data.settings.UnitSystem
import com.apex.athlete.core.ui.state.MetricFormat
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * Turns values into display text, honouring the owner's units and clock setting and the device
 * locale (decimal commas, month names). Missing or non-finite input always gives
 * [MetricFormat.MISSING] (`--`), never zero.
 *
 * Copy comes from `strings_common.xml`; the formatter reads resources on every call so a locale
 * change is picked up. [zone] and [nowMillis] are injectable for tests.
 */
class ApexFormatter(
    context: Context,
    val units: UnitSystem = UnitSystem.METRIC,
    val clock24h: Boolean = true,
    private val zone: () -> ZoneId = ZoneId::systemDefault,
    private val nowMillis: () -> Long = System::currentTimeMillis,
) {
    private val appContext = context.applicationContext
    private val resources: Resources get() = appContext.resources

    val locale: Locale get() = resources.configuration.locales[0]

    fun string(id: Int, vararg args: Any): String = resources.getString(id, *args)

    fun now(): Long = nowMillis()

    fun today(): LocalDate = Instant.ofEpochMilli(nowMillis()).atZone(zone()).toLocalDate()

    // --- Days and times ------------------------------------------------------------------------

    /** "Today", "Yesterday", "Tomorrow", otherwise a short localised date ("Mon, Nov 9"; the year only when it differs). */
    fun dayLabel(day: LocalDate): String {
        val today = today()
        return when (day) {
            today -> string(R.string.common_day_today)
            today.minusDays(1) -> string(R.string.common_day_yesterday)
            today.plusDays(1) -> string(R.string.common_day_tomorrow)
            else -> shortDate(day, withYear = day.year != today.year)
        }
    }

    /** Short localised date, for example "Mon, Nov 9" or "Nov 9, 2025". */
    fun shortDate(day: LocalDate, withYear: Boolean = false): String {
        val skeleton = if (withYear) "EEEMMMdy" else "EEEMMMd"
        val formatter = try {
            DateTimeFormatter.ofPattern(DateFormat.getBestDateTimePattern(locale, skeleton), locale)
        } catch (_: IllegalArgumentException) {
            DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale)
        }
        return formatter.format(day)
    }

    /** "Just now", "12 min ago", "3 h ago", "2 d ago"; a null time gives "Never". */
    fun relativeTime(thenMillis: Long?): String {
        if (thenMillis == null) return string(R.string.common_time_never)
        val diff = (nowMillis() - thenMillis).coerceAtLeast(0L)
        val minutes = diff / MINUTE
        return when {
            minutes < 1 -> string(R.string.common_time_just_now)
            minutes < 60 -> string(R.string.common_time_minutes_ago, minutes.toInt())
            minutes < 24 * 60 -> string(R.string.common_time_hours_ago, (minutes / 60).toInt())
            else -> string(R.string.common_time_days_ago, (minutes / (24 * 60)).toInt())
        }
    }

    /** "Synced 12 min ago" or "Not synced yet". */
    fun syncedAgo(lastSyncMillis: Long?): String =
        if (lastSyncMillis == null) string(R.string.common_sync_never) else string(R.string.common_sync_ago, relativeTime(lastSyncMillis))

    /** True when [observedAtMillis] is older than the stale threshold (36 h). */
    fun isStale(observedAtMillis: Long): Boolean = nowMillis() - observedAtMillis > STALE_AFTER_MILLIS

    /** "7 h 32 min", "45 min", "2 h"; `--` for a missing or negative value. Rounds to the nearest minute. */
    fun duration(minutes: Double?): String {
        if (minutes == null || !minutes.isFinite() || minutes < 0) return MetricFormat.MISSING
        val total = minutes.roundToInt()
        val h = total / 60
        val m = total % 60
        return when {
            h == 0 -> string(R.string.common_duration_min, m)
            m == 0 -> string(R.string.common_duration_h, h)
            else -> string(R.string.common_duration_h_min, h, m)
        }
    }

    /** Local clock time for a minute-of-day (0..1439) in the owner's 12 or 24 hour style. */
    fun clockTime(minuteOfDay: Int?): String {
        if (minuteOfDay == null || minuteOfDay !in 0 until 1440) return MetricFormat.MISSING
        return clockFormatter().format(LocalTime.of(minuteOfDay / 60, minuteOfDay % 60))
    }

    /** Clock time of an instant, in the recorded offset when known, otherwise the device zone. */
    fun clockTime(epochMillis: Long, zoneOffsetSeconds: Int? = null): String {
        val zoneId: ZoneId = zoneOffsetSeconds?.let { ZoneOffset.ofTotalSeconds(it) } ?: zone()
        return clockFormatter().format(Instant.ofEpochMilli(epochMillis).atZone(zoneId))
    }

    private fun clockFormatter(): DateTimeFormatter =
        DateTimeFormatter.ofPattern(if (clock24h) "HH:mm" else "h:mm a", locale)

    // --- Numbers and units ---------------------------------------------------------------------

    fun number(value: Double?, decimals: Int = 0): String = MetricFormat.number(value, decimals, locale)

    /** Distance in the owner's units: "5.20 km" or "3.23 mi". */
    fun distance(meters: Double?): String {
        if (meters == null || !meters.isFinite() || meters < 0) return MetricFormat.MISSING
        return when (units) {
            UnitSystem.METRIC -> withUnit(meters / 1000.0, R.string.common_unit_km)
            UnitSystem.IMPERIAL -> withUnit(meters / METERS_PER_MILE, R.string.common_unit_mi)
        }
    }

    /** Body weight: "72.4 kg" or "159.6 lb". */
    fun weight(kg: Double?): String {
        if (kg == null || !kg.isFinite() || kg <= 0) return MetricFormat.MISSING
        return when (units) {
            UnitSystem.METRIC -> "${number(kg, 1)} ${string(R.string.common_unit_kg)}"
            UnitSystem.IMPERIAL -> "${number(kg * POUNDS_PER_KG, 1)} ${string(R.string.common_unit_lb)}"
        }
    }

    /** Height: "178 cm" or "5 ft 10 in". */
    fun height(cm: Double?): String {
        if (cm == null || !cm.isFinite() || cm <= 0) return MetricFormat.MISSING
        return when (units) {
            UnitSystem.METRIC -> "${number(cm, 0)} ${string(R.string.common_unit_cm)}"
            UnitSystem.IMPERIAL -> {
                val totalInches = (cm / CM_PER_INCH).roundToInt()
                string(R.string.common_unit_ft_in, totalInches / 12, totalInches % 12)
            }
        }
    }

    /** Skin temperature relative to the personal baseline, signed: "+0.3 °C" or "+0.5 °F". */
    fun temperatureDeviation(celsiusDelta: Double?): String {
        if (celsiusDelta == null || !celsiusDelta.isFinite()) return MetricFormat.MISSING
        return when (units) {
            UnitSystem.METRIC -> "${MetricFormat.delta(celsiusDelta, 1, locale)} ${string(R.string.common_unit_c)}"
            UnitSystem.IMPERIAL -> "${MetricFormat.delta(celsiusDelta * FAHRENHEIT_PER_CELSIUS, 1, locale)} ${string(R.string.common_unit_f)}"
        }
    }

    /** The unit label for a skin-temperature difference in the owner's units. */
    fun temperatureDeltaUnit(): String =
        string(if (units == UnitSystem.METRIC) R.string.common_unit_c else R.string.common_unit_f)

    /** Converts a Celsius difference into the owner's unit (a difference, so no +32 offset). */
    fun temperatureDeltaValue(celsiusDelta: Double): Double =
        if (units == UnitSystem.METRIC) celsiusDelta else celsiusDelta * FAHRENHEIT_PER_CELSIUS

    private fun withUnit(value: Double, unitRes: Int): String {
        val decimals = if (abs(value) < 10.0) 2 else 1
        return "${number(value, decimals)} ${string(unitRes)}"
    }

    companion object {
        const val STALE_AFTER_MILLIS: Long = 36L * 60 * 60 * 1000
        private const val MINUTE = 60_000L
        private const val METERS_PER_MILE = 1609.344
        private const val POUNDS_PER_KG = 2.2046226218
        private const val CM_PER_INCH = 2.54
        private const val FAHRENHEIT_PER_CELSIUS = 1.8
    }
}

/** The formatter for the current settings and locale; provided at the root of the composition. */
val LocalFormatter = staticCompositionLocalOf<ApexFormatter> {
    error("LocalFormatter is provided by MainActivity")
}
