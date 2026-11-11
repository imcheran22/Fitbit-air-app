package ai.synheart.wear.adapters

import android.content.Context
import android.util.Log
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.*
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ChangesTokenRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import java.io.IOException
import java.time.Instant
import java.time.temporal.ChronoUnit
import kotlin.reflect.KClass

/**
 * Health Connect Manager - Comprehensive utility for Health Connect operations
 *
 * Provides high-level API for common Health Connect operations based on
 * Google's Health Connect samples and best practices.
 *
 * @param context Android application context
 */
internal class HealthConnectManager(private val context: Context) {
    
    private val TAG = "HealthConnectManager"
    private val healthConnectClient by lazy { HealthConnectClient.getOrCreate(context) }

    /**
     * Common Health Connect permission sets
     */
    object Permissions {
        val HEART_RATE = setOf(
            HealthPermission.getReadPermission(HeartRateRecord::class)
        )

        val HRV = setOf(
            HealthPermission.getReadPermission(HeartRateVariabilityRmssdRecord::class)
        )

        val STEPS = setOf(
            HealthPermission.getReadPermission(StepsRecord::class)
        )

        val CALORIES = setOf(
            HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
            HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class)
        )

        val DISTANCE = setOf(
            HealthPermission.getReadPermission(DistanceRecord::class)
        )

        val EXERCISE = setOf(
            HealthPermission.getReadPermission(ExerciseSessionRecord::class),
            HealthPermission.getReadPermission(SpeedRecord::class)
        )

        val SLEEP = setOf(
            HealthPermission.getReadPermission(SleepSessionRecord::class)
        )

        val VITALS = setOf(
            HealthPermission.getReadPermission(HeartRateRecord::class),
            HealthPermission.getReadPermission(HeartRateVariabilityRmssdRecord::class),
            HealthPermission.getReadPermission(RestingHeartRateRecord::class),
            HealthPermission.getReadPermission(OxygenSaturationRecord::class),
            HealthPermission.getReadPermission(RespiratoryRateRecord::class),
            HealthPermission.getReadPermission(BodyTemperatureRecord::class)
        )

        val BODY_MEASUREMENTS = setOf(
            HealthPermission.getReadPermission(WeightRecord::class),
            HealthPermission.getReadPermission(HeightRecord::class),
            HealthPermission.getReadPermission(BodyFatRecord::class),
            HealthPermission.getReadPermission(LeanBodyMassRecord::class)
        )

