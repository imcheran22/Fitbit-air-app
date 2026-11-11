package ai.synheart.wear.adapters

import android.content.Context
import android.content.SharedPreferences
import ai.synheart.wear.SynheartWearException
import ai.synheart.wear.cloud.WearServiceAPI
import ai.synheart.wear.cloud.models.OAuthCallbackRequest
import ai.synheart.wear.config.CloudConfig
import ai.synheart.wear.models.DeviceAdapter
import ai.synheart.wear.models.MetricType
import ai.synheart.wear.models.WearMetrics
import ai.synheart.wear.models.WearMetricsBuilder
import com.google.gson.GsonBuilder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.InternalSerializationApi
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.TimeUnit

/**
 * WHOOP wearable device provider
 *
 * Handles OAuth connection and data fetching from WHOOP devices
 * via the Wear Service backend.
 *
 * Based on iOS Swift implementation for consistency across platforms.
 */
@OptIn(InternalSerializationApi::class)
class WhoopProvider internal constructor(
    private val context: Context,
    private val cloudConfig: CloudConfig,
    apiOverride: WearServiceAPI?
) : WearableProvider {

    constructor(context: Context, cloudConfig: CloudConfig) : this(context, cloudConfig, null)

    override val vendor: DeviceAdapter = DeviceAdapter.WHOOP

    private val api: WearServiceAPI = apiOverride ?: createRetrofitClient()
    private var userId: String? = null
    private var oauthState: String? = null

    private val sharedPrefs: SharedPreferences by lazy {
        context.getSharedPreferences("synheart_whoop_${cloudConfig.appId}", Context.MODE_PRIVATE)
    }

    init {
        // Try to load existing user ID
        userId = loadUserId()
    }

    // ============= WearableProvider Interface =============

    override fun isConnected(): Boolean = userId != null

    override fun getUserId(): String? = userId

    override suspend fun connect(): String {
        return withContext(Dispatchers.IO) {
            try {
                // Generate state parameter for CSRF protection
                val state = UUID.randomUUID().toString()
                oauthState = state

                // Store state temporarily
                saveOAuthState(state)

                // Get authorization URL from Wear Service
                val response = api.getAuthorizationUrl(
                    vendor = "whoop",
                    redirectUri = cloudConfig.redirectUri,
                    state = state,
                    appId = cloudConfig.appId
                )

                if (!response.isSuccessful) {
                    throw SynheartWearException(
                        "Failed to get authorization URL: ${response.code()} ${response.message()}"
                    )
                }

                response.body()?.authorizationUrl
                    ?: throw SynheartWearException("Empty authorization URL")
            } catch (e: Exception) {
                throw SynheartWearException("Failed to start OAuth flow: ${e.message}", e)
            }
        }
    }

    override suspend fun connectWithCode(code: String, state: String, redirectUri: String): String {
        return withContext(Dispatchers.IO) {
            try {
                // Validate state parameter
                val savedState = loadOAuthState()
                if (state != savedState) {
                    throw SynheartWearException("Invalid OAuth state parameter")
                }

                // Exchange code for tokens
                val request = OAuthCallbackRequest(
                    code = code,
                    state = state,
                    redirectUri = redirectUri
                )

                val response = api.handleOAuthCallback(
                    vendor = "whoop",
                    request = request
                )

                if (!response.isSuccessful) {
                    throw SynheartWearException(
                        "Failed to complete OAuth: ${response.code()} ${response.message()}"
                    )
                }

                val callbackResponse = response.body()
                    ?: throw SynheartWearException("Empty callback response")

                // Store user ID and clear state
                userId = callbackResponse.userId
                saveUserId(callbackResponse.userId)
                clearOAuthState()

                callbackResponse.userId
            } catch (e: Exception) {
                throw SynheartWearException("Failed to complete OAuth flow: ${e.message}", e)
            }
        }
    }

    override suspend fun disconnect() {
        withContext(Dispatchers.IO) {
            val currentUserId = userId ?: return@withContext

            // Always clear local state first
            userId = null
            clearUserId()

            // Then try to notify server
            try {
                api.disconnect(
                    vendor = "whoop",
                    userId = currentUserId,
                    appId = cloudConfig.appId
                )
            } catch (e: Exception) {
                // Log but don't throw - local state is already cleared
                android.util.Log.w(
                    "WhoopProvider",
                    "Failed to notify server of disconnection: ${e.message}"
                )
            }
        }
    }

    override suspend fun fetchRecovery(
        startDate: Date?,
        endDate: Date?,
        limit: Int?,
        cursor: String?
    ): List<WearMetrics> {
        ensureConnected()

        return withContext(Dispatchers.IO) {
            try {
                val response = api.getRecoveryData(
                    vendor = "whoop",
                    userId = userId!!,
                    appId = cloudConfig.appId,
                    start = startDate?.toRFC3339(),
                    end = endDate?.toRFC3339(),
                    limit = limit,
                    cursor = cursor
                )

                if (!response.isSuccessful) {
                    throw SynheartWearException(
                        "Failed to fetch recovery data: ${response.code()} ${response.message()}"
                    )
                }

                val envelope = response.body()
                    ?: throw SynheartWearException("Empty response from wear service")

                // Convert records to WearMetrics
                envelope.records.mapNotNull { record ->
                    convertDataRecordToMetrics(record, "recovery", envelope.vendor, envelope.userId)
                }
            } catch (e: Exception) {
                throw SynheartWearException("Failed to fetch recovery data: ${e.message}", e)
            }
        }
    }

    // ============= Additional Data Fetching Methods =============

    /**
     * Fetch sleep data from WHOOP
     */
    suspend fun fetchSleep(
        startDate: Date? = null,
        endDate: Date? = null,
        limit: Int? = null,
        cursor: String? = null
    ): List<WearMetrics> {
        ensureConnected()

        return withContext(Dispatchers.IO) {
            try {
                val response = api.getSleepData(
                    vendor = "whoop",
                    userId = userId!!,
                    appId = cloudConfig.appId,
                    start = startDate?.toRFC3339(),
                    end = endDate?.toRFC3339(),
                    limit = limit,
                    cursor = cursor
                )

                if (!response.isSuccessful) {
                    throw SynheartWearException(
                        "Failed to fetch sleep data: ${response.code()} ${response.message()}"
                    )
                }

                val envelope = response.body()
                    ?: throw SynheartWearException("Empty response from wear service")

                envelope.records.mapNotNull { record ->
                    convertDataRecordToMetrics(record, "sleep", envelope.vendor, envelope.userId)
                }
            } catch (e: Exception) {
                throw SynheartWearException("Failed to fetch sleep data: ${e.message}", e)
            }
        }
    }

    /**
     * Fetch workout data from WHOOP
     */
    suspend fun fetchWorkouts(
        startDate: Date? = null,
        endDate: Date? = null,
        limit: Int? = null,
        cursor: String? = null
    ): List<WearMetrics> {
        ensureConnected()

        return withContext(Dispatchers.IO) {
            try {
                val response = api.getWorkoutData(
                    vendor = "whoop",
                    userId = userId!!,
                    appId = cloudConfig.appId,
                    start = startDate?.toRFC3339(),
                    end = endDate?.toRFC3339(),
                    limit = limit,
                    cursor = cursor
                )

                if (!response.isSuccessful) {
                    throw SynheartWearException(
                        "Failed to fetch workout data: ${response.code()} ${response.message()}"
                    )
                }

                val envelope = response.body()
                    ?: throw SynheartWearException("Empty response from wear service")

                envelope.records.mapNotNull { record ->
                    convertDataRecordToMetrics(record, "workout", envelope.vendor, envelope.userId)
                }
            } catch (e: Exception) {
                throw SynheartWearException("Failed to fetch workout data: ${e.message}", e)
            }
        }
    }

    /**
     * Fetch cycle data from WHOOP
     */
    suspend fun fetchCycles(
        startDate: Date? = null,
        endDate: Date? = null,
        limit: Int? = null,
        cursor: String? = null
    ): List<WearMetrics> {
        ensureConnected()

        return withContext(Dispatchers.IO) {
            try {
                val response = api.getCycleData(
                    vendor = "whoop",
                    userId = userId!!,
                    appId = cloudConfig.appId,
                    start = startDate?.toRFC3339(),
                    end = endDate?.toRFC3339(),
                    limit = limit,
                    cursor = cursor
                )

                if (!response.isSuccessful) {
                    throw SynheartWearException(
                        "Failed to fetch cycle data: ${response.code()} ${response.message()}"
                    )
                }

                val envelope = response.body()
                    ?: throw SynheartWearException("Empty response from wear service")

                envelope.records.mapNotNull { record ->
                    convertDataRecordToMetrics(record, "cycle", envelope.vendor, envelope.userId)
                }
            } catch (e: Exception) {
                throw SynheartWearException("Failed to fetch cycle data: ${e.message}", e)
            }
        }
    }

    // ============= Private Helper Methods =============

    /**
     * Convert a data record to WearMetrics
     * Matches iOS implementation logic
     */
    private fun convertDataRecordToMetrics(
        record: Map<String, Any>,
        dataType: String,
        vendor: String,
        userId: String
    ): WearMetrics? {
        try {
            // Extract timestamp
            val timestamp = extractTimestamp(record) ?: System.currentTimeMillis()

            // Extract device ID
            val deviceId = extractString(record, listOf("device_id", "deviceId", "id"))
                ?: "${vendor}_${userId.take(8)}"

            // Build metrics based on data type
            val builder = WearMetrics.builder()
                .timestamp(timestamp)
                .deviceId(deviceId)
                .source("${vendor}_$dataType")
                .metaData("data_type", dataType)
                .metaData("vendor", vendor)

            when (dataType) {
                "recovery" -> extractRecoveryMetrics(record, builder)
                "sleep" -> extractSleepMetrics(record, builder)
                "workout" -> extractWorkoutMetrics(record, builder)
                "cycle" -> extractCycleMetrics(record, builder)
                else -> extractGenericMetrics(record, builder)
            }

            return builder.build()
        } catch (e: Exception) {
            android.util.Log.w("WhoopProvider", "Failed to convert record: ${e.message}")
            return null
        }
    }

    /**
     * Extract timestamp from record (matches iOS logic)
     */
    private fun extractTimestamp(record: Map<String, Any>): Long? {
        val timestampKeys = listOf("timestamp", "created_at", "start_time", "end_time", "date", "time")

        for (key in timestampKeys) {
            val value = record[key] ?: continue

            when (value) {
                is String -> {
                    try {
                        // Try ISO8601 format
                        val formatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
                        formatter.timeZone = TimeZone.getTimeZone("UTC")
                        return formatter.parse(value)?.time
                    } catch (e: Exception) {
                        try {
                            // Try without milliseconds
                            val formatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
                            formatter.timeZone = TimeZone.getTimeZone("UTC")
                            return formatter.parse(value)?.time
                        } catch (e: Exception) {
                            // Ignore and try next key
                        }
                    }
                }
                is Number -> return value.toLong()
            }
        }

        return null
    }

    /**
     * Extract string value from record
     */
    private fun extractString(record: Map<String, Any>, keys: List<String>): String? {
        for (key in keys) {
            val value = record[key]
            if (value is String) return value
        }
        return null
    }

    /**
     * Extract double value from record
     */
    private fun extractDouble(record: Map<String, Any>, keys: List<String>): Double? {
        for (key in keys) {
            val value = record[key] ?: continue
            when (value) {
                is Number -> return value.toDouble()
                is String -> value.toDoubleOrNull()?.let { return it }
            }
        }
        return null
    }

    /**
     * Extract recovery-specific metrics (matches iOS logic)
     */
    private fun extractRecoveryMetrics(record: Map<String, Any>, builder: WearMetricsBuilder) {
        // Recovery score
        extractDouble(record, listOf("score", "recovery_score", "recoveryScore"))?.let {
            builder.metaData("recovery_score", it.toString())
        }

        // HRV metrics
        extractDouble(record, listOf("hrv", "hrv_rmssd", "hrvRmssd", "rmssd"))?.let {
            builder.metric(MetricType.HRV_RMSSD, it)
        }
        extractDouble(record, listOf("hrv_sdnn", "hrvSdnn", "sdnn"))?.let {
            builder.metric(MetricType.HRV_SDNN, it)
        }

        // Heart rate
        extractDouble(record, listOf("hr", "heart_rate", "heartRate", "resting_heart_rate", "restingHeartRate"))?.let {
            builder.metric(MetricType.HR, it)
        }

        // Strain
        extractDouble(record, listOf("strain", "strain_score", "strainScore"))?.let {
            builder.metaData("strain", it.toString())
        }
    }

    /**
     * Extract sleep-specific metrics (matches iOS logic)
     */
    private fun extractSleepMetrics(record: Map<String, Any>, builder: WearMetricsBuilder) {
        // Sleep duration (convert to hours)
        extractDouble(record, listOf("duration", "sleep_duration", "sleepDuration", "total_sleep_time", "totalSleepTime"))?.let {
            builder.metaData("sleep_duration_hours", (it / 3600.0).toString())
        }

        // Sleep efficiency
        extractDouble(record, listOf("efficiency", "sleep_efficiency", "sleepEfficiency"))?.let {
            builder.metaData("sleep_efficiency", it.toString())
        }

        // Sleep score
        extractDouble(record, listOf("score", "sleep_score", "sleepScore"))?.let {
            builder.metaData("sleep_score", it.toString())
        }

        // Sleep stages
        extractDouble(record, listOf("rem", "rem_duration", "remDuration"))?.let {
            builder.metaData("rem_duration_minutes", (it / 60.0).toString())
        }
        extractDouble(record, listOf("deep", "deep_duration", "deepDuration", "slow_wave", "slowWave"))?.let {
            builder.metaData("deep_duration_minutes", (it / 60.0).toString())
        }
        extractDouble(record, listOf("light", "light_duration", "lightDuration"))?.let {
            builder.metaData("light_duration_minutes", (it / 60.0).toString())
        }
    }

    /**
     * Extract workout-specific metrics (matches iOS logic)
     */
    private fun extractWorkoutMetrics(record: Map<String, Any>, builder: WearMetricsBuilder) {
        // Duration
        extractDouble(record, listOf("duration", "workout_duration", "workoutDuration"))?.let {
            builder.metaData("workout_duration_minutes", (it / 60.0).toString())
        }

        // Calories
        extractDouble(record, listOf("calories", "calories_burned", "caloriesBurned", "energy"))?.let {
            builder.metric(MetricType.CALORIES, it)
        }

        // Heart rate
        extractDouble(record, listOf("avg_hr", "avgHr", "average_heart_rate", "averageHeartRate"))?.let {
            builder.metric(MetricType.HR, it)
        }
        extractDouble(record, listOf("max_hr", "maxHr", "max_heart_rate", "maxHeartRate"))?.let {
            builder.metaData("max_hr", it.toString())
        }

        // Distance
        extractDouble(record, listOf("distance", "distance_meters", "distanceMeters"))?.let {
            builder.metric(MetricType.DISTANCE, it)
        }

        // Workout type
        extractString(record, listOf("type", "workout_type", "workoutType", "sport"))?.let {
            builder.metaData("workout_type", it)
        }
    }

    /**
     * Extract cycle-specific metrics (matches iOS logic)
     */
    private fun extractCycleMetrics(record: Map<String, Any>, builder: WearMetricsBuilder) {
        // Cycle day
        extractDouble(record, listOf("day", "cycle_day", "cycleDay"))?.let {
            builder.metaData("cycle_day", it.toString())
        }

        // Strain
        extractDouble(record, listOf("strain", "strain_score", "strainScore"))?.let {
            builder.metaData("strain", it.toString())
        }

        // Recovery
        extractDouble(record, listOf("recovery", "recovery_score", "recoveryScore"))?.let {
            builder.metaData("recovery_score", it.toString())
        }
    }

    /**
     * Extract generic metrics (fallback)
     */
    private fun extractGenericMetrics(record: Map<String, Any>, builder: WearMetricsBuilder) {
        for ((key, value) in record) {
            when (value) {
                is Number -> builder.metaData(key, value.toString())
                is String -> builder.metaData(key, value)
            }
        }
    }

    private fun createRetrofitClient(): WearServiceAPI {
        val loggingInterceptor = HttpLoggingInterceptor().apply {
            level = if (cloudConfig.enableDebugLogging) {
                HttpLoggingInterceptor.Level.BODY
            } else {
                HttpLoggingInterceptor.Level.NONE
            }
        }

        val okHttpClient = OkHttpClient.Builder()
            .addInterceptor(loggingInterceptor)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()

        val gson = GsonBuilder()
            .setLenient()
            .create()

        val retrofit = Retrofit.Builder()
            .baseUrl(cloudConfig.baseUrl)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()

        return retrofit.create(WearServiceAPI::class.java)
    }

    private fun ensureConnected() {
        if (userId == null) {
            throw SynheartWearException(
                "Not connected to WHOOP. Call connect() first."
            )
        }
    }

    private fun saveUserId(userId: String) {
        sharedPrefs.edit().putString("user_id", userId).apply()
    }

    private fun loadUserId(): String? {
        return sharedPrefs.getString("user_id", null)
    }

    private fun clearUserId() {
        sharedPrefs.edit().remove("user_id").apply()
    }

    private fun saveOAuthState(state: String) {
        sharedPrefs.edit().putString("oauth_state", state).apply()
    }

    private fun loadOAuthState(): String? {
        return sharedPrefs.getString("oauth_state", null)
    }

    private fun clearOAuthState() {
        sharedPrefs.edit().remove("oauth_state").apply()
    }

    private fun Date.toRFC3339(): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        return sdf.format(this)
    }
}

