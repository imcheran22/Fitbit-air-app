package app.fitdash.health

import android.content.Context
import android.util.Log
import android.content.pm.PackageManager
import android.os.Build
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.aggregate.AggregateMetric
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.HeightRecord
import androidx.health.connect.client.records.HydrationRecord
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.OxygenSaturationRecord
import androidx.health.connect.client.records.PowerRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RespiratoryRateRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SkinTemperatureRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.SpeedRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.metadata.Device
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.request.AggregateGroupByDurationRequest
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.health.connect.client.units.Length
import androidx.health.connect.client.units.Mass
import androidx.health.connect.client.units.Volume
import app.fitdash.BuildConfig
import app.fitdash.metrics.Tuning
import app.fitdash.metrics.overlapFraction
import app.fitdash.settings.NutrientKind
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.Period
import java.time.ZoneId
import java.time.ZonedDateTime
import kotlin.coroutines.cancellation.CancellationException
import kotlin.reflect.KClass

const val HISTORY_PERMISSION = HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY
const val BACKGROUND_PERMISSION = HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND

// Large, high-frequency types only ever read for the last 30 days, even with the history permission.
private val SHORT_WINDOW_TYPES: Set<KClass<out Record>> = setOf(HeartRateRecord::class, PowerRecord::class, SpeedRecord::class)

data class NudgeInputs(val waterLiters: Double, val stepsLastHour: Long, val latestSteps: Instant?)

class HealthReader(private val context: Context) : HealthSource {
    private val client by lazy { HealthConnectClient.getOrCreate(context) }

    private val declared: Set<String> = run {
        val pm = context.packageManager
        val info = if (Build.VERSION.SDK_INT >= 33) {
            pm.getPackageInfo(context.packageName, PackageManager.PackageInfoFlags.of(PackageManager.GET_PERMISSIONS.toLong()))
        } else {
            @Suppress("DEPRECATION")
            pm.getPackageInfo(context.packageName, PackageManager.GET_PERMISSIONS)
        }
        info.requestedPermissions.orEmpty().toSet()
    }

    private val types = ALL_TYPES.filter { HealthPermission.getReadPermission(it.type) in declared }

    private val writeWater = HealthPermission.getWritePermission(HydrationRecord::class)
    private val writeHeight = HealthPermission.getWritePermission(HeightRecord::class)
    private val writeSteps = HealthPermission.getWritePermission(StepsRecord::class)
    private val writeSleep = HealthPermission.getWritePermission(SleepSessionRecord::class)
    private val writeNutrition = HealthPermission.getWritePermission(NutritionRecord::class)
    private val history = HISTORY_PERMISSION.takeIf { it in declared }

    override val allPermissions: Set<String> =
        types.map { HealthPermission.getReadPermission(it.type) }.toSet() + writeWater + writeHeight + writeSteps + writeSleep + listOfNotNull(history) +
            listOfNotNull(writeNutrition.takeIf { BuildConfig.FLAVOR != "play" })

    override val historyPermission: String? get() = history

    override suspend fun backgroundPermission(): String? {
        if (BACKGROUND_PERMISSION !in declared) return null
        val status = runCatching { client.features.getFeatureStatus(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND) }.getOrNull()
        return BACKGROUND_PERMISSION.takeIf { status == HealthConnectFeatures.FEATURE_STATUS_AVAILABLE }
    }

    override fun availability() = when (HealthConnectClient.getSdkStatus(context)) {
        HealthConnectClient.SDK_AVAILABLE -> Availability.AVAILABLE
        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> Availability.NEEDS_UPDATE
        else -> Availability.NOT_INSTALLED
    }

    override suspend fun grantedPermissions(): Set<String> = client.permissionController.getGrantedPermissions()

