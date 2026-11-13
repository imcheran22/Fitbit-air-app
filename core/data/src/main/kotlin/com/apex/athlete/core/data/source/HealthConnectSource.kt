package com.apex.athlete.core.data.source

import android.content.Context
import com.apex.athlete.core.data.healthconnect.ChangeTokenStore
import com.apex.athlete.core.data.healthconnect.DataStoreChangeTokenStore
import com.apex.athlete.core.data.healthconnect.HcExerciseRecord
import com.apex.athlete.core.data.healthconnect.HcFamily
import com.apex.athlete.core.data.healthconnect.HcFeature
import com.apex.athlete.core.data.healthconnect.HcHeartRateRecord
import com.apex.athlete.core.data.healthconnect.HcInstantRecord
import com.apex.athlete.core.data.healthconnect.HcIntervalRecord
import com.apex.athlete.core.data.healthconnect.HcRecord
import com.apex.athlete.core.data.healthconnect.HcSdkStatus
import com.apex.athlete.core.data.healthconnect.HcSkinTempRecord
import com.apex.athlete.core.data.healthconnect.HcSleepRecord
import com.apex.athlete.core.data.healthconnect.HealthConnectDataSource
import com.apex.athlete.core.data.healthconnect.HealthConnectMapper
import com.apex.athlete.core.data.healthconnect.HealthConnectPermissions
import com.apex.athlete.core.data.healthconnect.InMemoryChangeTokenStore
import com.apex.athlete.core.data.healthconnect.SdkHealthConnectDataSource
import com.apex.athlete.core.data.model.HealthBatch
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.domain.SyncSource
import kotlinx.coroutines.CancellationException
import java.time.Instant
import java.time.ZoneId

/**
 * Health Connect refused a read although the record permission is granted: the run was in the background
 * and the background-read permission is absent or unsupported. Not a missing permission; the stream reads
 * again when the app is open. The orchestrator records the class name, which the Data sources screen maps.
 */
class HealthConnectBackgroundReadException : Exception("Health Connect refused a background read")

/**
 * Reads Health Connect (read-only) and converts it to [HealthBatch]es. It never writes to the
 * database and never writes anything to Health Connect.
 *
 * One stream per record family, each with its own permission. With partial permissions only the
 * permitted streams deliver; the others throw [SourcePermissionException], which the orchestrator
 * records per stream. A permission revoked in the middle of a run surfaces as [SecurityException]
 * from the SDK and is mapped to the same exception.
 *
 * Incremental sync: each stream keeps a change token ([ChangeTokenStore]). Every pull still reads
 * its window (the orchestrator re-reads an overlap on purpose, because writers revise recent data),
 * and the token adds what the window cannot see: records written or edited later with timestamps
 * older than the window. Those spans are re-read through the same windowed path. If the token has
 * expired (about 30 days) or cannot be used, the window read alone is the fallback and a fresh token
 * is issued. Deleted records are counted by the SDK but not propagated: the local database keeps
 * what it ingested (open point).
 */
