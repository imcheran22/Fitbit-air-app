package com.apex.athlete.core.data.healthconnect

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.changes.DeletionChange
import androidx.health.connect.client.changes.UpsertionChange
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.FloorsClimbedRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.OxygenSaturationRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RespiratoryRateRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SkinTemperatureRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.Vo2MaxRecord
import androidx.health.connect.client.request.ChangesTokenRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Instant
import kotlin.reflect.KClass

/**
 * The only place that talks to the Health Connect SDK. Everything it returns is an SDK-free
 * intermediate record, so the source and mapper above it are plain JVM code and a test can stand
 * in a fake. It only reads; it exposes no write, delete or permission-revoking call.
 *
 * A revoked permission surfaces as [SecurityException] from the read calls; [HealthConnectSource]
 * maps that to a permission error.
 */
interface HealthConnectDataSource {
    fun sdkStatus(): HcSdkStatus

    /** False when the platform does not report the feature (or the SDK is unavailable). Never throws. */
    fun isFeatureAvailable(feature: HcFeature): Boolean

    suspend fun grantedPermissions(): Set<String>

    /** One page of [family] records overlapping [fromMillis, toMillis). Pass the previous page's token to continue. */
    suspend fun readPage(family: HcFamily, fromMillis: Long, toMillis: Long, pageToken: String?): HcPage

    /** A token that reports changes to [families] from now on. */
    suspend fun newChangesToken(families: Set<HcFamily>): String

    suspend fun readChanges(token: String): HcChangesPage
}

class SdkHealthConnectDataSource(private val context: Context) : HealthConnectDataSource {

    private val client: HealthConnectClient by lazy { HealthConnectClient.getOrCreate(context) }

    override fun sdkStatus(): HcSdkStatus = when (HealthConnectClient.getSdkStatus(context)) {
        HealthConnectClient.SDK_AVAILABLE -> HcSdkStatus.AVAILABLE
        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> HcSdkStatus.UPDATE_REQUIRED
        else -> HcSdkStatus.UNAVAILABLE
    }

    override fun isFeatureAvailable(feature: HcFeature): Boolean = try {
        if (sdkStatus() != HcSdkStatus.AVAILABLE) {
            false
        } else {
            val id = when (feature) {
                HcFeature.SKIN_TEMPERATURE -> HealthConnectFeatures.FEATURE_SKIN_TEMPERATURE
                HcFeature.READ_HEALTH_DATA_HISTORY -> HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_HISTORY
                HcFeature.READ_HEALTH_DATA_IN_BACKGROUND -> HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND
            }
            client.features.getFeatureStatus(id) == HealthConnectFeatures.FEATURE_STATUS_AVAILABLE
        }
    } catch (_: Exception) {
        false
    }

    override suspend fun grantedPermissions(): Set<String> = client.permissionController.getGrantedPermissions()

    override suspend fun readPage(family: HcFamily, fromMillis: Long, toMillis: Long, pageToken: String?): HcPage {
        val range = TimeRangeFilter.between(Instant.ofEpochMilli(fromMillis), Instant.ofEpochMilli(toMillis))
        val response = client.readRecords(
            ReadRecordsRequest(
                recordType = readableClass(family),
                timeRangeFilter = range,
                pageSize = PAGE_SIZE,
                pageToken = pageToken,
            ),
        )
        return HcPage(response.records.mapNotNull(::convert), response.pageToken?.takeIf { it.isNotEmpty() })
    }

    override suspend fun newChangesToken(families: Set<HcFamily>): String =
        client.getChangesToken(ChangesTokenRequest(recordTypes = families.map(::recordClass).toSet()))