    override suspend fun read(now: ZonedDateTime, since: Instant?, onProgress: (ReadProgress) -> Unit): HealthSnapshot = withContext(Dispatchers.Default) {
        val granted = grantedPermissions()
        fun can(type: KClass<out Record>) = HealthPermission.getReadPermission(type) in granted

        val windowDays = if (history != null && history in granted) Tuning.HISTORY_DAYS else Tuning.BASELINE_DAYS
        val longStart = now.toLocalDate().minusDays(windowDays).atStartOfDay(now.zone)
        val shortStart = now.toLocalDate().minusDays(Tuning.BASELINE_DAYS).atStartOfDay(now.zone)
        fun from(start: ZonedDateTime) = maxOf(start.toInstant(), since ?: start.toInstant())
        val longRange = TimeRangeFilter.between(from(longStart), now.toInstant())
        val shortRange = TimeRangeFilter.between(from(shortStart), now.toInstant())
        val longLocal = TimeRangeFilter.between(longStart.toLocalDateTime(), now.toLocalDateTime())
        val shortLocal = TimeRangeFilter.between(shortStart.toLocalDateTime(), now.toLocalDateTime())

        // Every type is read concurrently; Health Connect serves them in parallel and this is where the time goes.
        val done = AtomicInteger()
        val lists: Map<KClass<out Record>, List<Record>> = coroutineScope {
            types.map { info ->
                async {
                    val range = if (info.type in SHORT_WINDOW_TYPES) shortRange else longRange
                    val list = if (can(info.type)) readAllOrEmpty(info.type, range) else emptyList()
                    // Count and report together so the counts arrive in order.
                    synchronized(done) { onProgress(ReadProgress(done.incrementAndGet(), types.size, info.label)) }
                    info.type to list
                }
            }.awaitAll().toMap()
        }
        val records: Map<KClass<out Record>, List<Record>> = lists
        val sources = types.map { info ->
            val list = lists.getValue(info.type)
            SourceStatus(info.label, can(info.type), list.isNotEmpty(), list.map { it.metadata.dataOrigin.packageName }.toSet())
        }

        val hourly = if (can(StepsRecord::class)) orEmptyList("hourly steps") {
            client.aggregateGroupByDuration(
                AggregateGroupByDurationRequest(
                    metrics = setOf(StepsRecord.COUNT_TOTAL),
                    timeRangeFilter = shortLocal,
                    timeRangeSlicer = Duration.ofHours(1),
                ),
            ).map { HourBucket(it.startTime, it.result[StepsRecord.COUNT_TOTAL] ?: 0L) }
        } else emptyList()

        val metrics = buildSet<AggregateMetric<*>> {
            if (can(StepsRecord::class)) add(StepsRecord.COUNT_TOTAL)
            if (can(DistanceRecord::class)) add(DistanceRecord.DISTANCE_TOTAL)
            if (can(TotalCaloriesBurnedRecord::class)) add(TotalCaloriesBurnedRecord.ENERGY_TOTAL)
        }
        val daily = if (metrics.isEmpty()) emptyList() else orEmptyList("daily activity") {
            client.aggregateGroupByPeriod(
                AggregateGroupByPeriodRequest(metrics = metrics, timeRangeFilter = longLocal, timeRangeSlicer = Period.ofDays(1)),
            ).map {
                DayActivity(
                    date = it.startTime.toLocalDate(),
                    steps = it.result[StepsRecord.COUNT_TOTAL] ?: 0L,
                    distanceMeters = it.result[DistanceRecord.DISTANCE_TOTAL]?.inMeters ?: 0.0,
                    kcal = it.result[TotalCaloriesBurnedRecord.ENERGY_TOTAL]?.inKilocalories ?: 0.0,
                )
            }.filter { it.steps > 0 || it.distanceMeters > 0 || it.kcal > 0 }
        }

        val totals = GENERIC_TYPES.filter { it.dailyTotal != null && can(it.type) }
        val dailyTotals = if (totals.isEmpty()) emptyList() else orEmptyList("daily totals") {
            client.aggregateGroupByPeriod(
                AggregateGroupByPeriodRequest(
                    metrics = totals.map { it.dailyTotal!!.metric }.toSet(),
                    timeRangeFilter = longLocal,
                    timeRangeSlicer = Period.ofDays(1),
                ),
            )
        }

        val waterDaily = if (can(HydrationRecord::class)) orEmptyMap("water") {
            client.aggregateGroupByPeriod(
                AggregateGroupByPeriodRequest(
                    metrics = setOf(HydrationRecord.VOLUME_TOTAL),
                    timeRangeFilter = TimeRangeFilter.between(longStart.toLocalDateTime(), now.toLocalDate().plusDays(1).atStartOfDay()),
                    timeRangeSlicer = Period.ofDays(1),
                ),
            ).mapNotNull { day -> day.result[HydrationRecord.VOLUME_TOTAL]?.let { day.startTime.toLocalDate() to it.inLiters } }.toMap()
        } else emptyMap()

        val generic = GENERIC_TYPES.mapNotNull { g ->
            val total = g.dailyTotal
            val shown = if (total != null) {
                dailyTotals.mapNotNull { day ->
                    total.value(day.result)?.let { Sample(day.startTime.atZone(now.zone).toInstant(), it) }
                }
            } else records[g.type].orEmpty().mapNotNull(g::sample).sortedBy { it.time }
            val second = if (total != null) emptyList() else records[g.type].orEmpty().mapNotNull(g::second).sortedBy { it.time }
            if (shown.isEmpty()) null else GenericSeries(g.label, g.unit, shown, second)
        }

        val heartRate = records.of<HeartRateRecord>().flatMap { r -> r.samples.map { Sample(it.time, it.beatsPerMinute.toDouble()) } }

        HealthSnapshot(
            sleep = records.of<SleepSessionRecord>().map { s ->
                SleepSession(s.startTime, s.endTime, s.stages.mapNotNull { st ->
                    stageType(st.stage)?.let { SleepStage(st.startTime, st.endTime, it) }
                })
            },
            hrv = records.of<HeartRateVariabilityRmssdRecord>().map { Sample(it.time, it.heartRateVariabilityMillis) },
            restingHr = records.of<RestingHeartRateRecord>().map { Sample(it.time, it.beatsPerMinute.toDouble()) },
            heartRate = heartRate,
            spo2 = records.of<OxygenSaturationRecord>().map { Sample(it.time, it.percentage.value) },
            respiratoryRate = records.of<RespiratoryRateRecord>().map { Sample(it.time, it.rate) },
            skinTempDelta = records.of<SkinTemperatureRecord>().flatMap { r -> r.deltas.map { Sample(it.time, it.delta.inCelsius) } },
            hourlySteps = hourly,
            dailyActivity = daily,
            workouts = workouts(records, heartRate),
            generic = generic,
            sources = sources,
            waterDaily = waterDaily,
            heightMeters = if (can(HeightRecord::class)) orNull("height") { latest<HeightRecord>(now)?.height?.inMeters } else null,
            weightKg = if (can(WeightRecord::class)) orNull("weight") { latest<WeightRecord>(now)?.weight?.inKilograms } else null,
            windowDays = windowDays,
        )
    }

