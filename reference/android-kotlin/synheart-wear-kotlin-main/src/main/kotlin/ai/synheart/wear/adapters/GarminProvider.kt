package ai.synheart.wear.adapters

import android.content.Context
import android.content.SharedPreferences
import ai.synheart.wear.SynheartWearException
import ai.synheart.wear.cloud.WearServiceAPI
import ai.synheart.wear.cloud.models.GarminBackfillRequest
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
 * Garmin wearable device provider
 *
 * Handles OAuth PKCE connection and data fetching from Garmin devices
 * via the Wear Service backend.
 *
 * Key differences from WHOOP:
 * - Uses OAuth2 PKCE flow (handled by service)
 * - Intermediate redirect flow (Garmin doesn't accept deep links)
 * - GET callback (browser redirect) instead of POST
 * - Data is primarily delivered via webhooks
 * - 12 summary types available (dailies, epochs, sleeps, etc.)
 * - Backfill API for historical data
 *
 * Based on wear-service-flow.md documentation.
 */
@OptIn(InternalSerializationApi::class)
class GarminProvider internal constructor(
    private val context: Context,
    private val cloudConfig: CloudConfig,
    apiOverride: WearServiceAPI?
) : WearableProvider {

    constructor(context: Context, cloudConfig: CloudConfig) : this(context, cloudConfig, null)

    override val vendor: DeviceAdapter = DeviceAdapter.GARMIN

    private val api: WearServiceAPI = apiOverride ?: createRetrofitClient()
    private var userId: String? = null
    private var oauthState: String? = null

    private val sharedPrefs: SharedPreferences by lazy {
        context.getSharedPreferences("synheart_garmin_${cloudConfig.appId}", Context.MODE_PRIVATE)
    }

    init {
        // Try to load existing user ID
        userId = loadUserId()
    }

    // ============= Garmin Summary Types =============

    /**
     * Garmin summary types available for data fetching
     */
    enum class SummaryType(val value: String) {
        DAILIES("dailies"),           // Daily summaries (steps, calories, heart rate, stress, body battery)
        EPOCHS("epochs"),             // 15-minute granular activity periods
        SLEEPS("sleeps"),             // Sleep duration, levels (deep/light/REM), scores
        STRESS_DETAILS("stressDetails"), // Detailed stress values and body battery events
        HRV("hrv"),                   // Heart rate variability metrics
        USER_METRICS("userMetrics"),  // VO2 Max, Fitness Age
        BODY_COMPS("bodyComps"),      // Body composition (weight, BMI, body fat, etc.)
        PULSE_OX("pulseox"),          // Pulse oximetry data
        RESPIRATION("respiration"),   // Respiration rate data
        HEALTH_SNAPSHOT("healthSnapshot"), // Health snapshot data
        BLOOD_PRESSURES("bloodPressures"), // Blood pressure measurements
        SKIN_TEMP("skinTemp")         // Skin temperature data
    }

    // ============= WearableProvider Interface =============

    override fun isConnected(): Boolean = userId != null

    override fun getUserId(): String? = userId

    /**
     * Start OAuth flow for Garmin
     *
     * Returns authorization URL that should be opened in browser.
     * After user authorizes, Garmin redirects to service HTTPS URL,
     * then service redirects to app's deep link with success/error.
     *
     * @return Authorization URL to open in browser
     */
    override suspend fun connect(): String {
        return withContext(Dispatchers.IO) {
            try {
                // Generate state parameter for CSRF protection
                val state = UUID.randomUUID().toString()
                oauthState = state

                // Store state temporarily
                saveOAuthState(state)

                // Get authorization URL from Wear Service
                // The service handles PKCE code_verifier/challenge generation
                val response = api.getAuthorizationUrl(
                    vendor = "garmin",
                    redirectUri = cloudConfig.redirectUri,  // App's deep link
                    state = state,
                    appId = cloudConfig.appId,
                    userId = userId  // Can be null for new connections
                )

                if (!response.isSuccessful) {
                    throw SynheartWearException(
                        "Failed to get Garmin authorization URL: ${response.code()} ${response.message()}"
                    )
                }

                response.body()?.authorizationUrl
                    ?: throw SynheartWearException("Empty authorization URL from service")
            } catch (e: Exception) {
                throw SynheartWearException("Failed to start Garmin OAuth flow: ${e.message}", e)
            }
        }
    }

    /**
     * Complete OAuth connection from deep link callback
     *
     * For Garmin, the service handles the intermediate redirect and token exchange.
     * The app receives a deep link with query parameters:
     * - success=true&user_id=xxx (on success)
     * - success=false&error=message (on error)
     *
     * This method should be called when the deep link is received.
     *
     * @param code Not used for Garmin (code is exchanged by service)
     * @param state State from deep link (for validation)
     * @param redirectUri The redirect URI used
     * @return User ID from successful connection
     */
    override suspend fun connectWithCode(code: String, state: String, redirectUri: String): String {
        return withContext(Dispatchers.IO) {
            try {
                // For Garmin, the service already exchanged the code for tokens
                // The deep link contains the result directly
                // The 'code' parameter here is actually the user_id for Garmin

                // Validate state parameter
                val savedState = loadOAuthState()
                if (state != savedState && savedState != null) {
                    android.util.Log.w("GarminProvider", "State mismatch - saved: $savedState, received: $state")
                    // Don't throw for Garmin since state is encoded differently
                }

                // Store user ID (passed as 'code' for Garmin deep link compatibility)
                userId = code
                saveUserId(code)
                clearOAuthState()

                code
            } catch (e: Exception) {
                throw SynheartWearException("Failed to complete Garmin OAuth flow: ${e.message}", e)
            }
        }
    }

    /**
     * Handle OAuth callback from deep link
     *
     * This is a convenience method specifically for Garmin's intermediate redirect flow.
     * Call this when you receive the deep link after user authorization.
     *
     * @param success Whether the OAuth was successful
     * @param userId User ID (if success=true)
     * @param error Error message (if success=false)
     * @return User ID if successful
     */
    suspend fun handleDeepLinkCallback(
        success: Boolean,
        userId: String?,
        error: String?
    ): String {
        return withContext(Dispatchers.IO) {
            if (success && userId != null) {
                this@GarminProvider.userId = userId
                saveUserId(userId)
                clearOAuthState()
                userId
            } else {
                throw SynheartWearException("Garmin OAuth failed: ${error ?: "Unknown error"}")
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
            // For Garmin, this also calls Garmin's DELETE /user/registration API
            try {
                api.disconnect(
                    vendor = "garmin",
                    userId = currentUserId,
                    appId = cloudConfig.appId
                )
            } catch (e: Exception) {
                // Log but don't throw - local state is already cleared
                android.util.Log.w(
                    "GarminProvider",
                    "Failed to notify server of Garmin disconnection: ${e.message}"
                )
            }
        }
    }

    /**
     * Fetch recovery data from Garmin
     *
     * Note: For Garmin, "recovery" is not a native concept.
     * This fetches HRV data which is most similar to recovery metrics.
     */
    override suspend fun fetchRecovery(
        startDate: Date?,
        endDate: Date?,
        limit: Int?,
        cursor: String?
    ): List<WearMetrics> {
        // For Garmin, recovery is best represented by HRV data
        return fetchHRV(startDate, endDate)
    }

    // ============= Garmin-Specific Data Fetching Methods =============

    /**
     * Fetch daily summaries from Garmin
     *
     * Contains steps, calories, heart rate, stress levels, body battery.
     * Corresponds to the "My Day" section of Garmin Connect.
     */
    suspend fun fetchDailies(
        startDate: Date? = null,
        endDate: Date? = null
    ): List<WearMetrics> {
        return fetchGarminData(SummaryType.DAILIES, startDate, endDate)
    }

    /**
     * Fetch epoch summaries from Garmin
     *
     * 15-minute granular activity periods with activity types,
     * steps, distance, calories, MET values, and intensity.
     */
    suspend fun fetchEpochs(
        startDate: Date? = null,
        endDate: Date? = null
    ): List<WearMetrics> {
        return fetchGarminData(SummaryType.EPOCHS, startDate, endDate)
    }

    /**
     * Fetch sleep summaries from Garmin
     *
     * Sleep duration, levels (deep/light/REM), awake time,
     * sleep scores, SpO2 values, respiration data.
     */
    suspend fun fetchSleeps(
        startDate: Date? = null,
        endDate: Date? = null
    ): List<WearMetrics> {
        return fetchGarminData(SummaryType.SLEEPS, startDate, endDate)
    }

    /**
     * Fetch stress details from Garmin
     *
     * Detailed stress level values, body battery values,
     * and body battery activity events.
     */
    suspend fun fetchStressDetails(
        startDate: Date? = null,
        endDate: Date? = null
    ): List<WearMetrics> {
        return fetchGarminData(SummaryType.STRESS_DETAILS, startDate, endDate)
    }

    /**
     * Fetch HRV summaries from Garmin
     *
     * Heart rate variability metrics collected during overnight sleep
     * including lastNightAvg, lastNight5MinHigh, and RMSSD measurements.
     */
    suspend fun fetchHRV(
        startDate: Date? = null,
        endDate: Date? = null
    ): List<WearMetrics> {
        return fetchGarminData(SummaryType.HRV, startDate, endDate)
    }

    /**
     * Fetch user metrics from Garmin
     *
     * Fitness metrics including VO2 Max, VO2 Max Cycling, and Fitness Age.
     */
    suspend fun fetchUserMetrics(
        startDate: Date? = null,
        endDate: Date? = null
    ): List<WearMetrics> {
        return fetchGarminData(SummaryType.USER_METRICS, startDate, endDate)
    }

    /**
     * Fetch body composition from Garmin
     *
     * Weight, BMI, muscle mass, bone mass, body water percentage, body fat percentage.
     */
    suspend fun fetchBodyComps(
        startDate: Date? = null,
        endDate: Date? = null
    ): List<WearMetrics> {
        return fetchGarminData(SummaryType.BODY_COMPS, startDate, endDate)
    }

    /**
     * Fetch pulse ox data from Garmin
     *
     * Blood oxygen saturation (SpO2) data.
     */
    suspend fun fetchPulseOx(
        startDate: Date? = null,
        endDate: Date? = null
    ): List<WearMetrics> {
        return fetchGarminData(SummaryType.PULSE_OX, startDate, endDate)
    }

    /**
     * Fetch respiration data from Garmin
     *
     * Breathing rate data throughout the day, during sleep, and activities.
     */
    suspend fun fetchRespiration(
        startDate: Date? = null,
        endDate: Date? = null
    ): List<WearMetrics> {
        return fetchGarminData(SummaryType.RESPIRATION, startDate, endDate)
    }

    /**
     * Fetch health snapshot from Garmin
     *
     * Collection of key health insights from a 2-minute session
     * including HR, HRV, Pulse Ox, respiration, and stress metrics.
     */
    suspend fun fetchHealthSnapshot(
        startDate: Date? = null,
        endDate: Date? = null
    ): List<WearMetrics> {
        return fetchGarminData(SummaryType.HEALTH_SNAPSHOT, startDate, endDate)
    }

    /**
     * Fetch blood pressure data from Garmin
     *
     * Blood pressure readings including systolic, diastolic, and pulse values.
     */
    suspend fun fetchBloodPressures(
        startDate: Date? = null,
        endDate: Date? = null
    ): List<WearMetrics> {
        return fetchGarminData(SummaryType.BLOOD_PRESSURES, startDate, endDate)
    }

    /**
     * Fetch skin temperature data from Garmin
     *
     * Skin temperature changes during sleep window.
     */
    suspend fun fetchSkinTemp(
        startDate: Date? = null,
        endDate: Date? = null
    ): List<WearMetrics> {
        return fetchGarminData(SummaryType.SKIN_TEMP, startDate, endDate)
    }

    // ============= Backfill API =============

    /**
     * Request historical data backfill from Garmin
     *
     * Garmin uses webhook-based data delivery, so historical data
     * must be requested via the backfill API. Data is delivered
     * asynchronously via webhooks to your configured app_webhook_url.
     *
     * @param summaryType Type of data to backfill
     * @param startDate Start of date range (max 90 days from end)
     * @param endDate End of date range
     * @return True if backfill request was accepted
     */
    suspend fun requestBackfill(
        summaryType: SummaryType,
        startDate: Date,
        endDate: Date
    ): Boolean {
        ensureConnected()

        return withContext(Dispatchers.IO) {
            try {
                val request = GarminBackfillRequest(
                    appId = cloudConfig.appId,
                    start = startDate.toRFC3339(),
                    end = endDate.toRFC3339()
                )

                val response = api.requestGarminBackfill(
                    userId = userId!!,
                    summaryType = summaryType.value,
                    request = request
                )

                if (!response.isSuccessful) {
                    val errorCode = response.code()
                    val errorMessage = when (errorCode) {
                        409 -> "Duplicate request - time range already requested"
                        400 -> "Invalid request - check date range (max 90 days)"
                        404 -> "User connection not found"
                        else -> "Failed to request backfill: ${response.code()} ${response.message()}"
                    }
                    throw SynheartWearException(errorMessage)
                }

                true
            } catch (e: SynheartWearException) {
                throw e
            } catch (e: Exception) {
                throw SynheartWearException("Failed to request Garmin backfill: ${e.message}", e)
            }
        }
    }

    // ============= Webhook URL =============

    /**
     * Get webhook URLs to configure in Garmin Developer Portal
     *
     * Returns a map of summary type to webhook URL.
     * These URLs should be configured in your Garmin Developer Portal
     * at https://apis.garmin.com/tools/endpoints/
     */
    suspend fun getWebhookUrls(): Map<String, String> {
        return withContext(Dispatchers.IO) {
            try {
                val response = api.getGarminWebhookUrls(
                    appId = cloudConfig.appId
                )

                if (!response.isSuccessful) {
                    throw SynheartWearException(
                        "Failed to get webhook URLs: ${response.code()} ${response.message()}"
                    )
                }

                response.body()?.endpoints ?: emptyMap()
            } catch (e: Exception) {
                throw SynheartWearException("Failed to get Garmin webhook URLs: ${e.message}", e)
            }
        }
    }

    // ============= Private Helper Methods =============

    /**
     * Generic data fetching for any Garmin summary type
     */
    private suspend fun fetchGarminData(
        summaryType: SummaryType,
        startDate: Date?,
        endDate: Date?
    ): List<WearMetrics> {
        ensureConnected()

        return withContext(Dispatchers.IO) {
            try {
                val response = api.getGarminData(
                    userId = userId!!,
                    summaryType = summaryType.value,
                    appId = cloudConfig.appId,
                    start = startDate?.toRFC3339(),
                    end = endDate?.toRFC3339()
                )

                if (!response.isSuccessful) {
                    val errorCode = response.code()
                    if (errorCode == 501) {
                        // Webhook required - data should come via webhooks
                        android.util.Log.w(
                            "GarminProvider",
                            "Direct data queries not supported for ${summaryType.value}. " +
                                "Data is delivered via webhooks. Use requestBackfill() for historical data."
                        )
                        return@withContext emptyList()
                    }
                    throw SynheartWearException(
                        "Failed to fetch ${summaryType.value} data: ${response.code()} ${response.message()}"
                    )
                }

                val envelope = response.body()
                    ?: throw SynheartWearException("Empty response from wear service")

                // Convert records to WearMetrics
                envelope.records.mapNotNull { record ->
                    convertGarminRecordToMetrics(record, summaryType, envelope.vendor, envelope.userId)
                }
            } catch (e: SynheartWearException) {
                throw e
            } catch (e: Exception) {
                throw SynheartWearException("Failed to fetch Garmin ${summaryType.value} data: ${e.message}", e)
            }
        }
    }

    /**
     * Convert a Garmin data record to WearMetrics
     */
    private fun convertGarminRecordToMetrics(
        record: Map<String, Any>,
        summaryType: SummaryType,
        vendor: String,
        userId: String
    ): WearMetrics? {
        try {
            // Extract timestamp
            val timestamp = extractTimestamp(record) ?: System.currentTimeMillis()

            // Extract device ID
            val deviceId = extractString(record, listOf("summaryId", "userAccessToken", "id"))
                ?: "${vendor}_${userId.take(8)}"

            // Build metrics based on summary type
            val builder = WearMetrics.builder()
                .timestamp(timestamp)
                .deviceId(deviceId)
                .source("${vendor}_${summaryType.value}")
                .metaData("summary_type", summaryType.value)
                .metaData("vendor", vendor)

            when (summaryType) {
                SummaryType.DAILIES -> extractDailiesMetrics(record, builder)
                SummaryType.EPOCHS -> extractEpochsMetrics(record, builder)
                SummaryType.SLEEPS -> extractSleepsMetrics(record, builder)
                SummaryType.STRESS_DETAILS -> extractStressMetrics(record, builder)
                SummaryType.HRV -> extractHRVMetrics(record, builder)
                SummaryType.USER_METRICS -> extractUserMetricsMetrics(record, builder)
                SummaryType.BODY_COMPS -> extractBodyCompMetrics(record, builder)
                SummaryType.PULSE_OX -> extractPulseOxMetrics(record, builder)
                SummaryType.RESPIRATION -> extractRespirationMetrics(record, builder)
                SummaryType.HEALTH_SNAPSHOT -> extractHealthSnapshotMetrics(record, builder)
                SummaryType.BLOOD_PRESSURES -> extractBloodPressureMetrics(record, builder)
                SummaryType.SKIN_TEMP -> extractSkinTempMetrics(record, builder)
            }

            return builder.build()
        } catch (e: Exception) {
            android.util.Log.w("GarminProvider", "Failed to convert Garmin record: ${e.message}")
            return null
        }
    }

    /**
     * Extract timestamp from record
     */
    private fun extractTimestamp(record: Map<String, Any>): Long? {
        val timestampKeys = listOf(
            "startTimeInSeconds", "calendarDate", "summaryId",
            "startTimeGMT", "sleepStartTimestampGMT", "measurementTimeGMT"
        )

        for (key in timestampKeys) {
            val value = record[key] ?: continue

            when (value) {
                is Number -> {
                    // Garmin uses seconds, convert to milliseconds
                    val num = value.toLong()
                    return if (num < 10000000000L) num * 1000 else num
                }
                is String -> {
                    try {
                        // Try date format (YYYY-MM-DD)
                        val formatter = SimpleDateFormat("yyyy-MM-dd", Locale.US)
                        formatter.timeZone = TimeZone.getTimeZone("UTC")
                        return formatter.parse(value)?.time
                    } catch (e: Exception) {
                        try {
                            // Try ISO8601 format
                            val formatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS", Locale.US)
                            formatter.timeZone = TimeZone.getTimeZone("UTC")
                            return formatter.parse(value)?.time
                        } catch (e: Exception) {
                            // Ignore and try next key
                        }
                    }
                }
            }
        }

        return null
    }

    private fun extractString(record: Map<String, Any>, keys: List<String>): String? {
        for (key in keys) {
            val value = record[key]
            if (value is String) return value
        }
        return null
    }

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

    // ============= Garmin-Specific Metric Extractors =============

    private fun extractDailiesMetrics(record: Map<String, Any>, builder: WearMetricsBuilder) {
        // Steps
        extractDouble(record, listOf("steps", "totalSteps"))?.let {
            builder.metric(MetricType.STEPS, it)
        }

        // Calories
        extractDouble(record, listOf("activeKilocalories", "totalKilocalories", "bmrKilocalories"))?.let {
            builder.metric(MetricType.CALORIES, it)
        }

        // Heart rate
        extractDouble(record, listOf("restingHeartRate", "restingHeartRateInBeatsPerMinute"))?.let {
            builder.metric(MetricType.HR, it)
        }
        extractDouble(record, listOf("maxHeartRate", "maxHeartRateInBeatsPerMinute"))?.let {
            builder.metaData("max_hr", it.toString())
        }
        extractDouble(record, listOf("minHeartRate", "minHeartRateInBeatsPerMinute"))?.let {
            builder.metaData("min_hr", it.toString())
        }

        // Stress
        extractDouble(record, listOf("averageStressLevel"))?.let {
            builder.metric(MetricType.STRESS, it / 100.0)  // Normalize to 0-1
        }
        extractDouble(record, listOf("maxStressLevel"))?.let {
            builder.metaData("max_stress", (it / 100.0).toString())
        }

        // Body battery
        extractDouble(record, listOf("bodyBatteryChargedValue"))?.let {
            builder.metaData("body_battery_charged", it.toString())
        }
        extractDouble(record, listOf("bodyBatteryDrainedValue"))?.let {
            builder.metaData("body_battery_drained", it.toString())
        }

        // Distance
        extractDouble(record, listOf("distanceInMeters"))?.let {
            builder.metric(MetricType.DISTANCE, it)
        }

        // Active time
        extractDouble(record, listOf("activeTimeInSeconds", "activeSeconds"))?.let {
            builder.metaData("active_time_minutes", (it / 60.0).toString())
        }
    }

    private fun extractEpochsMetrics(record: Map<String, Any>, builder: WearMetricsBuilder) {
        // Activity type
        extractString(record, listOf("activityType"))?.let {
            builder.metaData("activity_type", it)
        }

        // Steps
        extractDouble(record, listOf("steps"))?.let {
            builder.metric(MetricType.STEPS, it)
        }

        // Distance
        extractDouble(record, listOf("distanceInMeters"))?.let {
            builder.metric(MetricType.DISTANCE, it)
        }

        // Calories
        extractDouble(record, listOf("activeKilocalories"))?.let {
            builder.metric(MetricType.CALORIES, it)
        }

        // MET
        extractDouble(record, listOf("met"))?.let {
            builder.metaData("met", it.toString())
        }

        // Intensity
        extractDouble(record, listOf("intensity"))?.let {
            builder.metaData("intensity", it.toString())
        }
    }

    private fun extractSleepsMetrics(record: Map<String, Any>, builder: WearMetricsBuilder) {
        // Duration
        extractDouble(record, listOf("durationInSeconds"))?.let {
            builder.metaData("sleep_duration_hours", (it / 3600.0).toString())
        }

        // Sleep stages
        extractDouble(record, listOf("deepSleepDurationInSeconds"))?.let {
            builder.metaData("deep_duration_minutes", (it / 60.0).toString())
        }
        extractDouble(record, listOf("lightSleepDurationInSeconds"))?.let {
            builder.metaData("light_duration_minutes", (it / 60.0).toString())
        }
        extractDouble(record, listOf("remSleepInSeconds"))?.let {
            builder.metaData("rem_duration_minutes", (it / 60.0).toString())
        }
        extractDouble(record, listOf("awakeDurationInSeconds"))?.let {
            builder.metaData("awake_duration_minutes", (it / 60.0).toString())
        }

        // Sleep score
        extractDouble(record, listOf("overallSleepScore", "sleepScores"))?.let {
            builder.metaData("sleep_score", it.toString())
        }

        // Validation
        extractString(record, listOf("validation"))?.let {
            builder.metaData("validation", it)
        }
    }

    private fun extractStressMetrics(record: Map<String, Any>, builder: WearMetricsBuilder) {
        // Stress level
        extractDouble(record, listOf("overallStressLevel", "averageStressLevel"))?.let {
            builder.metric(MetricType.STRESS, it / 100.0)
        }

        // Rest stress duration
        extractDouble(record, listOf("restStressDurationInSeconds"))?.let {
            builder.metaData("rest_stress_minutes", (it / 60.0).toString())
        }

        // Activity stress duration
        extractDouble(record, listOf("activityStressDurationInSeconds"))?.let {
            builder.metaData("activity_stress_minutes", (it / 60.0).toString())
        }

        // Body battery
        extractDouble(record, listOf("bodyBatteryChargedValue"))?.let {
            builder.metaData("body_battery_charged", it.toString())
        }
        extractDouble(record, listOf("bodyBatteryDrainedValue"))?.let {
            builder.metaData("body_battery_drained", it.toString())
        }
    }

    private fun extractHRVMetrics(record: Map<String, Any>, builder: WearMetricsBuilder) {
        // HRV RMSSD
        extractDouble(record, listOf("lastNightAvg", "hrvValue", "weeklyAvg"))?.let {
            builder.metric(MetricType.HRV_RMSSD, it)
        }

        // Last night 5-min high
        extractDouble(record, listOf("lastNight5MinHigh"))?.let {
            builder.metaData("last_night_5min_high", it.toString())
        }

        // Baseline
        extractDouble(record, listOf("baseline"))?.let {
            builder.metaData("baseline", it.toString())
        }

        // Status
        extractString(record, listOf("status"))?.let {
            builder.metaData("status", it)
        }
    }

    private fun extractUserMetricsMetrics(record: Map<String, Any>, builder: WearMetricsBuilder) {
        // VO2 Max
        extractDouble(record, listOf("vo2Max"))?.let {
            builder.metaData("vo2_max", it.toString())
        }

        // VO2 Max Cycling
        extractDouble(record, listOf("vo2MaxCycling"))?.let {
            builder.metaData("vo2_max_cycling", it.toString())
        }

        // Fitness Age
        extractDouble(record, listOf("fitnessAge"))?.let {
            builder.metaData("fitness_age", it.toString())
        }

        // Enhanced flag
        val enhanced = record["enhanced"]
        if (enhanced is Boolean) {
            builder.metaData("enhanced", enhanced.toString())
        }
    }

    private fun extractBodyCompMetrics(record: Map<String, Any>, builder: WearMetricsBuilder) {
        // Weight (grams to kg)
        extractDouble(record, listOf("weightInGrams"))?.let {
            builder.metaData("weight_kg", (it / 1000.0).toString())
        }

        // BMI
        extractDouble(record, listOf("bmi"))?.let {
            builder.metaData("bmi", it.toString())
        }

        // Body fat percentage
        extractDouble(record, listOf("bodyFatPercentage"))?.let {
            builder.metaData("body_fat_percentage", it.toString())
        }

        // Muscle mass
        extractDouble(record, listOf("muscleMassInGrams"))?.let {
            builder.metaData("muscle_mass_kg", (it / 1000.0).toString())
        }

        // Bone mass
        extractDouble(record, listOf("boneMassInGrams"))?.let {
            builder.metaData("bone_mass_kg", (it / 1000.0).toString())
        }

        // Body water percentage
        extractDouble(record, listOf("bodyWaterPercentage"))?.let {
            builder.metaData("body_water_percentage", it.toString())
        }
    }

    private fun extractPulseOxMetrics(record: Map<String, Any>, builder: WearMetricsBuilder) {
        // SpO2 average
        extractDouble(record, listOf("averageSpo2", "spo2Value"))?.let {
            builder.metaData("spo2_average", it.toString())
        }

        // SpO2 lowest
        extractDouble(record, listOf("lowestSpo2"))?.let {
            builder.metaData("spo2_lowest", it.toString())
        }

        // Acclimation state
        extractString(record, listOf("acclimationState"))?.let {
            builder.metaData("acclimation_state", it)
        }
    }

    private fun extractRespirationMetrics(record: Map<String, Any>, builder: WearMetricsBuilder) {
        // Average breathing rate
        extractDouble(record, listOf("avgWakingRespirationValue", "avgSleepRespirationValue"))?.let {
            builder.metaData("avg_respiration_rate", it.toString())
        }

        // Highest
        extractDouble(record, listOf("highestRespirationValue"))?.let {
            builder.metaData("highest_respiration_rate", it.toString())
        }

        // Lowest
        extractDouble(record, listOf("lowestRespirationValue"))?.let {
            builder.metaData("lowest_respiration_rate", it.toString())
        }
    }

    private fun extractHealthSnapshotMetrics(record: Map<String, Any>, builder: WearMetricsBuilder) {
        // Heart rate
        extractDouble(record, listOf("heartRate", "avgHeartRate"))?.let {
            builder.metric(MetricType.HR, it)
        }

        // HRV
        extractDouble(record, listOf("hrv", "hrvSdnn"))?.let {
            builder.metric(MetricType.HRV_SDNN, it)
        }

        // SpO2
        extractDouble(record, listOf("spo2"))?.let {
            builder.metaData("spo2", it.toString())
        }

        // Respiration
        extractDouble(record, listOf("respiration"))?.let {
            builder.metaData("respiration_rate", it.toString())
        }

        // Stress
        extractDouble(record, listOf("stress"))?.let {
            builder.metric(MetricType.STRESS, it / 100.0)
        }
    }

    private fun extractBloodPressureMetrics(record: Map<String, Any>, builder: WearMetricsBuilder) {
        // Systolic
        extractDouble(record, listOf("systolic"))?.let {
            builder.metaData("systolic", it.toString())
        }

        // Diastolic
        extractDouble(record, listOf("diastolic"))?.let {
            builder.metaData("diastolic", it.toString())
        }

        // Pulse
        extractDouble(record, listOf("pulse"))?.let {
            builder.metric(MetricType.HR, it)
        }

        // Source type
        extractString(record, listOf("sourceType"))?.let {
            builder.metaData("source_type", it)
        }
    }

    private fun extractSkinTempMetrics(record: Map<String, Any>, builder: WearMetricsBuilder) {
        // Average deviation
        extractDouble(record, listOf("averageDeviation", "avgSkinTempDeviation"))?.let {
            builder.metaData("skin_temp_deviation_celsius", it.toString())
        }

        // Min deviation
        extractDouble(record, listOf("minSkinTempDeviation"))?.let {
            builder.metaData("skin_temp_min_deviation", it.toString())
        }

        // Max deviation
        extractDouble(record, listOf("maxSkinTempDeviation"))?.let {
            builder.metaData("skin_temp_max_deviation", it.toString())
        }
    }

    // ============= Utility Methods =============

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
                "Not connected to Garmin. Call connect() first."
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