        val ALL_BIOMETRIC = HEART_RATE + HRV + STEPS + CALORIES + DISTANCE + 
                           EXERCISE + SLEEP + VITALS + BODY_MEASUREMENTS
    }

    /**
     * Check if Health Connect is available
     */
    fun isAvailable(): Boolean {
        return HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE
    }

    /**
     * Check SDK status
     */
    fun getSdkStatus(): Int {
        return HealthConnectClient.getSdkStatus(context)
    }

    /**
     * Check if all specified permissions are granted
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

    /**
     * Get currently granted permissions
     */
    suspend fun getGrantedPermissions(): Set<String> {
        return try {
            healthConnectClient.permissionController.getGrantedPermissions()
        } catch (e: Exception) {
            Log.e(TAG, "Error getting granted permissions: ${e.message}", e)
            emptySet()
        }
    }

    /**
     * Revoke all permissions
     */
    suspend fun revokeAllPermissions() {
        try {
            healthConnectClient.permissionController.revokeAllPermissions()
            Log.i(TAG, "All permissions revoked")
        } catch (e: Exception) {
            Log.e(TAG, "Error revoking permissions: ${e.message}", e)
            throw e
        }
    }

    // === Heart Rate ===

    /**
     * Read heart rate records
     */
    suspend fun readHeartRate(start: Instant, end: Instant): List<HeartRateRecord> {
        val request = ReadRecordsRequest(
            recordType = HeartRateRecord::class,
            timeRangeFilter = TimeRangeFilter.between(start, end),
            ascendingOrder = false
        )
        return healthConnectClient.readRecords(request).records
    }

    /**
     * Read average heart rate
     */
    suspend fun readAverageHeartRate(start: Instant, end: Instant): Double? {
        val request = AggregateRequest(
            metrics = setOf(HeartRateRecord.BPM_AVG),
            timeRangeFilter = TimeRangeFilter.between(start, end)
        )
        val response = healthConnectClient.aggregate(request)
        return response[HeartRateRecord.BPM_AVG]?.toDouble()
    }

    /**
     * Read heart rate range (min/max/avg)
     */
    suspend fun readHeartRateRange(start: Instant, end: Instant): HeartRateRange {
        val request = AggregateRequest(
            metrics = setOf(
                HeartRateRecord.BPM_MIN,
                HeartRateRecord.BPM_MAX,
                HeartRateRecord.BPM_AVG
            ),
            timeRangeFilter = TimeRangeFilter.between(start, end)
        )
        val response = healthConnectClient.aggregate(request)
        return HeartRateRange(
            min = response[HeartRateRecord.BPM_MIN]?.toDouble(),
            max = response[HeartRateRecord.BPM_MAX]?.toDouble(),
            avg = response[HeartRateRecord.BPM_AVG]?.toDouble()
        )
    }

    // === HRV ===

    /**
     * Read HRV RMSSD records
     */
    suspend fun readHRV(start: Instant, end: Instant): List<HeartRateVariabilityRmssdRecord> {
        val request = ReadRecordsRequest(
            recordType = HeartRateVariabilityRmssdRecord::class,
            timeRangeFilter = TimeRangeFilter.between(start, end),
            ascendingOrder = false
        )
        return healthConnectClient.readRecords(request).records
    }

    /**
     * Read average HRV
     */
    suspend fun readAverageHRV(start: Instant, end: Instant): Double? {
        val records = readHRV(start, end)
        return if (records.isNotEmpty()) {
            records.mapNotNull { it.heartRateVariabilityMillis }.average()
        } else null
    }

    // === Steps ===

    /**
     * Read total steps
     */
    suspend fun readStepsTotal(start: Instant, end: Instant): Long {
        val request = AggregateRequest(
            metrics = setOf(StepsRecord.COUNT_TOTAL),
            timeRangeFilter = TimeRangeFilter.between(start, end)
        )
        val response = healthConnectClient.aggregate(request)
        return response[StepsRecord.COUNT_TOTAL] ?: 0L
    }

    /**
     * Read steps records
     */
    suspend fun readStepsRecords(start: Instant, end: Instant): List<StepsRecord> {
        val request = ReadRecordsRequest(
            recordType = StepsRecord::class,
            timeRangeFilter = TimeRangeFilter.between(start, end)
        )
        return healthConnectClient.readRecords(request).records
    }

    // === Calories ===

    /**
     * Read total calories burned
     */
    suspend fun readCaloriesTotal(start: Instant, end: Instant): Double {
        val request = AggregateRequest(
            metrics = setOf(
                TotalCaloriesBurnedRecord.ENERGY_TOTAL,
                ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL
            ),
            timeRangeFilter = TimeRangeFilter.between(start, end)
        )
        val response = healthConnectClient.aggregate(request)
        
        val total = response[TotalCaloriesBurnedRecord.ENERGY_TOTAL]?.inCalories ?: 0.0
        val active = response[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inCalories ?: 0.0
        
        return if (total > 0) total else active
    }

    // === Distance ===

    /**
     * Read total distance
     */
    suspend fun readDistanceTotal(start: Instant, end: Instant): Double {
        val request = AggregateRequest(
            metrics = setOf(DistanceRecord.DISTANCE_TOTAL),
            timeRangeFilter = TimeRangeFilter.between(start, end)
        )
        val response = healthConnectClient.aggregate(request)
        return response[DistanceRecord.DISTANCE_TOTAL]?.inMeters ?: 0.0
    }

    // === Exercise ===

    /**
     * Read exercise sessions
     */
    suspend fun readExerciseSessions(start: Instant, end: Instant): List<ExerciseSessionRecord> {
        val request = ReadRecordsRequest(
            recordType = ExerciseSessionRecord::class,
            timeRangeFilter = TimeRangeFilter.between(start, end),
            ascendingOrder = false
        )
        return healthConnectClient.readRecords(request).records
    }

    /**
     * Read exercise session with associated data
     */
    suspend fun readExerciseSessionData(uid: String): ExerciseSessionData {
        val sessionRecord = healthConnectClient.readRecord(ExerciseSessionRecord::class, uid)
        val session = sessionRecord.record
        
        val timeRangeFilter = TimeRangeFilter.between(session.startTime, session.endTime)
        val dataOriginFilter = setOf(session.metadata.dataOrigin)
        
        val aggregateRequest = AggregateRequest(
            metrics = setOf(
                ExerciseSessionRecord.EXERCISE_DURATION_TOTAL,
                StepsRecord.COUNT_TOTAL,
                DistanceRecord.DISTANCE_TOTAL,
                TotalCaloriesBurnedRecord.ENERGY_TOTAL,
                HeartRateRecord.BPM_AVG,
                HeartRateRecord.BPM_MAX,
                HeartRateRecord.BPM_MIN
            ),
            timeRangeFilter = timeRangeFilter,
            dataOriginFilter = dataOriginFilter
        )
        val aggregateData = healthConnectClient.aggregate(aggregateRequest)
        
        return ExerciseSessionData(
            uid = uid,
            title = session.title,
            exerciseType = session.exerciseType,
            startTime = session.startTime,
            endTime = session.endTime,
            duration = aggregateData[ExerciseSessionRecord.EXERCISE_DURATION_TOTAL],
            totalSteps = aggregateData[StepsRecord.COUNT_TOTAL],
            totalDistance = aggregateData[DistanceRecord.DISTANCE_TOTAL],
            totalEnergyBurned = aggregateData[TotalCaloriesBurnedRecord.ENERGY_TOTAL],
            minHeartRate = aggregateData[HeartRateRecord.BPM_MIN],
            maxHeartRate = aggregateData[HeartRateRecord.BPM_MAX],
            avgHeartRate = aggregateData[HeartRateRecord.BPM_AVG]
        )
    }

    // === Sleep ===

    /**
     * Read sleep sessions
     */
    suspend fun readSleepSessions(start: Instant, end: Instant): List<SleepSessionRecord> {
        val request = ReadRecordsRequest(
            recordType = SleepSessionRecord::class,
            timeRangeFilter = TimeRangeFilter.between(start, end),
            ascendingOrder = false
        )
        return healthConnectClient.readRecords(request).records
    }

    /**
     * Read total sleep duration
     */
    suspend fun readSleepDuration(start: Instant, end: Instant): Long? {
        val request = AggregateRequest(
            metrics = setOf(SleepSessionRecord.SLEEP_DURATION_TOTAL),
            timeRangeFilter = TimeRangeFilter.between(start, end)
        )
        val response = healthConnectClient.aggregate(request)
        return response[SleepSessionRecord.SLEEP_DURATION_TOTAL]?.toMillis()
    }

    // === Vitals ===

    /**
     * Read resting heart rate
     */
    suspend fun readRestingHeartRate(start: Instant, end: Instant): List<RestingHeartRateRecord> {
        val request = ReadRecordsRequest(
            recordType = RestingHeartRateRecord::class,
            timeRangeFilter = TimeRangeFilter.between(start, end)
        )
        return healthConnectClient.readRecords(request).records
    }

    /**
     * Read oxygen saturation (SpO2)
     */
    suspend fun readOxygenSaturation(start: Instant, end: Instant): List<OxygenSaturationRecord> {
        val request = ReadRecordsRequest(
            recordType = OxygenSaturationRecord::class,
            timeRangeFilter = TimeRangeFilter.between(start, end)
        )
        return healthConnectClient.readRecords(request).records
    }

    /**
     * Read respiratory rate
     */
    suspend fun readRespiratoryRate(start: Instant, end: Instant): List<RespiratoryRateRecord> {
        val request = ReadRecordsRequest(
            recordType = RespiratoryRateRecord::class,
            timeRangeFilter = TimeRangeFilter.between(start, end)
        )
        return healthConnectClient.readRecords(request).records
    }

    /**
     * Read body temperature
     */
    suspend fun readBodyTemperature(start: Instant, end: Instant): List<BodyTemperatureRecord> {
        val request = ReadRecordsRequest(
            recordType = BodyTemperatureRecord::class,
            timeRangeFilter = TimeRangeFilter.between(start, end)
        )
        return healthConnectClient.readRecords(request).records
    }

    // === Body Measurements ===

    /**
     * Read weight records
     */
    suspend fun readWeight(start: Instant, end: Instant): List<WeightRecord> {
        val request = ReadRecordsRequest(
            recordType = WeightRecord::class,
            timeRangeFilter = TimeRangeFilter.between(start, end)
        )
        return healthConnectClient.readRecords(request).records
    }

    /**
     * Read average weight
     */
    suspend fun readAverageWeight(start: Instant, end: Instant): Double? {
        val request = AggregateRequest(
            metrics = setOf(WeightRecord.WEIGHT_AVG),
            timeRangeFilter = TimeRangeFilter.between(start, end)
        )
        val response = healthConnectClient.aggregate(request)
        return response[WeightRecord.WEIGHT_AVG]?.inKilograms
    }

    // === Differential Changes API ===

    /**
     * Get changes token for specified record types
     */
    suspend fun getChangesToken(dataTypes: Set<KClass<out Record>>): String {
        val request = ChangesTokenRequest(dataTypes)
        return healthConnectClient.getChangesToken(request)
    }

    /**
     * Get changes since last token
     */
    suspend fun getChanges(token: String): Flow<ChangesMessage> = flow {
        var nextChangesToken = token
        do {
            val response = healthConnectClient.getChanges(nextChangesToken)
            if (response.changesTokenExpired) {
                throw IOException("Changes token has expired")
            }
            emit(ChangesMessage.ChangeList(response.changes))
            nextChangesToken = response.nextChangesToken
        } while (response.hasMore)
        emit(ChangesMessage.NoMoreChanges(nextChangesToken))
    }

    // === Utility Methods ===

    /**
     * Get time range for last N hours
     */
    fun getTimeRangeLastHours(hours: Int): TimeRangeFilter {
        val now = Instant.now()
        return TimeRangeFilter.between(
            now.minus(hours.toLong(), ChronoUnit.HOURS),
            now
        )
    }

    /**
     * Get time range for last N days
     */
    fun getTimeRangeLastDays(days: Int): TimeRangeFilter {
        val now = Instant.now()
        return TimeRangeFilter.between(
            now.minus(days.toLong(), ChronoUnit.DAYS),
            now
        )
    }

    /**
     * Get time range for today
     */
    fun getTimeRangeToday(): TimeRangeFilter {
        val now = Instant.now()
        val startOfDay = now.truncatedTo(ChronoUnit.DAYS)
        return TimeRangeFilter.between(startOfDay, now)
    }

    // === Data Classes ===

    data class HeartRateRange(
        val min: Double?,
        val max: Double?,
        val avg: Double?
    )

    data class ExerciseSessionData(
        val uid: String,
        val title: String?,
        val exerciseType: Int,
        val startTime: Instant,
        val endTime: Instant,
        val duration: java.time.Duration?,
        val totalSteps: Long?,
        val totalDistance: androidx.health.connect.client.units.Length?,
        val totalEnergyBurned: androidx.health.connect.client.units.Energy?,
        val minHeartRate: Long?,
        val maxHeartRate: Long?,
        val avgHeartRate: Long?
    )

    sealed class ChangesMessage {
        data class NoMoreChanges(val nextChangesToken: String) : ChangesMessage()
        data class ChangeList(val changes: List<androidx.health.connect.client.changes.Change>) : ChangesMessage()
    }
}