    // Distance, calories and steps are the parts of already-read records that fall inside the session,
    // so a session costs no extra Health Connect call.
    private fun workouts(records: Map<KClass<out Record>, List<Record>>, heartRate: List<Sample>): List<Workout> {
        val distance = records.of<DistanceRecord>()
        val active = records.of<ActiveCaloriesBurnedRecord>()
        val total = records.of<TotalCaloriesBurnedRecord>()
        val steps = records.of<StepsRecord>()
        val hr = heartRate.sortedBy { it.time }
        return records.of<ExerciseSessionRecord>()
            .filter { Duration.between(it.startTime, it.endTime) >= Duration.ofMinutes(Tuning.MIN_WORKOUT_MINUTES) }
            .sortedBy { it.startTime }
            .map { s ->
                fun <T : Record> sum(list: List<T>, start: (T) -> Instant, end: (T) -> Instant, value: (T) -> Double): Double? =
                    list.sumOf { overlapFraction(start(it), end(it), s.startTime, s.endTime) * value(it) }.takeIf { it > 0 }
                val inSession = hr.filter { !it.time.isBefore(s.startTime) && !it.time.isAfter(s.endTime) }
                val kcal = sum(active, { it.startTime }, { it.endTime }) { it.energy.inKilocalories }
                    ?: sum(total, { it.startTime }, { it.endTime }) { it.energy.inKilocalories }
                Workout(
                    start = s.startTime,
                    end = s.endTime,
                    type = s.exerciseType,
                    title = s.title?.trim()?.takeIf { it.isNotEmpty() },
                    distanceMeters = sum(distance, { it.startTime }, { it.endTime }) { it.distance.inMeters },
                    kcal = kcal,
                    steps = sum(steps, { it.startTime }, { it.endTime }) { it.count.toDouble() }?.let { Math.round(it) },
                    avgHr = inSession.takeIf { it.size >= Tuning.MIN_WORKOUT_HR_SAMPLES }?.map { it.value }?.average(),
                    maxHr = inSession.takeIf { it.size >= Tuning.MIN_WORKOUT_HR_SAMPLES }?.maxOf { it.value },
                    app = s.metadata.dataOrigin.packageName,
                )
            }
    }