    override suspend fun readChanges(token: String): HcChangesPage {
        val response = client.getChanges(token)
        if (response.changesTokenExpired) {
            return HcChangesPage(emptyList(), 0, token, hasMore = false, tokenExpired = true)
        }
        val upserted = ArrayList<HcRecord>()
        var deleted = 0
        for (change in response.changes) {
            when (change) {
                is UpsertionChange -> convert(change.record)?.let(upserted::add)
                is DeletionChange -> deleted++
                else -> Unit // a change kind this SDK version does not know: ignored
            }
        }
        return HcChangesPage(upserted, deleted, response.nextChangesToken, response.hasMore, tokenExpired = false)
    }

    // --- SDK record -> intermediate record ------------------------------------------------------------

    /** `ReadRecordsRequest<T>` wants an invariant `KClass<T>`; every class returned here is a Record subclass. */
    @Suppress("UNCHECKED_CAST")
    private fun readableClass(family: HcFamily): KClass<Record> = recordClass(family) as KClass<Record>

    private fun recordClass(family: HcFamily): KClass<out Record> = when (family) {
        HcFamily.HEART_RATE -> HeartRateRecord::class
        HcFamily.RESTING_HEART_RATE -> RestingHeartRateRecord::class
        HcFamily.HRV_RMSSD -> HeartRateVariabilityRmssdRecord::class
        HcFamily.SLEEP -> SleepSessionRecord::class
        HcFamily.OXYGEN_SATURATION -> OxygenSaturationRecord::class
        HcFamily.RESPIRATORY_RATE -> RespiratoryRateRecord::class
        HcFamily.SKIN_TEMPERATURE -> SkinTemperatureRecord::class
        HcFamily.STEPS -> StepsRecord::class
        HcFamily.EXERCISE -> ExerciseSessionRecord::class
        HcFamily.TOTAL_CALORIES -> TotalCaloriesBurnedRecord::class
        HcFamily.VO2_MAX -> Vo2MaxRecord::class
        HcFamily.FLOORS -> FloorsClimbedRecord::class
        HcFamily.DISTANCE -> DistanceRecord::class
    }

    private fun convert(r: Record): HcRecord? {
        val origin = r.metadata.dataOrigin.packageName
        val id = r.metadata.id
        return when (r) {
            is HeartRateRecord -> HcHeartRateRecord(origin, r.samples.map { HcHrSample(it.time.toEpochMilli(), it.beatsPerMinute) })
            is RestingHeartRateRecord ->
                HcInstantRecord(HcFamily.RESTING_HEART_RATE, origin, r.time.toEpochMilli(), r.zoneOffset?.totalSeconds, r.beatsPerMinute.toDouble())
            is HeartRateVariabilityRmssdRecord ->
                HcInstantRecord(HcFamily.HRV_RMSSD, origin, r.time.toEpochMilli(), r.zoneOffset?.totalSeconds, r.heartRateVariabilityMillis)
            is OxygenSaturationRecord ->
                HcInstantRecord(HcFamily.OXYGEN_SATURATION, origin, r.time.toEpochMilli(), r.zoneOffset?.totalSeconds, r.percentage.value)
            is RespiratoryRateRecord ->
                HcInstantRecord(HcFamily.RESPIRATORY_RATE, origin, r.time.toEpochMilli(), r.zoneOffset?.totalSeconds, r.rate)
            is Vo2MaxRecord ->
                HcInstantRecord(HcFamily.VO2_MAX, origin, r.time.toEpochMilli(), r.zoneOffset?.totalSeconds, r.vo2MillilitersPerMinuteKilogram)
            is StepsRecord -> interval(HcFamily.STEPS, origin, r.startTime, r.endTime, r.startZoneOffset?.totalSeconds, r.endZoneOffset?.totalSeconds, r.count.toDouble())
            is TotalCaloriesBurnedRecord ->
                interval(HcFamily.TOTAL_CALORIES, origin, r.startTime, r.endTime, r.startZoneOffset?.totalSeconds, r.endZoneOffset?.totalSeconds, r.energy.inKilocalories)
            is FloorsClimbedRecord -> interval(HcFamily.FLOORS, origin, r.startTime, r.endTime, r.startZoneOffset?.totalSeconds, r.endZoneOffset?.totalSeconds, r.floors)
            is DistanceRecord -> interval(HcFamily.DISTANCE, origin, r.startTime, r.endTime, r.startZoneOffset?.totalSeconds, r.endZoneOffset?.totalSeconds, r.distance.inMeters)
            is SleepSessionRecord -> HcSleepRecord(
                id = id,
                origin = origin,
                startEpochMillis = r.startTime.toEpochMilli(),
                endEpochMillis = r.endTime.toEpochMilli(),
                startOffsetSeconds = r.startZoneOffset?.totalSeconds,
                endOffsetSeconds = r.endZoneOffset?.totalSeconds,
                stages = r.stages.map { HcSleepStage(it.startTime.toEpochMilli(), it.endTime.toEpochMilli(), it.stage) },
            )
            is ExerciseSessionRecord -> HcExerciseRecord(
                id = id,
                origin = origin,
                startEpochMillis = r.startTime.toEpochMilli(),
                endEpochMillis = r.endTime.toEpochMilli(),
                startOffsetSeconds = r.startZoneOffset?.totalSeconds,
                type = exerciseTypeName(r.exerciseType),
                title = r.title,
            )
            is SkinTemperatureRecord -> HcSkinTempRecord(
                origin = origin,
                startEpochMillis = r.startTime.toEpochMilli(),
                endEpochMillis = r.endTime.toEpochMilli(),
                startOffsetSeconds = r.startZoneOffset?.totalSeconds,
                endOffsetSeconds = r.endZoneOffset?.totalSeconds,
                baselineCelsius = r.baseline?.inCelsius,
                deltasCelsius = r.deltas.map { HcTimedValue(it.time.toEpochMilli(), it.delta.inCelsius) },
            )
            else -> null // a record kind Apex does not read (can appear in change feeds): ignored
        }
    }

