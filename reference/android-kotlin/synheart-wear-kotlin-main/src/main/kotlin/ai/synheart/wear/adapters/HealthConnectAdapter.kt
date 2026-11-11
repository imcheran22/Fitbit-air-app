package ai.synheart.wear.adapters

import android.content.Context
import android.util.Log
import ai.synheart.wear.backfill.HealthHistoryReader
import ai.synheart.wear.backfill.OvernightPhysiologySummary
import ai.synheart.wear.backfill.SleepNightSummary
import ai.synheart.wear.models.*
import androidx.activity.result.contract.ActivityResultContract
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.*
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.InternalSerializationApi
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit

/**
 * Enhanced Health Connect adapter for Android biometric data access
 *
 * Provides comprehensive access to Health Connect data from multiple wearable devices
 * including heart rate, HRV, steps, calories, distance, exercise, and sleep data.
 *
 * Based on Google's Health Connect samples and best practices.
 *
 * @param context Android application context
 */
@OptIn(InternalSerializationApi::class)
class HealthConnectAdapter(
    private val context: Context
) : WearAdapter, HealthHistoryReader {

    override val id: String = "health_connect"

    private val TAG = "HealthConnectAdapter"
    private lateinit var healthConnectClient: HealthConnectClient

    companion object {
        /**
         * Check if Health Connect is supported and available on this device
         */
        fun getSdkStatus(context: Context): Int {
            return HealthConnectClient.getSdkStatus(context)
        }

        /**
         * Check if Health Connect is available
         */
        fun isAvailable(context: Context): Boolean {
            return getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE
        }
    }

    override suspend fun initialize() {
        healthConnectClient = HealthConnectClient.getOrCreate(context)
        Log.i(TAG, "Health Connect client initialized")
    }

    /**
     * Get all required Health Connect permissions based on requested permission types
     */
    internal fun getHealthConnectPermissions(permissions: Set<PermissionType>): Set<String> {
        return permissions.flatMap { permType ->
            when (permType) {
                PermissionType.HEART_RATE -> listOf(
                    HealthPermission.getReadPermission(HeartRateRecord::class)
                )
                PermissionType.HRV -> listOf(
                    HealthPermission.getReadPermission(HeartRateVariabilityRmssdRecord::class)
                )
                PermissionType.STEPS -> listOf(
                    HealthPermission.getReadPermission(StepsRecord::class)
                )
                PermissionType.CALORIES -> listOf(
                    HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
                    HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class)
                )
                PermissionType.DISTANCE -> listOf(
                    HealthPermission.getReadPermission(DistanceRecord::class)
                )
                PermissionType.EXERCISE -> listOf(
                    HealthPermission.getReadPermission(ExerciseSessionRecord::class),
                    HealthPermission.getReadPermission(SpeedRecord::class)
                )
                PermissionType.SLEEP -> listOf(
                    HealthPermission.getReadPermission(SleepSessionRecord::class)
                )
                PermissionType.STRESS -> listOf(
                    // Health Connect doesn't have a stress record yet
                    // We can infer stress from HRV
                    HealthPermission.getReadPermission(HeartRateVariabilityRmssdRecord::class)
                )
            }
        }.toSet()
    }

    /**
     * Get permission request contract for Activity-based permission flow
     */
    internal fun getPermissionRequestContract(): ActivityResultContract<Set<String>, Set<String>> {
        return PermissionController.createRequestPermissionResultContract()
    }

    /**
     * Check if all specified permissions are already granted
     */
    suspend fun hasAllPermissions(permissions: Set<String>): Boolean {
        return try {
            healthConnectClient.permissionController.getGrantedPermissions()
                .containsAll(permissions)
        } catch (e: Exception) {
            Log.e(TAG, "Error checking permissions: ${e.message}", e)
            false
        }
    }

    override suspend fun requestPermissions(
        permissions: Set<PermissionType>
    ): Map<PermissionType, Boolean> {
        // Convert to Health Connect permissions
        val healthPermissions = getHealthConnectPermissions(permissions)

        // Note: Actual permission request requires Activity context
        // This method should be called from an Activity using the contract
        Log.i(TAG, "Permission request initiated for: $permissions")
        Log.i(TAG, "Health Connect permissions required: $healthPermissions")

        // Check current status
        return try {
            val granted = healthConnectClient.permissionController.getGrantedPermissions()
            permissions.associateWith { permType ->
                val perms = getHealthConnectPermissions(setOf(permType))
                perms.all { it in granted }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error checking permission status: ${e.message}", e)
            permissions.associateWith { false }
        }
    }

    override fun getPermissionStatus(): Map<PermissionType, Boolean> {
        return try {
            val granted = runBlocking {
                healthConnectClient.permissionController.getGrantedPermissions()
            }
            val allPermissions = setOf(
                PermissionType.HEART_RATE,
                PermissionType.HRV,
                PermissionType.STEPS,
                PermissionType.CALORIES,
                PermissionType.DISTANCE,
                PermissionType.EXERCISE,
                PermissionType.SLEEP
            )
            allPermissions.associateWith { permType ->
                val perms = getHealthConnectPermissions(setOf(permType))
                perms.all { it in granted }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error getting permission status: ${e.message}", e)
            emptyMap()
        }
    }

    override suspend fun readSnapshot(isRealTime: Boolean): WearMetrics {
        val now = Instant.now()
        val lookbackTime = if (isRealTime) 1L else 60L
        val timeRange = TimeRangeFilter.between(
            now.minus(lookbackTime, ChronoUnit.MINUTES),
            now
        )

        val builder = WearMetrics.builder()
            .timestamp(System.currentTimeMillis())
            .deviceId("healthconnect_${context.packageName.hashCode()}")
            .source("health_connect")

        // Read heart rate
        try {
            val hrRecords = readHeartRate(timeRange)
            if (hrRecords.isNotEmpty()) {
                val allSamples = hrRecords.flatMap { it.samples }
                if (allSamples.isNotEmpty()) {
                    val avgHr = allSamples.map { it.beatsPerMinute }.average()
                    builder.metric(MetricType.HR, avgHr)
                    Log.d(TAG, "Heart rate: ${allSamples.size} samples")
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to read heart rate: ${e.message}")
        }

        // Read HRV
        try {
            val hrvRecords = readHRV(timeRange)
            if (hrvRecords.isNotEmpty()) {
                val avgHrv = hrvRecords.mapNotNull { it.heartRateVariabilityMillis }.average()
                builder.metric(MetricType.HRV_RMSSD, avgHrv)
                Log.d(TAG, "HRV RMSSD: ${hrvRecords.size} records")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to read HRV: ${e.message}")
        }

        // Read steps using aggregation
        try {
            val stepsCount = readStepsAggregate(timeRange)
            if (stepsCount > 0) {
                builder.metric(MetricType.STEPS, stepsCount.toDouble())
                Log.d(TAG, "Steps aggregate: read OK")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to read steps: ${e.message}")
        }

        // Read calories
        try {
            val calories = readCaloriesAggregate(timeRange)
            if (calories > 0) {
                builder.metric(MetricType.CALORIES, calories)
                Log.d(TAG, "Calories aggregate: read OK")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to read calories: ${e.message}")
        }

        // Read distance
        try {
            val distance = readDistanceAggregate(timeRange)
            if (distance > 0) {
                builder.metric(MetricType.DISTANCE, distance)
                Log.d(TAG, "Distance aggregate: read OK")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to read distance: ${e.message}")
        }

        builder.metaData("synced", "true")
        builder.metaData("timeRange", "${lookbackTime}min")

        return builder.build()
    }

    /**
     * Read heart rate records
     */
    private suspend fun readHeartRate(timeRange: TimeRangeFilter): List<HeartRateRecord> {
        val request = ReadRecordsRequest(
            recordType = HeartRateRecord::class,
            timeRangeFilter = timeRange
        )
        return healthConnectClient.readRecords(request).records
    }

    /**
     * Read HRV records
     */
    private suspend fun readHRV(timeRange: TimeRangeFilter): List<HeartRateVariabilityRmssdRecord> {
        val request = ReadRecordsRequest(
            recordType = HeartRateVariabilityRmssdRecord::class,
            timeRangeFilter = timeRange
        )
        return healthConnectClient.readRecords(request).records
    }

    /**
     * Read aggregated steps count
     */
    private suspend fun readStepsAggregate(timeRange: TimeRangeFilter): Long {
        val request = AggregateRequest(
            metrics = setOf(StepsRecord.COUNT_TOTAL),
            timeRangeFilter = timeRange
        )
        val response = healthConnectClient.aggregate(request)
        return response[StepsRecord.COUNT_TOTAL] ?: 0L
    }

    /**
     * Read aggregated calories burned
     */
    private suspend fun readCaloriesAggregate(timeRange: TimeRangeFilter): Double {
        val request = AggregateRequest(
            metrics = setOf(
                TotalCaloriesBurnedRecord.ENERGY_TOTAL,
                ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL
            ),
            timeRangeFilter = timeRange
        )
        val response = healthConnectClient.aggregate(request)
        
        val total = response[TotalCaloriesBurnedRecord.ENERGY_TOTAL]?.inCalories ?: 0.0
        val active = response[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inCalories ?: 0.0

        // Return total if available, otherwise active
        return if (total > 0) total else active
    }

    /**
     * Read aggregated distance
     */
    private suspend fun readDistanceAggregate(timeRange: TimeRangeFilter): Double {
        val request = AggregateRequest(
            metrics = setOf(DistanceRecord.DISTANCE_TOTAL),
            timeRangeFilter = timeRange
        )
        val response = healthConnectClient.aggregate(request)
        return response[DistanceRecord.DISTANCE_TOTAL]?.inMeters ?: 0.0
    }

    /**
     * Read exercise sessions
     */
    private suspend fun readExerciseSessions(start: Instant, end: Instant): List<ExerciseSessionRecord> {
        val request = ReadRecordsRequest(
            recordType = ExerciseSessionRecord::class,
            timeRangeFilter = TimeRangeFilter.between(start, end)
        )
        return healthConnectClient.readRecords(request).records
    }

    /**
     * Read sleep sessions
     */
    private suspend fun readSleepSessions(start: Instant, end: Instant): List<SleepSessionRecord> {
        val request = ReadRecordsRequest(
            recordType = SleepSessionRecord::class,
            timeRangeFilter = TimeRangeFilter.between(start, end)
        )
        return healthConnectClient.readRecords(request).records
    }

    /**
     * Read sleep duration aggregate
     */
    private suspend fun readSleepDuration(start: Instant, end: Instant): Long? {
        val request = AggregateRequest(
            metrics = setOf(SleepSessionRecord.SLEEP_DURATION_TOTAL),
            timeRangeFilter = TimeRangeFilter.between(start, end)
        )
        val response = healthConnectClient.aggregate(request)
        return response[SleepSessionRecord.SLEEP_DURATION_TOTAL]?.toMillis()
    }

    /**
     * Revoke all Health Connect permissions
     */
    suspend fun revokeAllPermissions() {
        try {
            healthConnectClient.permissionController.revokeAllPermissions()
            Log.i(TAG, "All Health Connect permissions revoked")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to revoke permissions: ${e.message}", e)
            throw e
        }
    }

    override suspend fun isAvailable(): Boolean {
        return try {
            getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE
        } catch (e: Exception) {
            Log.e(TAG, "Error checking Health Connect availability: ${e.message}", e)
            false
        }
    }

    // ────────────────────────────────────────────────────────────── //
    // HealthHistoryReader — historical aggregations consumed by
    // synheart-core's HealthConnectRuntimeSink for SRM backfill.
    // ────────────────────────────────────────────────────────────── //

    /**
     * Sleep sessions across `[start, end)` bucketed by **local wake-day**
     * (the day the session ended in [zone]). Stages are summed when
     * present; absent stages mean the session contributes only to
     * `totalAsleepMinutes` (via session duration).
     *
     * Multiple sessions on the same wake-day are merged into one
     * summary (sums across sessions). Returns an empty map when the
     * platform retained nothing — Health Connect typically keeps
     * sleep records for 1–2 years.
     */
    override suspend fun fetchSleepNights(
        start: Instant,
        end: Instant,
        zone: ZoneId,
    ): Map<LocalDate, SleepNightSummary> {
        ensureClient()
        val records = readSleepSessions(start, end)

        val byDay = mutableMapOf<LocalDate, MutableList<SleepSessionRecord>>()
        for (r in records) {
            val wakeDay = r.endTime.atZone(zone).toLocalDate()
            byDay.getOrPut(wakeDay) { mutableListOf() }.add(r)
        }

        return byDay.mapValues { (_, sessions) ->
            var asleep = 0.0
            var deep: Double? = null
            var rem: Double? = null
            for (session in sessions) {
                if (session.stages.isEmpty()) {
                    asleep += minutesBetween(session.startTime, session.endTime)
                    continue
                }
                for (stage in session.stages) {
                    val mins = minutesBetween(stage.startTime, stage.endTime)
                    when (stage.stage) {
                        SleepSessionRecord.STAGE_TYPE_AWAKE,
                        SleepSessionRecord.STAGE_TYPE_OUT_OF_BED,
                        SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED -> Unit
                        SleepSessionRecord.STAGE_TYPE_DEEP -> {
                            asleep += mins
                            deep = (deep ?: 0.0) + mins
                        }
                        SleepSessionRecord.STAGE_TYPE_REM -> {
                            asleep += mins
                            rem = (rem ?: 0.0) + mins
                        }
                        else -> asleep += mins // LIGHT, SLEEPING, UNKNOWN
                    }
                }
            }
            SleepNightSummary(asleep, deep, rem)
        }
    }

    /**
     * Resting HR and HRV-RMSSD averaged over each night's sleep
     * window(s), keyed by local wake-day.
     *
     * Implementation: pull all HR / HRV samples in `[start, end)`
     * once, then for each sleep session take samples whose timestamp
     * falls inside the session window and average per wake-day.
     * Days without a sleep session are omitted (matches Flutter's
     * "overnight only" semantic).
     *
     * Health Connect's retention for HR samples is platform-defined
     * and typically much shorter than sleep retention (~30 days).
     * Expect this map to be sparser than [fetchSleepNights] for long
     * windows.
     */
    override suspend fun fetchOvernightPhysiology(
        start: Instant,
        end: Instant,
        zone: ZoneId,
    ): Map<LocalDate, OvernightPhysiologySummary> {
        ensureClient()
        val timeRange = TimeRangeFilter.between(start, end)

        val sleepSessions = readSleepSessions(start, end)
        if (sleepSessions.isEmpty()) return emptyMap()

        val hrSamples = readHeartRate(timeRange)
            .flatMap { rec -> rec.samples.map { it.time to it.beatsPerMinute.toDouble() } }
        val hrvSamples = readHRV(timeRange)
            .map { it.time to it.heartRateVariabilityMillis }

        data class Acc(
            var hrSum: Double = 0.0, var hrN: Int = 0,
            var hrvSum: Double = 0.0, var hrvN: Int = 0,
        )
        val byDay = mutableMapOf<LocalDate, Acc>()

        for (session in sleepSessions) {
            val wakeDay = session.endTime.atZone(zone).toLocalDate()
            val acc = byDay.getOrPut(wakeDay) { Acc() }
            for ((t, bpm) in hrSamples) {
                if (!t.isBefore(session.startTime) && t.isBefore(session.endTime)) {
                    acc.hrSum += bpm; acc.hrN++
                }
            }
            for ((t, rmssd) in hrvSamples) {
                if (!t.isBefore(session.startTime) && t.isBefore(session.endTime)) {
                    acc.hrvSum += rmssd; acc.hrvN++
                }
            }
        }

        return byDay.mapValues { (_, a) ->
            OvernightPhysiologySummary(
                hrvRmssdMs = if (a.hrvN > 0) a.hrvSum / a.hrvN else null,
                restingHrBpm = if (a.hrN > 0) a.hrSum / a.hrN else null,
            )
        }
    }

    private fun ensureClient() {
        if (!::healthConnectClient.isInitialized) {
            healthConnectClient = HealthConnectClient.getOrCreate(context)
        }
    }

    private fun minutesBetween(start: Instant, end: Instant): Double =
        (end.toEpochMilli() - start.toEpochMilli()) / 60_000.0

    /**
     * Get detailed availability status
     */
    fun getAvailabilityStatus(): HealthConnectAvailability {
        return when (val status = getSdkStatus(context)) {
            HealthConnectClient.SDK_AVAILABLE -> 
                HealthConnectAvailability.Available
            HealthConnectClient.SDK_UNAVAILABLE -> 
                HealthConnectAvailability.NotInstalled
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> 
                HealthConnectAvailability.UpdateRequired
            else -> 
                HealthConnectAvailability.Unknown(status)
        }
    }
}

/**
 * Health Connect availability status
 */
sealed class HealthConnectAvailability {
    object Available : HealthConnectAvailability()
    object NotInstalled : HealthConnectAvailability()
    object UpdateRequired : HealthConnectAvailability()
    data class Unknown(val code: Int) : HealthConnectAvailability()

    fun isAvailable(): Boolean = this is Available
}