    // A small live read for the reminder worker: today's water, the last hour's steps, and when steps last came in.
    suspend fun nudgeInputs(now: ZonedDateTime): NudgeInputs {
        val dayStart = now.toLocalDate().atStartOfDay(now.zone).toInstant()
        val water = orNull("water today") {
            client.aggregate(AggregateRequest(setOf(HydrationRecord.VOLUME_TOTAL), TimeRangeFilter.between(dayStart, now.toInstant())))[HydrationRecord.VOLUME_TOTAL]?.inLiters
        } ?: 0.0
        val steps = orEmptyList("recent steps") {
            client.readRecords(ReadRecordsRequest(StepsRecord::class, TimeRangeFilter.between(now.minusHours(3).toInstant(), now.toInstant()))).records
        }
        val hourAgo = now.minusHours(1).toInstant()
        return NudgeInputs(water, steps.filter { it.endTime > hourAgo }.sumOf { it.count }, steps.maxOfOrNull { it.endTime })
    }

    override suspend fun addWater(liters: Double, at: Instant): String? {
        if (writeWater !in grantedPermissions()) return null
        val offset = ZoneId.systemDefault().rules.getOffset(at)
        val record = HydrationRecord(at, offset, at.plusSeconds(1), offset, Volume.liters(liters), Metadata.manualEntry())
        return try {
            client.insertRecords(listOf(record)).recordIdsList.first()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }
    }

    override suspend fun deleteWater(id: String): Boolean = try {
        client.deleteRecords(HydrationRecord::class, listOf(id), emptyList())
        true
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        false
    }

    override suspend fun addSteps(start: Instant, end: Instant, count: Long): Boolean {
        if (writeSteps !in grantedPermissions()) return false
        val zone = ZoneId.systemDefault().rules
        val record = StepsRecord(start, zone.getOffset(start), end, zone.getOffset(end), count, Metadata.autoRecorded(Device(type = Device.TYPE_PHONE)))
        return try {
            client.insertRecords(listOf(record))
            true
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            false
        }
    }

    override suspend fun addSleep(start: Instant, end: Instant): String? {
        if (writeSleep !in grantedPermissions()) return null
        val zone = ZoneId.systemDefault().rules
        val record = SleepSessionRecord(
            startTime = start, startZoneOffset = zone.getOffset(start), endTime = end, endZoneOffset = zone.getOffset(end),
            metadata = Metadata.manualEntry(),
        )
        return try {
            client.insertRecords(listOf(record)).recordIdsList.first()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }
    }

