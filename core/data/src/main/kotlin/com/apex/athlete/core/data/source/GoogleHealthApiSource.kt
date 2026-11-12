package com.apex.athlete.core.data.source

import com.apex.athlete.core.data.googlehealth.GoogleHealthMapper
import com.apex.athlete.core.data.model.DailyObservation
import com.apex.athlete.core.data.model.HealthBatch
import com.apex.athlete.core.data.model.HeartRatePoint
import com.apex.athlete.core.data.model.SampleObservation
import com.apex.athlete.core.data.model.SleepObservation
import com.apex.athlete.core.data.model.WorkoutObservation
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.SyncSource
import com.apex.athlete.core.network.GoogleHealthNetwork
import com.apex.athlete.core.network.auth.AuthState
import com.apex.athlete.core.network.googlehealth.ApiResult
import com.apex.athlete.core.network.googlehealth.DataPoint
import com.apex.athlete.core.network.googlehealth.DataSourceFamily
import com.apex.athlete.core.network.googlehealth.GoogleHealthApiClient
import com.apex.athlete.core.network.googlehealth.GoogleHealthDataType
import com.apex.athlete.core.network.googlehealth.GoogleHealthError
import com.apex.athlete.core.network.googlehealth.GoogleHealthFilter
import com.apex.athlete.core.network.googlehealth.ListRequest
import com.apex.athlete.core.network.rate.RequestPriority
import kotlinx.coroutines.flow.first
import java.time.Instant
import java.time.ZoneId
import java.util.concurrent.atomic.AtomicLong

/** A server error or exhausted retries; the orchestrator records only this class name. */
class GoogleHealthServerException(val httpCode: Int) : Exception("Google Health server error")

/** No connection after the client's retries. */
class GoogleHealthNetworkException : Exception("Google Health network failure")

/** The request was refused as malformed or the answer was unexpected (a bug or an API change, not the user's doing). */
class GoogleHealthRequestException(val httpCode: Int?) : Exception("Google Health request failed")

/** A page came back that could not be read at all. Nothing was learned about the window, so it is not marked complete. */
class GoogleHealthParseException : Exception("Google Health response unreadable")

/** Counts of what this source did with the data it received. Never values. */
data class GoogleHealthSourceStats(
    val pointsRead: Long = 0,
    /** Points the client could not decode at all (tolerant reader). */
    val clientMalformed: Long = 0,
    /** Points decoded but not usable (missing time, bad date, no value). */
    val mapperMalformed: Long = 0,
    val implausible: Long = 0,
    /** Points of a kind this source does not read. */
    val ignored: Long = 0,
)

/**
 * Reads the Google Health API v4 (read-only `GET`s through [GoogleHealthApiClient]) and converts the
 * data points to [HealthBatch]es with provenance [DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API]
 * (manually logged weight and body fat are labelled [DataProvenance.USER_REPORTED]). It never writes
 * to the database and never writes anything to Google.
 *
 * ### Streams and windows
 * One stream per data type (or small group), each with its own watermark. Window sizes are chosen to
 * keep one request series small:
 *
 * | stream | window | notes |
 * |---|---|---|
 * | `heart-rate` | **24 h** | intraday, `dataSourceFamily=google-wearables` (band only); see below |
 * | `sleep`, `exercise` | 14 days | pages of at most 25 |
 * | `hrv-sleep` | 7 days | reads the sleeps ending in the window, then the HRV samples of each night (band only); stored as `HRV_SLEEP_SAMPLES` |
 * | `resting-heart-rate`, `hrv`, `spo2`, `respiratory-rate`, `skin-temperature`, `vo2-max` | 30 days | one point per day |
 * | `steps`, `distance`, `floors`, `calories`, `active-zone-minutes`, `active-minutes`, `sedentary` | 7 days | read through `dataPoints:reconcile` (one merged stream), summed per civil day |
 * | `weight`, `body-fat` | 30 days | samples |
 *
 * **Intraday cap (master prompt Alert A).** At most 3 days of intraday heart rate per run is enforced
 * by the pair (stream window 24 h) x (orchestrator `Config.maxWindowsPerStream = 3`). The app container
 * must build the orchestrator with `maxWindowsPerStream = 3`; deeper history then continues on the next
 * runs through the watermark, or comes from the Takeout archive. The source refuses a window larger than
 * its stream allows.
 *
 * ### Day totals
 * Interval types are read for whole civil days (the window is widened to day boundaries plus a zone
 * margin) and the total of each day is recomputed from scratch, so re-reading is idempotent and a window
 * that cuts a day in half never leaves half a total behind.
 *
 * ### Errors
 * 401 after one refresh -> [SourceAuthExpiredException]; 403 -> [SourcePermissionException] naming the
 * stream; 429 / exhausted budget -> [SourceRateLimitedException]; 404 or an empty answer -> the window is
 * complete; 5xx or network failure after the client's own retries -> [GoogleHealthServerException] /
 * [GoogleHealthNetworkException] (the orchestrator records the type only). Points that cannot be decoded
 * are counted in [stats] and skipped; a page that cannot be read at all throws [GoogleHealthParseException].
 *
 * @param network the current network stack; read on every call so sign-in changes are picked up.
 * @param priority priority of the requests of this run (foreground runs may use the reserved budget).
 */
