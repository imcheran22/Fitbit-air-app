package com.apex.athlete.core.network.googlehealth

import com.apex.athlete.core.network.auth.GoogleHealthAuthConfig
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** How a data type is addressed by the list filter (see `dataPoints.list` in the discovery document). */
enum class DataTypeKind {
    /** Has `interval.start_time` / `interval.civil_start_time` (steps, distance, ...). */
    INTERVAL,

    /** Has `sample_time.physical_time` / `sample_time.civil_time` (heart-rate, SpO2, ...). */
    SAMPLE,

    /** One point per civil day, filtered with `{type}.date`. */
    DAILY,

    /** Session types filtered by `interval.civil_start_time` (exercise). */
    SESSION,

    /** `sleep`: filtered by `sleep.interval.end_time` / `civil_end_time`. */
    SLEEP_SESSION,
}

/**
 * The data types Apex reads. [id] is the kebab-case collection id used in
 * `users/{user}/dataTypes/{id}`; [filterField] is the snake_case name used in filter expressions.
 * Both come from the `DataPoint` union in the discovery document (revision 20261109).
 *
 * [scopeCandidates] is an inference: the discovery document names the read scopes but does not
 * say which data type needs which. It is used only to word a 403 and is marked unverified in
 * `docs/API_VALIDATION.md`.
 */
enum class GoogleHealthDataType(
    val id: String,
    val kind: DataTypeKind,
    val scopeCandidates: List<String>,
    val maxPageSize: Int = 10_000,
) {
    HEART_RATE("heart-rate", DataTypeKind.SAMPLE, health()),
    HEART_RATE_VARIABILITY("heart-rate-variability", DataTypeKind.SAMPLE, health()),
    OXYGEN_SATURATION("oxygen-saturation", DataTypeKind.SAMPLE, health()),
    RESPIRATORY_RATE_SLEEP_SUMMARY("respiratory-rate-sleep-summary", DataTypeKind.SAMPLE, health()),
    VO2_MAX("vo2-max", DataTypeKind.SAMPLE, activity()),
    RUN_VO2_MAX("run-vo2-max", DataTypeKind.SAMPLE, activity()),
    WEIGHT("weight", DataTypeKind.SAMPLE, health()),
    BODY_FAT("body-fat", DataTypeKind.SAMPLE, health()),
    CORE_BODY_TEMPERATURE("core-body-temperature", DataTypeKind.SAMPLE, health()),

    DAILY_RESTING_HEART_RATE("daily-resting-heart-rate", DataTypeKind.DAILY, health()),
    DAILY_HEART_RATE_VARIABILITY("daily-heart-rate-variability", DataTypeKind.DAILY, health()),
    DAILY_OXYGEN_SATURATION("daily-oxygen-saturation", DataTypeKind.DAILY, health()),
    DAILY_RESPIRATORY_RATE("daily-respiratory-rate", DataTypeKind.DAILY, health()),
    DAILY_SLEEP_TEMPERATURE_DERIVATIONS("daily-sleep-temperature-derivations", DataTypeKind.DAILY, health()),
    DAILY_VO2_MAX("daily-vo2-max", DataTypeKind.DAILY, activity()),
    DAILY_HEART_RATE_ZONES("daily-heart-rate-zones", DataTypeKind.DAILY, health()),

    STEPS("steps", DataTypeKind.INTERVAL, activity()),
    DISTANCE("distance", DataTypeKind.INTERVAL, activity()),
    FLOORS("floors", DataTypeKind.INTERVAL, activity()),
    ALTITUDE("altitude", DataTypeKind.INTERVAL, activity()),
    ACTIVE_ENERGY_BURNED("active-energy-burned", DataTypeKind.INTERVAL, activity()),
    BASAL_ENERGY_BURNED("basal-energy-burned", DataTypeKind.INTERVAL, activity()),
    ACTIVE_ZONE_MINUTES("active-zone-minutes", DataTypeKind.INTERVAL, activity()),
    ACTIVE_MINUTES("active-minutes", DataTypeKind.INTERVAL, activity()),
    SEDENTARY_PERIOD("sedentary-period", DataTypeKind.INTERVAL, activity()),
    TIME_IN_HEART_RATE_ZONE("time-in-heart-rate-zone", DataTypeKind.INTERVAL, activity()),

    EXERCISE("exercise", DataTypeKind.SESSION, activity(), maxPageSize = 25),
    SLEEP("sleep", DataTypeKind.SLEEP_SESSION, listOf(GoogleHealthAuthConfig.SCOPE_SLEEP), maxPageSize = 25),
    ;

    /** Snake-case name used inside filter expressions, e.g. `daily_heart_rate_variability`. */
    val filterField: String = id.replace('-', '_')

    /** Page size the server uses when none is sent (1440 normally, 25 for exercise and sleep). */
    val defaultPageSize: Int get() = if (maxPageSize == 25) 25 else 1440

    fun clampPageSize(requested: Int?): Int? = requested?.coerceIn(1, maxPageSize)

    companion object {
        private val byId = entries.associateBy { it.id }
        fun fromId(id: String): GoogleHealthDataType? = byId[id]
    }
}