    override suspend fun deleteSleep(id: String): Boolean = try {
        client.deleteRecords(SleepSessionRecord::class, listOf(id), emptyList())
        true
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        false
    }

    override suspend fun setHeight(meters: Double, at: Instant): Boolean {
        if (writeHeight !in grantedPermissions()) return false
        val offset = ZoneId.systemDefault().rules.getOffset(at)
        return try {
            client.insertRecords(listOf(HeightRecord(at, offset, Length.meters(meters), Metadata.manualEntry())))
            true
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            false
        }
    }

    override suspend fun addNutrient(kind: NutrientKind, amount: Double, at: Instant): String? {
        if (writeNutrition !in grantedPermissions()) return null
        val offset = ZoneId.systemDefault().rules.getOffset(at)
        val record = NutritionRecord(
            startTime = at, startZoneOffset = offset, endTime = at.plusSeconds(1), endZoneOffset = offset,
            protein = Mass.grams(amount).takeIf { kind == NutrientKind.PROTEIN },
            caffeine = Mass.milligrams(amount).takeIf { kind == NutrientKind.CAFFEINE },
            metadata = Metadata.manualEntry(),
        )
        return try {
            client.insertRecords(listOf(record)).recordIdsList.first()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }
    }

    override suspend fun deleteNutrient(id: String): Boolean = try {
        client.deleteRecords(NutritionRecord::class, listOf(id), emptyList())
        true
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        false
    }

    private suspend inline fun <reified T : Record> latest(now: ZonedDateTime): T? =
        client.readRecords(ReadRecordsRequest(T::class, TimeRangeFilter.before(now.toInstant()), ascendingOrder = false, pageSize = 1)).records.firstOrNull()

    // One call failing (a type this device does not support, or Health Connect deciding we left the foreground mid-read)
    // must not take the whole snapshot down with it.
    private suspend fun <T> orNull(what: String, block: suspend () -> T?): T? = try {
        block()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        Log.w("fitdash", "Could not read $what", e)
        null
    }

    private suspend fun <T> orEmptyList(what: String, block: suspend () -> List<T>): List<T> = orNull(what, block) ?: emptyList()

    private suspend fun <K, V> orEmptyMap(what: String, block: suspend () -> Map<K, V>): Map<K, V> = orNull(what, block) ?: emptyMap()

    // One type failing (e.g. skin temperature unsupported on this device) must not hide the rest.
    private suspend fun readAllOrEmpty(type: KClass<out Record>, range: TimeRangeFilter): List<Record> = try {
        val out = mutableListOf<Record>()
        var token: String? = null
        do {
            @Suppress("UNCHECKED_CAST")
            val res = client.readRecords(
                ReadRecordsRequest(recordType = type as KClass<Record>, timeRangeFilter = range, pageSize = 5000, pageToken = token),
            )
            out += res.records
            token = res.pageToken
        } while (token != null)
        out
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        Log.w("fitdash", "Could not read ${type.simpleName}", e)
        emptyList()
    }
}

private inline fun <reified T : Record> Map<KClass<out Record>, List<Record>>.of(): List<T> =
    this[T::class].orEmpty().filterIsInstance<T>()

private fun stageType(stage: Int): StageType? = when (stage) {
    SleepSessionRecord.STAGE_TYPE_AWAKE,
    SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED,
    SleepSessionRecord.STAGE_TYPE_OUT_OF_BED -> StageType.AWAKE
    SleepSessionRecord.STAGE_TYPE_LIGHT -> StageType.LIGHT
    SleepSessionRecord.STAGE_TYPE_DEEP -> StageType.DEEP
    SleepSessionRecord.STAGE_TYPE_REM -> StageType.REM
    SleepSessionRecord.STAGE_TYPE_SLEEPING -> StageType.SLEEPING
    else -> null
}
