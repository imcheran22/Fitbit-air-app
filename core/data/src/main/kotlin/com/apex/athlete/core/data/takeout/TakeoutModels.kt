package com.apex.athlete.core.data.takeout

import kotlinx.serialization.Serializable
import java.io.InputStream
import java.time.ZoneId

/*
 * Vocabulary of the Takeout archive engine. Everything in this package except
 * TakeoutRoomBindings.kt is plain JVM code: it reads streams and produces observations and counts,
 * and knows nothing about Android, Room or WorkManager.
 *
 * Nothing here has been checked against a real archive. File names, columns, units and timestamp
 * conventions are hypotheses taken from the brief and from third-party descriptions; every one is
 * listed in docs/OPEN_POINTS.md with the step that confirms it.
 */

/**
 * A kind of file the engine knows how to read. [key] is persisted in the watermark tables; never
 * rename an existing key.
 */
@Serializable
enum class TakeoutCategory(val key: String) {
    HEART_RATE("heart_rate"),
    RESTING_HEART_RATE("resting_heart_rate"),
    STEPS("steps"),
    SLEEP("sleep"),
    EXERCISE("exercise"),
    HRV_DETAILS("hrv_details"),
    HRV_DAILY("hrv_daily"),
    SPO2_MINUTE("spo2_minute"),
    SPO2_DAILY("spo2_daily"),
    RESPIRATORY_RATE("respiratory_rate"),
    DEVICE_TEMPERATURE("device_temperature"),
    COMPUTED_TEMPERATURE("computed_temperature"),
    ;

    /** Stream name of this category's row in the sync-watermark table. */
    val watermarkStream: String get() = "takeout:$key"

    companion object {
        private val byKey = entries.associateBy { it.key }

        fun fromKey(key: String): TakeoutCategory? = byKey[key]
    }
}

/**
 * Which export layout a file belongs to. [CLASSIC] is the long-standing Fitbit export
 * ("Global Export Data", "Heart Rate Variability", ...). [GOOGLE] is the per-data-type CSV layout
 * reported for Google-account exports. When both carry the same data, [CLASSIC] is preferred
 * because its heart-rate files include the sensor's confidence.
 */
@Serializable
enum class TakeoutLayout { CLASSIC, GOOGLE }

enum class TakeoutFormat { JSON, CSV }

/** What the router decided about one archive entry. */
data class TakeoutRoute(
    val category: TakeoutCategory,
    val layout: TakeoutLayout,
    val format: TakeoutFormat,
    /** Lower-cased file name. Whitelisted names hold only a data type and dates, never personal data. */
    val fileKey: String,
    /** The (first) date in the file name as days since 1970-01-01; null for undated files. */
    val fileEpochDay: Long?,
)

/**
 * One ZIP the owner picked. [open] must return a fresh stream every time it is called: the engine
 * reads each part more than once (inspection, then import) and never stores the bytes.
 */
class TakeoutArchivePart(val displayName: String, val open: () -> InputStream)

/**
 * How a timestamp that carries no UTC offset is turned into an instant. A timestamp that carries
 * its own offset or a trailing `Z` is always taken as written, whatever the rule says.
 */
@Serializable
enum class ZoneRule {
    /** The written clock time is UTC. */
    UTC,

    /** The written clock time is the wall clock of [TakeoutTimeConfig.localZone]. */
    DEVICE_LOCAL,
}

/**
 * Timestamp interpretation per file type and layout.
 *
 * UNVERIFIED against the owner's archive. Defaults follow the one first-hand account available
 * (the `fitbit-analytics` reference, written against a real Fitbit Air export): the classic
 * "Global Export Data" files are written in the device's local wall-clock time, and the Google
 * layout writes UTC instants with a trailing `Z` (which [TakeoutClock] honours whatever the rule
 * says). The rule only matters for a timestamp written without an offset. docs/OPEN_POINTS.md
 * lists the overlap check with Health Connect that confirms it.
 *
 * Daily summary files are not affected: their timestamp is a calendar-date label and is read
 * literally, never shifted through a zone.
 */
data class TakeoutTimeConfig(
    /** Zone used for [ZoneRule.DEVICE_LOCAL] and for assigning instants to civil days. */
    val localZone: ZoneId,
    /** Overrides for classic-layout files; a category not listed is [ZoneRule.DEVICE_LOCAL]. */
    val classicRules: Map<TakeoutCategory, ZoneRule> = emptyMap(),
    /** Rule for Google-layout timestamps that carry no offset. */
    val googleRule: ZoneRule = ZoneRule.UTC,
) {
    fun ruleFor(category: TakeoutCategory, layout: TakeoutLayout): ZoneRule = when (layout) {
        TakeoutLayout.CLASSIC -> classicRules[category] ?: ZoneRule.DEVICE_LOCAL
        TakeoutLayout.GOOGLE -> googleRule
    }

    fun ruleFor(route: TakeoutRoute): ZoneRule = ruleFor(route.category, route.layout)
}

/** What the screens and the notification show while an import runs. Counts only, never values. */
sealed interface TakeoutImportProgress {
    /** First pass: listing the archive. */
    data class Inspecting(val part: Int, val partCount: Int, val entriesSeen: Int) : TakeoutImportProgress

    /** Second pass: file [fileIndex] of [fileCount] is being parsed and written. Row counts are run totals. */
    data class Importing(
        val fileIndex: Int,
        val fileCount: Int,
        val category: TakeoutCategory,
        val rowsImported: Long,
        val rowsDropped: Long,
        val rowsQuarantined: Long,
        /** True for the update sent when file [fileIndex] has been read to its end. */
        val fileFinished: Boolean = false,
    ) : TakeoutImportProgress

    /** Derived scores are being recomputed in date order. */
    data class Recalculating(val day: Int, val dayCount: Int) : TakeoutImportProgress
}
