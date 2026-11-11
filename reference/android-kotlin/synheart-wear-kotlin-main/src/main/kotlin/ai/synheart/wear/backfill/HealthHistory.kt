// SPDX-License-Identifier: Apache-2.0
//
// Historical Health Connect read contract. Consumed by
// `ai.synheart.core.backfill.HealthConnectRuntimeSink` in synheart-core
// to seed the runtime SRM from Android Health Connect history at
// install / login.
//
// Parallels Flutter's `HealthAdapter.fetchSleepNights` /
// `fetchOvernightPhysiology` in synheart_wear — wear owns Health
// Connect SDK calls, core owns aggregation and runtime push.

package ai.synheart.wear.backfill

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Per-night sleep summary keyed by local wake-day (the day the sleep
 * session ended in [ZoneId]).
 *
 * - [totalAsleepMinutes] excludes AWAKE / OUT_OF_BED / AWAKE_IN_BED
 *   stages when stage data is present. Falls back to session duration
 *   when stages are absent.
 * - [deepMinutes] / [remMinutes] are null when the source didn't
 *   classify stages (e.g. devices that only emit a sleep session
 *   without stage breakdown).
 */
data class SleepNightSummary(
    val totalAsleepMinutes: Double,
    val deepMinutes: Double?,
    val remMinutes: Double?,
)

/**
 * Per-night overnight physiology keyed by local wake-day.
 *
 * HR and HRV-RMSSD are averaged over the sleep window(s) for that day.
 * A field is null when no in-sleep samples were available — the
 * runtime treats nulls as "missing for this day" rather than zero.
 */
data class OvernightPhysiologySummary(
    val hrvRmssdMs: Double?,
    val restingHrBpm: Double?,
)

/**
 * Reader contract for historical Health Connect data. Implemented by
 * `HealthConnectAdapter`; abstracted so synheart-core can depend on
 * the shape without importing the Health Connect SDK.
 *
 * Both fetch methods bucket by **local wake-day** (the day the sleep
 * session ended) using the caller-supplied [zone]. An empty map is a
 * valid "no data" response — callers should not treat it as an error.
 */
interface HealthHistoryReader {
    /** True when Health Connect is installed, supported, and ready to read. */
    suspend fun isAvailable(): Boolean

    suspend fun fetchSleepNights(
        start: Instant,
        end: Instant,
        zone: ZoneId,
    ): Map<LocalDate, SleepNightSummary>

    suspend fun fetchOvernightPhysiology(
        start: Instant,
        end: Instant,
        zone: ZoneId,
    ): Map<LocalDate, OvernightPhysiologySummary>
}