class HealthConnectSource(
    private val data: HealthConnectDataSource,
    private val tokens: ChangeTokenStore = InMemoryChangeTokenStore(),
    private val zone: ZoneId = ZoneId.systemDefault(),
    preferredOrigins: List<String> = HealthConnectMapper.DEFAULT_PREFERRED_ORIGINS,
) : HealthSource {

    override val source: SyncSource = SyncSource.HEALTH_CONNECT

    private val mapper = HealthConnectMapper(zone, preferredOrigins)

    private enum class Kind { HEART_RATE, SLEEP, DAILY_LATEST, DAILY_TOTAL, NIGHTLY, SKIN, EXERCISE }

    private class Spec(
        val name: String,
        val family: HcFamily,
        val kind: Kind,
        val windowMillis: Long,
        val metric: MetricType? = null,
    ) {
        val stream = SourceStream(name, windowMillis)
    }

    private val specs = listOf(
        Spec("heart-rate", HcFamily.HEART_RATE, Kind.HEART_RATE, 12 * HOUR),
        Spec("sleep", HcFamily.SLEEP, Kind.SLEEP, 7 * DAY),
        Spec("resting-heart-rate", HcFamily.RESTING_HEART_RATE, Kind.DAILY_LATEST, 14 * DAY, MetricType.RESTING_HEART_RATE),
        Spec("hrv", HcFamily.HRV_RMSSD, Kind.NIGHTLY, 3 * DAY, MetricType.HRV_RMSSD),
        Spec("spo2", HcFamily.OXYGEN_SATURATION, Kind.NIGHTLY, 3 * DAY, MetricType.SPO2_AVG),
        Spec("respiratory-rate", HcFamily.RESPIRATORY_RATE, Kind.NIGHTLY, 3 * DAY, MetricType.RESPIRATORY_RATE),
        Spec("skin-temperature", HcFamily.SKIN_TEMPERATURE, Kind.SKIN, 7 * DAY),
        Spec("steps", HcFamily.STEPS, Kind.DAILY_TOTAL, 7 * DAY, MetricType.STEPS),
        Spec("calories", HcFamily.TOTAL_CALORIES, Kind.DAILY_TOTAL, 7 * DAY, MetricType.CALORIES_TOTAL),
        Spec("floors", HcFamily.FLOORS, Kind.DAILY_TOTAL, 7 * DAY, MetricType.FLOORS),
        Spec("vo2-max", HcFamily.VO2_MAX, Kind.DAILY_LATEST, 14 * DAY, MetricType.VO2_MAX),
        Spec("exercise", HcFamily.EXERCISE, Kind.EXERCISE, 7 * DAY),
    )

    /** Skin temperature is listed only where the platform reports the feature. */
    override val streams: List<SourceStream>
        get() {
            val skin = data.isFeatureAvailable(HcFeature.SKIN_TEMPERATURE)
            return specs.filter { it.family != HcFamily.SKIN_TEMPERATURE || skin }.map { it.stream }
        }

    override suspend fun availability(): SourceAvailability = when (data.sdkStatus()) {
        HcSdkStatus.UNAVAILABLE -> SourceAvailability.Unavailable(SourceAvailability.Reason.HEALTH_CONNECT_NOT_INSTALLED)
        HcSdkStatus.UPDATE_REQUIRED -> SourceAvailability.NeedsAction(SourceAvailability.Reason.HEALTH_CONNECT_UPDATE_REQUIRED)
        HcSdkStatus.AVAILABLE -> {
            val granted = try {
                data.grantedPermissions()
            } catch (_: SecurityException) {
                emptySet()
            }
            // Partial permissions are Ready: the permitted streams run, the rest report per stream.
            if (granted.none { it in HealthConnectPermissions.recordPermissions }) {
                SourceAvailability.NeedsAction(SourceAvailability.Reason.PERMISSIONS_MISSING)
            } else {
                SourceAvailability.Ready
            }
        }
    }

    override suspend fun pull(stream: SourceStream, fromMillis: Long, toMillis: Long, emit: suspend (HealthBatch) -> Unit) {
        val spec = specs.firstOrNull { it.name == stream.name }
            ?: throw IllegalArgumentException("Unknown Health Connect stream")
        if (toMillis <= fromMillis) return
        try {
            val granted = data.grantedPermissions()
            if (HealthConnectPermissions.forFamily(spec.family) !in granted) {
                throw SourcePermissionException(spec.name, "Health Connect read permission not granted")
            }
            if (spec.family == HcFamily.SKIN_TEMPERATURE && !data.isFeatureAvailable(HcFeature.SKIN_TEMPERATURE)) {
                throw SourcePermissionException(spec.name, "Skin temperature is not supported by this Health Connect")
            }
            pullWithChanges(spec, granted, fromMillis, toMillis, emit)
        } catch (e: SecurityException) {
            // Either the permission was revoked during the run, or Health Connect refused a read made in the
            // background (READ_HEALTH_DATA_IN_BACKGROUND absent or unsupported) while the record permission is
            // still granted. Ask again which one it is.
            val stillGranted = try {
                HealthConnectPermissions.forFamily(spec.family) in data.grantedPermissions()
            } catch (_: SecurityException) {
                false
            }
            if (stillGranted) throw HealthConnectBackgroundReadException()
            throw SourcePermissionException(spec.name, "Health Connect permission revoked")
        }
    }

    // --- Change tokens ----------------------------------------------------------------------------

    private suspend fun pullWithChanges(
        spec: Spec,
        granted: Set<String>,
        from: Long,
        to: Long,
        emit: suspend (HealthBatch) -> Unit,
    ) {
        var nextToken: String? = null
        val staleSpans = ArrayList<LongArray>()

        val stored = tokens.get(spec.name)
        if (stored != null) {
            try {
                var token: String = stored
                var expired = false
                val spans = ArrayList<LongArray>()
                while (true) {
                    val page = data.readChanges(token)
                    if (page.tokenExpired) {
                        expired = true
                        break
                    }
                    page.upserted.forEach { r -> span(r)?.let(spans::add) }
                    token = page.nextToken
                    if (!page.hasMore) break
                }
                if (!expired) {
                    nextToken = token
                    staleSpans += spans
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: SecurityException) {
                throw e
            } catch (_: Exception) {
                nextToken = null // unusable token: fall back to the window alone
                staleSpans.clear()
            }
        }
        if (nextToken == null) {
            // Issued before the read so nothing written during it is missed.
            nextToken = try {
                data.newChangesToken(setOf(spec.family))
            } catch (e: CancellationException) {
                throw e
            } catch (e: SecurityException) {
                throw e
            } catch (_: Exception) {
                null
            }
        }

        readWindow(spec, granted, from, to, emit)

        // Records changed outside the window just read: re-read those spans through the same path.
        var chunks = 0
        for ((s, e) in mergeSpans(staleSpans.filter { it[0] < from || it[1] > to })) {
            var a = s
            while (a < e && chunks < MAX_CATCH_UP_CHUNKS) {
                val b = minOf(e, a + spec.windowMillis)
                readWindow(spec, granted, a, b, emit)
                a = b
                chunks++
            }
        }

        // Saved only after everything above was delivered, so a failure replays the same changes.
        if (nextToken != null) tokens.put(spec.name, nextToken)
    }

    /** [start, end) in epoch millis of what a changed record covers. */
    private fun span(r: HcRecord): LongArray? = when (r) {
        is HcHeartRateRecord -> r.samples.takeIf { it.isNotEmpty() }?.let { s -> longArrayOf(s.minOf { it.epochMillis }, s.maxOf { it.epochMillis } + 1) }
        is HcInstantRecord -> longArrayOf(r.epochMillis, r.epochMillis + 1)
        is HcIntervalRecord -> longArrayOf(r.startEpochMillis, maxOf(r.endEpochMillis, r.startEpochMillis + 1))
        is HcSleepRecord -> longArrayOf(r.startEpochMillis, maxOf(r.endEpochMillis, r.startEpochMillis + 1))
        is HcExerciseRecord -> longArrayOf(r.startEpochMillis, r.endEpochMillis + 1)
        is HcSkinTempRecord -> longArrayOf(r.startEpochMillis, maxOf(r.endEpochMillis, r.startEpochMillis + 1))
    }

    private fun mergeSpans(spans: List<LongArray>): List<Pair<Long, Long>> {
        val out = ArrayList<Pair<Long, Long>>()
        for (s in spans.sortedBy { it[0] }) {
            val last = out.lastOrNull()
            if (last != null && s[0] <= last.second + DAY / 2) out[out.size - 1] = last.first to maxOf(last.second, s[1])
            else out += s[0] to s[1]
        }
        return out
    }

    // --- Windowed reads ---------------------------------------------------------------------------

    private suspend fun readWindow(spec: Spec, granted: Set<String>, from: Long, to: Long, emit: suspend (HealthBatch) -> Unit) {
        when (spec.kind) {
            Kind.HEART_RATE -> {
                var token: String? = null
                do {
                    // Health Connect returns an interval record only to a read whose range contains its start, so
                    // read from a lead before the window; the mapper keeps only samples inside [from, to).
                    val page = data.readPage(HcFamily.HEART_RATE, from - READ_LEAD, to, token)
                    val points = mapper.heartRate(page.records.filterIsInstance<HcHeartRateRecord>(), from, to)
                    for (chunk in points.chunked(HR_CHUNK)) emit(batch(heartRate = chunk))
                    token = nextToken(token, page.nextPageToken)
                } while (token != null)
            }
            Kind.SLEEP -> {
                val sleeps = mapper.sleeps(readAll(HcFamily.SLEEP, from, to).filterIsInstance<HcSleepRecord>())
                if (sleeps.isNotEmpty()) emit(batch(sleeps = sleeps))
            }
            Kind.DAILY_LATEST -> {
                val (firstDay, lastDay) = days(from, to)
                val records = readAll(spec.family, dayStart(firstDay) - MARGIN, dayStart(lastDay + 1) + MARGIN).filterIsInstance<HcInstantRecord>()
                val daily = mapper.latestPerDay(records, spec.metric!!, firstDay, lastDay)
                if (daily.isNotEmpty()) emit(batch(daily = daily))
            }
            Kind.DAILY_TOTAL -> {
                val (firstDay, lastDay) = days(from, to)
                val records = readAll(spec.family, dayStart(firstDay) - MARGIN, dayStart(lastDay + 1) + MARGIN).filterIsInstance<HcIntervalRecord>()
                val daily = mapper.dailyTotals(records, spec.metric!!, firstDay, lastDay)
                if (daily.isNotEmpty()) emit(batch(daily = daily))
            }
            Kind.NIGHTLY -> {
                val metric = spec.metric!!
                val readings = readAll(spec.family, from - MARGIN, to + MARGIN).filterIsInstance<HcInstantRecord>()
                // Without sleep permission only raw samples are delivered; no daily value is invented.
                val sleeps = if (HealthConnectPermissions.sleep in granted) {
                    readAll(HcFamily.SLEEP, from - MARGIN, to + MARGIN).filterIsInstance<HcSleepRecord>()
                } else {
                    emptyList()
                }
                val daily = if (metric == MetricType.SPO2_AVG) mapper.nightlySpo2(readings, sleeps, from, to)
                else mapper.nightlyMean(readings, sleeps, metric, from, to)
                val samples = mapper.samples(readings, metric, from, to)
                if (daily.isNotEmpty() || samples.isNotEmpty()) emit(batch(daily = daily, samples = samples))
            }
            Kind.SKIN -> {
                val records = readAll(HcFamily.SKIN_TEMPERATURE, from - MARGIN, to + MARGIN).filterIsInstance<HcSkinTempRecord>()
                val daily = mapper.skinTemperature(records, from, to)
                if (daily.isNotEmpty()) emit(batch(daily = daily))
            }
            Kind.EXERCISE -> {
                val sessions = readAll(HcFamily.EXERCISE, from, to).filterIsInstance<HcExerciseRecord>()
                val workouts = sessions.mapNotNull { s ->
                    suspend fun optional(family: HcFamily): List<HcRecord> =
                        if (HealthConnectPermissions.forFamily(family) in granted) readAllSafely(family, s.startEpochMillis, s.endEpochMillis) else emptyList()
                    mapper.workout(
                        session = s,
                        heartRate = optional(HcFamily.HEART_RATE).filterIsInstance<HcHeartRateRecord>(),
                        calories = optional(HcFamily.TOTAL_CALORIES).filterIsInstance<HcIntervalRecord>(),
                        distance = optional(HcFamily.DISTANCE).filterIsInstance<HcIntervalRecord>(),
                        steps = optional(HcFamily.STEPS).filterIsInstance<HcIntervalRecord>(),
                    )
                }
                if (workouts.isNotEmpty()) emit(batch(workouts = workouts))
            }
        }
    }

    /** Pages through every record of [family] overlapping the range. */
    private suspend fun readAll(family: HcFamily, from: Long, to: Long): List<HcRecord> {
        val out = ArrayList<HcRecord>()
        var token: String? = null
        do {
            val page = data.readPage(family, from, to, token)
            out += page.records
            token = nextToken(token, page.nextPageToken)
        } while (token != null)
        return out
    }

    // Exercise enrichment: a revoked optional permission must not drop the session itself.
    private suspend fun readAllSafely(family: HcFamily, from: Long, to: Long): List<HcRecord> =
        try {
            readAll(family, from, to)
        } catch (e: SecurityException) {
            emptyList()
        }

    /** A repeated token would loop forever; treat it as the end. */
    private fun nextToken(current: String?, next: String?): String? = next?.takeIf { it.isNotEmpty() && it != current }

    private fun days(from: Long, to: Long): Pair<Long, Long> =
        Instant.ofEpochMilli(from).atZone(zone).toLocalDate().toEpochDay() to
            Instant.ofEpochMilli(to - 1).atZone(zone).toLocalDate().toEpochDay()

    private fun dayStart(epochDay: Long): Long =
        java.time.LocalDate.ofEpochDay(epochDay).atStartOfDay(zone).toInstant().toEpochMilli()

    private fun batch(
        heartRate: List<com.apex.athlete.core.data.model.HeartRatePoint> = emptyList(),
        daily: List<com.apex.athlete.core.data.model.DailyObservation> = emptyList(),
        samples: List<com.apex.athlete.core.data.model.SampleObservation> = emptyList(),
        sleeps: List<com.apex.athlete.core.data.model.SleepObservation> = emptyList(),
        workouts: List<com.apex.athlete.core.data.model.WorkoutObservation> = emptyList(),
    ) = HealthBatch(DataProvenance.IMPORTED_HEALTH_CONNECT, heartRate, daily, samples, sleeps, workouts)

    companion object {
        private const val HOUR = 60L * 60 * 1000
        private const val DAY = 24 * HOUR

        /** Margin read around a window so a night or a day with another zone offset is complete. */
        private const val MARGIN = 14 * HOUR

        /** Look-back for heart-rate reads (Pulse `READ_LEAD_S`): a record that began before the window must still be returned. */
        private const val READ_LEAD = 24 * HOUR
        private const val HR_CHUNK = 20_000
        private const val MAX_CATCH_UP_CHUNKS = 200

        /** The production wiring: the real SDK and DataStore-backed change tokens. */
        fun create(context: Context, zone: ZoneId = ZoneId.systemDefault()): HealthConnectSource =
            HealthConnectSource(SdkHealthConnectDataSource(context), DataStoreChangeTokenStore(context), zone)
    }
}