    private fun interval(
        family: HcFamily,
        origin: String,
        start: Instant,
        end: Instant,
        startOffset: Int?,
        endOffset: Int?,
        value: Double,
    ) = HcIntervalRecord(family, origin, start.toEpochMilli(), end.toEpochMilli(), startOffset, endOffset, value)

    private fun exerciseTypeName(type: Int): String = when (type) {
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING -> "RUNNING"
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL -> "RUNNING_TREADMILL"
        ExerciseSessionRecord.EXERCISE_TYPE_WALKING -> "WALKING"
        ExerciseSessionRecord.EXERCISE_TYPE_HIKING -> "HIKING"
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING -> "BIKING"
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY -> "BIKING_STATIONARY"
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL -> "SWIMMING_POOL"
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER -> "SWIMMING_OPEN_WATER"
        ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING -> "STRENGTH_TRAINING"
        ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING -> "WEIGHTLIFTING"
        ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING -> "HIGH_INTENSITY_INTERVAL_TRAINING"
        ExerciseSessionRecord.EXERCISE_TYPE_YOGA -> "YOGA"
        ExerciseSessionRecord.EXERCISE_TYPE_PILATES -> "PILATES"
        ExerciseSessionRecord.EXERCISE_TYPE_ELLIPTICAL -> "ELLIPTICAL"
        ExerciseSessionRecord.EXERCISE_TYPE_ROWING -> "ROWING"
        ExerciseSessionRecord.EXERCISE_TYPE_ROWING_MACHINE -> "ROWING_MACHINE"
        ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING_MACHINE -> "STAIR_CLIMBING_MACHINE"
        ExerciseSessionRecord.EXERCISE_TYPE_STRETCHING -> "STRETCHING"
        ExerciseSessionRecord.EXERCISE_TYPE_DANCING -> "DANCING"
        else -> "OTHER_WORKOUT"
    }

    private companion object {
        const val PAGE_SIZE = 1000
    }
}