private fun health() = listOf(GoogleHealthAuthConfig.SCOPE_HEALTH_METRICS, GoogleHealthAuthConfig.SCOPE_ACTIVITY)
private fun activity() = listOf(GoogleHealthAuthConfig.SCOPE_ACTIVITY, GoogleHealthAuthConfig.SCOPE_HEALTH_METRICS)

/** Values accepted by the `dataSourceFamily` query parameter (`users/{user}/dataSourceFamilies/{id}`). */
enum class DataSourceFamily(val id: String) {
    ALL_SOURCES("all-sources"),
    GOOGLE_WEARABLES("google-wearables"),
    GOOGLE_SOURCES("google-sources"),
}

/**
 * Builds AIP-160 filter strings exactly as documented on `dataPoints.list`. Only `>=`, `<` and
 * `AND` are used. Time literals are RFC 3339 UTC; civil literals are `YYYY-MM-DD[THH:mm:ss]`.
 */
object GoogleHealthFilter {
    private val civilDateTime: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")

    /**
     * Half-open range [from, to). Instants are used directly for sample, interval and sleep-end
     * filters. Civil-time filters (daily, exercise) are converted with [zone] and widened by one day
     * on each side for exercise, so travel across time zones cannot hide a session; callers trim the
     * result by the real timestamps.
     */
    fun timeRange(type: GoogleHealthDataType, from: Instant, to: Instant, zone: ZoneId): String {
        require(from < to) { "from must be before to" }
        val f = type.filterField
        return when (type.kind) {
            DataTypeKind.SAMPLE -> and("$f.sample_time.physical_time >= \"${utc(from)}\"", "$f.sample_time.physical_time < \"${utc(to)}\"")
            DataTypeKind.INTERVAL -> and("$f.interval.start_time >= \"${utc(from)}\"", "$f.interval.start_time < \"${utc(to)}\"")
            DataTypeKind.SLEEP_SESSION -> and("$f.interval.end_time >= \"${utc(from)}\"", "$f.interval.end_time < \"${utc(to)}\"")
            DataTypeKind.DAILY -> {
                val start = from.atZone(zone).toLocalDate()
                val endInclusive = to.minusMillis(1).atZone(zone).toLocalDate()
                dateRange(type, start, endInclusive.plusDays(1))
            }
            DataTypeKind.SESSION -> {
                val start = LocalDateTime.ofInstant(from, zone).toLocalDate().minusDays(1).atStartOfDay()
                val end = LocalDateTime.ofInstant(to, zone).toLocalDate().plusDays(2).atStartOfDay()
                and("$f.interval.civil_start_time >= \"${civilDateTime.format(start)}\"", "$f.interval.civil_start_time < \"${civilDateTime.format(end)}\"")
            }
        }
    }

    /** Daily data types: `{type}.date >= "from" AND {type}.date < "toExclusive"`. */
    fun dateRange(type: GoogleHealthDataType, fromInclusive: LocalDate, toExclusive: LocalDate): String {
        require(type.kind == DataTypeKind.DAILY) { "${type.id} is not a daily data type" }
        require(fromInclusive < toExclusive) { "from must be before to" }
        return and("${type.filterField}.date >= \"$fromInclusive\"", "${type.filterField}.date < \"$toExclusive\"")
    }

    /** Only the lower bound, e.g. "everything since the watermark". */
    fun since(type: GoogleHealthDataType, from: Instant, zone: ZoneId): String = when (type.kind) {
        DataTypeKind.SAMPLE -> "${type.filterField}.sample_time.physical_time >= \"${utc(from)}\""
        DataTypeKind.INTERVAL -> "${type.filterField}.interval.start_time >= \"${utc(from)}\""
        DataTypeKind.SLEEP_SESSION -> "${type.filterField}.interval.end_time >= \"${utc(from)}\""
        DataTypeKind.DAILY -> "${type.filterField}.date >= \"${from.atZone(zone).toLocalDate()}\""
        DataTypeKind.SESSION ->
            "${type.filterField}.interval.civil_start_time >= \"${civilDateTime.format(LocalDateTime.ofInstant(from, zone).toLocalDate().minusDays(1).atStartOfDay())}\""
    }

    private fun utc(instant: Instant): String = DateTimeFormatter.ISO_INSTANT.format(instant.truncatedTo(java.time.temporal.ChronoUnit.SECONDS))

    private fun and(a: String, b: String) = "$a AND $b"
}