class GoogleHealthApiSource(
    private val network: () -> GoogleHealthNetwork,
    private val zone: () -> ZoneId = ZoneId::systemDefault,
    private val priority: () -> RequestPriority = { RequestPriority.BACKGROUND },
) : HealthSource {

    override val source: SyncSource = SyncSource.GOOGLE_HEALTH_API

    private enum class Kind { HEART_RATE, SLEEP, HRV_SLEEP, EXERCISE, DAILY, VO2, BODY, INTERVAL, CALORIES }

    private class Spec(val name: String, val kind: Kind, val windowMillis: Long, val types: List<GoogleHealthDataType>) {
        val stream = SourceStream(name, windowMillis)
    }

    private val specs: List<Spec> = listOf(
        Spec("heart-rate", Kind.HEART_RATE, DAY, listOf(GoogleHealthDataType.HEART_RATE)),
        Spec("sleep", Kind.SLEEP, 14 * DAY, listOf(GoogleHealthDataType.SLEEP)),
        Spec("hrv-sleep", Kind.HRV_SLEEP, 7 * DAY, listOf(GoogleHealthDataType.SLEEP, GoogleHealthDataType.HEART_RATE_VARIABILITY)),
        Spec("exercise", Kind.EXERCISE, 14 * DAY, listOf(GoogleHealthDataType.EXERCISE)),
        Spec("resting-heart-rate", Kind.DAILY, 30 * DAY, listOf(GoogleHealthDataType.DAILY_RESTING_HEART_RATE)),
        Spec("hrv", Kind.DAILY, 30 * DAY, listOf(GoogleHealthDataType.DAILY_HEART_RATE_VARIABILITY)),
        Spec("spo2", Kind.DAILY, 30 * DAY, listOf(GoogleHealthDataType.DAILY_OXYGEN_SATURATION)),
        Spec("respiratory-rate", Kind.DAILY, 30 * DAY, listOf(GoogleHealthDataType.DAILY_RESPIRATORY_RATE)),
        Spec("skin-temperature", Kind.DAILY, 30 * DAY, listOf(GoogleHealthDataType.DAILY_SLEEP_TEMPERATURE_DERIVATIONS)),
        Spec("vo2-max", Kind.VO2, 30 * DAY, listOf(GoogleHealthDataType.DAILY_VO2_MAX)),
        Spec("steps", Kind.INTERVAL, 7 * DAY, listOf(GoogleHealthDataType.STEPS)),
        Spec("distance", Kind.INTERVAL, 7 * DAY, listOf(GoogleHealthDataType.DISTANCE)),
        Spec("floors", Kind.INTERVAL, 7 * DAY, listOf(GoogleHealthDataType.FLOORS)),
        Spec("calories", Kind.CALORIES, 7 * DAY, listOf(GoogleHealthDataType.ACTIVE_ENERGY_BURNED, GoogleHealthDataType.BASAL_ENERGY_BURNED)),
        Spec("active-zone-minutes", Kind.INTERVAL, 7 * DAY, listOf(GoogleHealthDataType.ACTIVE_ZONE_MINUTES)),
        Spec("active-minutes", Kind.INTERVAL, 7 * DAY, listOf(GoogleHealthDataType.ACTIVE_MINUTES)),
        Spec("sedentary", Kind.INTERVAL, 7 * DAY, listOf(GoogleHealthDataType.SEDENTARY_PERIOD)),
        Spec("weight", Kind.BODY, 30 * DAY, listOf(GoogleHealthDataType.WEIGHT)),
        Spec("body-fat", Kind.BODY, 30 * DAY, listOf(GoogleHealthDataType.BODY_FAT)),
    )

    override val streams: List<SourceStream> = specs.map { it.stream }

    private val pointsRead = AtomicLong()
    private val clientMalformed = AtomicLong()
    private val mapperMalformed = AtomicLong()
    private val implausible = AtomicLong()
    private val ignored = AtomicLong()

    /** Running totals since this object was created; counts only. */
    val stats: GoogleHealthSourceStats
        get() = GoogleHealthSourceStats(pointsRead.get(), clientMalformed.get(), mapperMalformed.get(), implausible.get(), ignored.get())

    override suspend fun availability(): SourceAvailability = when (val n = network()) {
        GoogleHealthNetwork.NotConfigured -> SourceAvailability.Unavailable(SourceAvailability.Reason.NO_CLIENT_ID)
        is GoogleHealthNetwork.Ready -> when (n.authState.first()) {
            AuthState.SignedOut -> SourceAvailability.NeedsAction(SourceAvailability.Reason.NOT_SIGNED_IN)
            is AuthState.NeedsReauth -> SourceAvailability.NeedsAction(SourceAvailability.Reason.SIGN_IN_EXPIRED)
            is AuthState.SignedIn -> SourceAvailability.Ready
        }
    }

    override suspend fun pull(stream: SourceStream, fromMillis: Long, toMillis: Long, emit: suspend (HealthBatch) -> Unit) {
        val spec = specs.firstOrNull { it.name == stream.name }
            ?: throw IllegalArgumentException("Unknown Google Health stream")
        if (toMillis <= fromMillis) return
        require(toMillis - fromMillis <= spec.windowMillis) { "Window larger than the stream allows" }
        val ready = network() as? GoogleHealthNetwork.Ready ?: throw SourceAuthExpiredException()
        val z = zone()
        val run = Run(ready.client, spec, z, GoogleHealthMapper(z), emit)
        when (spec.kind) {
            Kind.HEART_RATE -> run.heartRate(fromMillis, toMillis)
            Kind.SLEEP -> run.sleep(fromMillis, toMillis)
            Kind.HRV_SLEEP -> run.hrvSleep(fromMillis, toMillis)
            Kind.EXERCISE -> run.exercise(fromMillis, toMillis)
            Kind.DAILY -> run.daily(fromMillis, toMillis)
            Kind.VO2 -> run.vo2(fromMillis, toMillis)
            Kind.BODY -> run.body(fromMillis, toMillis)
            Kind.INTERVAL -> run.interval(fromMillis, toMillis)
            Kind.CALORIES -> run.calories(fromMillis, toMillis)
        }
    }

    // --- One pull ---------------------------------------------------------------------------------

    private inner class Run(
        val client: GoogleHealthApiClient,
        val spec: Spec,
        val zone: ZoneId,
        val mapper: GoogleHealthMapper,
        val emit: suspend (HealthBatch) -> Unit,
    ) {
        private val google = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API

        suspend fun heartRate(from: Long, to: Long) {
            val seen = HashSet<Long>()
            // Band only: the default `all-sources` would average heart rate from the phone or from
            // Health Connect into the band's minutes.
            read(GoogleHealthDataType.HEART_RATE, filter(GoogleHealthDataType.HEART_RATE, from, to), reconcile = false, family = DataSourceFamily.GOOGLE_WEARABLES) { page ->
                val m = mapper.heartRate(page, from, to, seen)
                count(m.malformed, m.implausible, m.ignored)
                send(heartRate = m.items)
            }
        }

        suspend fun sleep(from: Long, to: Long) {
            val type = GoogleHealthDataType.SLEEP
            read(type, filter(type, from, to), reconcile = false) { page ->
                val m = mapper.sleeps(page)
                count(m.malformed, m.implausible, m.ignored)
                send(sleeps = m.items)
            }
        }

        /**
         * Sleep-stage HRV (`HRV_SLEEP_SAMPLES`). Both the night's stages and its HRV samples are needed, so this
         * stream reads the main sleeps ending in [from, to) (no `dataSourceFamily`: `sleep` does not support it)
         * and then the `heart-rate-variability` samples of each night (band only), and lets the mapper keep
         * only samples inside asleep stages. A failure here never touches the `sleep` stream. Naps are skipped;
         * when several non-nap sessions end on one day the longest one is used.
         */
        suspend fun hrvSleep(from: Long, to: Long) {
            val sleepType = GoogleHealthDataType.SLEEP
            val sessions = ArrayList<SleepObservation>()
            read(sleepType, filter(sleepType, from, to), reconcile = false) { page ->
                val m = mapper.sleeps(page)
                count(m.malformed, m.implausible, m.ignored)
                sessions += m.items
            }
            val nights = sessions
                .filter { it.isNap != true && it.stages.isNotEmpty() && it.endEpochMillis >= from && it.endEpochMillis < to }
                .groupBy { Instant.ofEpochMilli(it.endEpochMillis).atOffset(java.time.ZoneOffset.ofTotalSeconds(it.endZoneOffsetSeconds)).toLocalDate() }
                .values.map { day -> day.maxBy { it.endEpochMillis - it.startEpochMillis } }
            val type = GoogleHealthDataType.HEART_RATE_VARIABILITY
            for (night in nights) {
                val points = ArrayList<DataPoint>()
                read(type, filter(type, night.startEpochMillis, night.endEpochMillis), reconcile = false, family = DataSourceFamily.GOOGLE_WEARABLES) { page -> points += page }
                val m = mapper.hrvDuringSleep(night, points)
                count(m.malformed, m.implausible, m.ignored)
                send(daily = m.items)
            }
        }

        suspend fun exercise(from: Long, to: Long) {
            val type = GoogleHealthDataType.EXERCISE
            read(type, filter(type, from, to), reconcile = false) { page ->
                val m = mapper.workouts(page, from, to)
                count(m.malformed, m.implausible, m.ignored)
                send(workouts = m.items)
            }
        }

        suspend fun daily(from: Long, to: Long) {
            val type = spec.types.single()
            read(type, filter(type, from, to), reconcile = false) { page ->
                val m = mapper.daily(type, page)
                count(m.malformed, m.implausible, m.ignored)
                send(daily = m.items)
            }
        }

        /** `daily-vo2-max`: rows the API marks `estimated` are a model output and are labelled ESTIMATED, not measured. */
        suspend fun vo2(from: Long, to: Long) {
            val type = spec.types.single()
            read(type, filter(type, from, to), reconcile = false) { page ->
                val m = mapper.dailyVo2Max(page)
                count(m.malformed, m.implausible, m.ignored)
                send(daily = m.measured)
                send(daily = m.estimated, provenance = DataProvenance.ESTIMATED)
            }
        }

        suspend fun body(from: Long, to: Long) {
            val type = spec.types.single()
            read(type, filter(type, from, to), reconcile = false) { page ->
                val m = mapper.body(type, page, from, to)
                count(m.malformed, m.implausible, m.ignored)
                send(samples = m.measured)
                send(samples = m.manual, provenance = DataProvenance.USER_REPORTED)
            }
        }

        /** Whole civil days covering [from, to), with the day range and the read range widened by a zone margin. */
        private fun dayRange(from: Long, to: Long): Triple<Long, Long, Pair<Long, Long>> {
            val first = Instant.ofEpochMilli(from).atZone(zone).toLocalDate()
            val last = Instant.ofEpochMilli(to - 1).atZone(zone).toLocalDate()
            val readFrom = first.atStartOfDay(zone).toInstant().toEpochMilli() - MARGIN
            val readTo = last.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli() + MARGIN
            return Triple(first.toEpochDay(), last.toEpochDay(), readFrom to readTo)
        }

        /** Collects every page of [type] (reconciled) for the widened day range. Duplicates are removed by the mapper. */
        private suspend fun collectDays(type: GoogleHealthDataType, readFrom: Long, readTo: Long): List<DataPoint> {
            val all = ArrayList<DataPoint>()
            read(type, filter(type, readFrom, readTo), reconcile = true) { page -> all += page }
            return all
        }

        suspend fun interval(from: Long, to: Long) {
            val type = spec.types.single()
            val (firstDay, lastDay, range) = dayRange(from, to)
            val points = collectDays(type, range.first, range.second)
            val m = mapper.dailyTotals(type, points, firstDay, lastDay)
            count(m.malformed, m.implausible, m.ignored)
            send(daily = m.items)
        }

        suspend fun calories(from: Long, to: Long) {
            val (firstDay, lastDay, range) = dayRange(from, to)
            val active = collectDays(GoogleHealthDataType.ACTIVE_ENERGY_BURNED, range.first, range.second)
            val basal = collectDays(GoogleHealthDataType.BASAL_ENERGY_BURNED, range.first, range.second)
            val m = mapper.calories(active, basal, firstDay, lastDay)
            count(m.malformed, m.implausible, m.ignored)
            send(daily = m.items)
        }

        private fun filter(type: GoogleHealthDataType, from: Long, to: Long): String =
            GoogleHealthFilter.timeRange(type, Instant.ofEpochMilli(from), Instant.ofEpochMilli(to), zone)

        private fun count(malformed: Int, implausibleCount: Int, ignoredCount: Int) {
            mapperMalformed.addAndGet(malformed.toLong())
            implausible.addAndGet(implausibleCount.toLong())
            ignored.addAndGet(ignoredCount.toLong())
        }

        /** Reads every page; maps failures to the exceptions the orchestrator understands. */
        private suspend fun read(
            type: GoogleHealthDataType,
            filter: String,
            reconcile: Boolean,
            family: DataSourceFamily? = null,
            onPage: suspend (List<DataPoint>) -> Unit,
        ) {
            val request = ListRequest(
                dataType = type,
                filter = filter,
                pageSize = type.maxPageSize,
                reconcile = reconcile,
                dataSourceFamily = family,
                priority = priority(),
            )
            when (val r = client.forEachPage(request) { page ->
                pointsRead.addAndGet(page.dataPoints.size.toLong())
                onPage(page.dataPoints)
            }) {
                is ApiResult.Success -> clientMalformed.addAndGet(r.value.malformedDropped.toLong())
                ApiResult.NoData -> Unit // 404 or empty: nothing recorded in this window, which is complete
                is ApiResult.Failure -> fail(r.error)
            }
        }

        private fun fail(error: GoogleHealthError) {
            when (error) {
                is GoogleHealthError.AuthExpired -> throw SourceAuthExpiredException()
                is GoogleHealthError.PermissionDenied ->
                    throw SourcePermissionException(spec.name, "Google Health scope missing" + (error.missingScope?.let { " (${it.substringAfterLast('/')})" } ?: ""))
                is GoogleHealthError.RateLimited -> throw SourceRateLimitedException(error.retryAfterMillis)
                is GoogleHealthError.ServerError -> throw GoogleHealthServerException(error.httpCode)
                is GoogleHealthError.Network -> throw GoogleHealthNetworkException()
                is GoogleHealthError.BadRequest -> throw GoogleHealthRequestException(error.httpCode)
                is GoogleHealthError.Unexpected -> throw GoogleHealthRequestException(error.httpCode)
                GoogleHealthError.NotConfigured -> throw SourceAuthExpiredException()
                is GoogleHealthError.ParseFailure -> {
                    // Every point of the answer was malformed: counted and skipped. A body that is not
                    // readable at all says nothing about the window, so that one is not "complete".
                    if (error.itemsParsed == 0 && error.itemsDropped > 0) clientMalformed.addAndGet(error.itemsDropped.toLong())
                    else throw GoogleHealthParseException()
                }
            }
        }

        /** Hands rows over in batches of at most [MAX_ROWS] per kind. */
        private suspend fun send(
            heartRate: List<HeartRatePoint> = emptyList(),
            daily: List<DailyObservation> = emptyList(),
            samples: List<SampleObservation> = emptyList(),
            sleeps: List<SleepObservation> = emptyList(),
            workouts: List<WorkoutObservation> = emptyList(),
            provenance: DataProvenance = google,
        ) {
            for (c in heartRate.chunked(MAX_ROWS)) emit(HealthBatch(provenance, heartRate = c))
            for (c in daily.chunked(MAX_ROWS)) emit(HealthBatch(provenance, daily = c))
            for (c in samples.chunked(MAX_ROWS)) emit(HealthBatch(provenance, samples = c))
            for (c in sleeps.chunked(MAX_ROWS)) emit(HealthBatch(provenance, sleeps = c))
            for (c in workouts.chunked(MAX_ROWS)) emit(HealthBatch(provenance, workouts = c))
        }
    }

    companion object {
        private const val HOUR = 60L * 60 * 1000
        private const val DAY = 24 * HOUR

        /** Margin around whole-day reads so a record with another zone offset still lands on its own day. */
        private const val MARGIN = 14 * HOUR

        /** Largest batch handed to the ingestor (matches the ingestor's transaction size). */
        const val MAX_ROWS = 2_500
    }
}
