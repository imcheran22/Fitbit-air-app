package ai.synheart.wear.adapters

import android.content.Context
import android.content.SharedPreferences
import ai.synheart.wear.SynheartWearException
import ai.synheart.wear.cloud.WearServiceAPI
import ai.synheart.wear.cloud.models.OAuthCallbackRequest
import ai.synheart.wear.config.CloudConfig
import ai.synheart.wear.models.DeviceAdapter
import ai.synheart.wear.models.WearMetrics
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
 * Fitbit cloud provider. Routes through the existing vendor-templated
 * Retrofit endpoints on [WearServiceAPI] (`/v1/{vendor}/...`) with
 * `vendor = "fitbit"`. The Synheart Wear API mediates OAuth — the device
 * never sees Fitbit access tokens.
 *
 * Mirrors the public surface of the Flutter `FitbitProvider`: hrv / sleep /
 * activity fetchers, deep-link OAuth completion via [connectWithCode].
 */
@OptIn(InternalSerializationApi::class)
class FitbitProvider internal constructor(
    private val context: Context,
    private val cloudConfig: CloudConfig,
    apiOverride: WearServiceAPI?
) : WearableProvider {

    constructor(context: Context, cloudConfig: CloudConfig) : this(context, cloudConfig, null)

    override val vendor: DeviceAdapter = DeviceAdapter.FITBIT

    private val api: WearServiceAPI = apiOverride ?: createRetrofitClient()
    private var userId: String? = null

    private val sharedPrefs: SharedPreferences by lazy {
        context.getSharedPreferences("synheart_fitbit_${cloudConfig.appId}", Context.MODE_PRIVATE)
    }

    init {
        userId = sharedPrefs.getString("user_id", null)
    }

    override fun isConnected(): Boolean = userId != null
    override fun getUserId(): String? = userId

    override suspend fun connect(): String = withContext(Dispatchers.IO) {
        try {
            val state = UUID.randomUUID().toString()
            sharedPrefs.edit().putString("oauth_state", state).apply()
            val response = api.getAuthorizationUrl(
                vendor = VENDOR,
                redirectUri = cloudConfig.redirectUri,
                state = state,
                appId = cloudConfig.appId
            )
            if (!response.isSuccessful) {
                throw SynheartWearException("Failed to get Fitbit authorization URL: ${response.code()} ${response.message()}")
            }
            response.body()?.authorizationUrl
                ?: throw SynheartWearException("Empty Fitbit authorization URL")
        } catch (e: SynheartWearException) {
            throw e
        } catch (e: Exception) {
            throw SynheartWearException("Failed to start Fitbit OAuth flow: ${e.message}", e)
        }
    }

    override suspend fun connectWithCode(code: String, state: String, redirectUri: String): String =
        withContext(Dispatchers.IO) {
            try {
                val savedState = sharedPrefs.getString("oauth_state", null)
                if (savedState != null && state != savedState) {
                    throw SynheartWearException("Invalid Fitbit OAuth state parameter")
                }
                val response = api.handleOAuthCallback(
                    vendor = VENDOR,
                    request = OAuthCallbackRequest(code = code, state = state, redirectUri = redirectUri)
                )
                if (!response.isSuccessful) {
                    throw SynheartWearException("Failed to complete Fitbit OAuth: ${response.code()} ${response.message()}")
                }
                val body = response.body() ?: throw SynheartWearException("Empty Fitbit callback response")
                userId = body.userId
                sharedPrefs.edit().putString("user_id", body.userId).remove("oauth_state").apply()
                body.userId
            } catch (e: SynheartWearException) {
                throw e
            } catch (e: Exception) {
                throw SynheartWearException("Failed to complete Fitbit OAuth flow: ${e.message}", e)
            }
        }

    override suspend fun disconnect() {
        withContext(Dispatchers.IO) {
            val current = userId ?: return@withContext
            userId = null
            sharedPrefs.edit().remove("user_id").apply()
            try {
                api.disconnect(vendor = VENDOR, userId = current, appId = cloudConfig.appId)
            } catch (e: Exception) {
                android.util.Log.w("FitbitProvider", "disconnect notify failed: ${e.message}")
            }
        }
    }

    /**
     * Fitbit has no native "recovery" concept; we surface the most recent
     * sleep record as a stand-in, matching how Flutter callers commonly
     * use Fitbit data for recovery analysis.
     */
    override suspend fun fetchRecovery(
        startDate: Date?,
        endDate: Date?,
        limit: Int?,
        cursor: String?
    ): List<WearMetrics> = fetchSleep(startDate, endDate, limit, cursor)

    suspend fun fetchSleep(
        startDate: Date? = null,
        endDate: Date? = null,
        limit: Int? = null,
        cursor: String? = null
    ): List<WearMetrics> {
        ensureConnected()
        return withContext(Dispatchers.IO) {
            val response = api.getSleepData(
                vendor = VENDOR,
                userId = userId!!,
                appId = cloudConfig.appId,
                start = startDate?.toRFC3339(),
                end = endDate?.toRFC3339(),
                limit = limit,
                cursor = cursor
            )
            if (!response.isSuccessful) {
                throw SynheartWearException("Failed to fetch Fitbit sleep: ${response.code()} ${response.message()}")
            }
            val envelope = response.body() ?: throw SynheartWearException("Empty Fitbit sleep response")
            envelope.records.mapNotNull { record ->
                recordToMetrics(record, "sleep", envelope.vendor, envelope.userId)
            }
        }
    }

    suspend fun fetchActivity(
        startDate: Date? = null,
        endDate: Date? = null,
        limit: Int? = null,
        cursor: String? = null
    ): List<WearMetrics> {
        ensureConnected()
        return withContext(Dispatchers.IO) {
            val response = api.getRecoveryData(
                vendor = VENDOR,
                userId = userId!!,
                appId = cloudConfig.appId,
                start = startDate?.toRFC3339(),
                end = endDate?.toRFC3339(),
                limit = limit,
                cursor = cursor
            )
            if (!response.isSuccessful) {
                throw SynheartWearException("Failed to fetch Fitbit activity: ${response.code()} ${response.message()}")
            }
            val envelope = response.body() ?: throw SynheartWearException("Empty Fitbit activity response")
            envelope.records.mapNotNull { record ->
                recordToMetrics(record, "activity", envelope.vendor, envelope.userId)
            }
        }
    }

    suspend fun fetchHrv(
        startDate: Date? = null,
        endDate: Date? = null,
        limit: Int? = null,
        cursor: String? = null
    ): List<WearMetrics> {
        ensureConnected()
        return withContext(Dispatchers.IO) {
            val response = api.getRecoveryData(
                vendor = VENDOR,
                userId = userId!!,
                appId = cloudConfig.appId,
                start = startDate?.toRFC3339(),
                end = endDate?.toRFC3339(),
                limit = limit,
                cursor = cursor
            )
            if (!response.isSuccessful) {
                throw SynheartWearException("Failed to fetch Fitbit hrv: ${response.code()} ${response.message()}")
            }
            val envelope = response.body() ?: throw SynheartWearException("Empty Fitbit hrv response")
            envelope.records.mapNotNull { record ->
                recordToMetrics(record, "hrv", envelope.vendor, envelope.userId)
            }
        }
    }

    private fun recordToMetrics(
        record: Map<String, Any>,
        dataType: String,
        vendor: String,
        userId: String
    ): WearMetrics? = try {
        val ts = extractTimestamp(record) ?: System.currentTimeMillis()
        val deviceId = (record["device_id"] as? String) ?: "${vendor}_${userId.take(8)}"
        val builder = WearMetrics.builder()
            .timestamp(ts)
            .deviceId(deviceId)
            .source("${vendor}_$dataType")
            .metaData("data_type", dataType)
            .metaData("vendor", vendor)
        (record["summary"] as? Map<*, *>)?.let { summary ->
            (summary["steps"] as? Number)?.let { builder.metaData("steps", it.toString()) }
            (summary["caloriesOut"] as? Number)?.let { builder.metaData("calories", it.toString()) }
        }
        (record["value"] as? Map<*, *>)?.let { value ->
            (value["restingHeartRate"] as? Number)?.let { builder.metaData("hr_resting", it.toString()) }
        }
        builder.build()
    } catch (e: Exception) {
        android.util.Log.w("FitbitProvider", "convert failed: ${e.message}")
        null
    }

    private fun extractTimestamp(record: Map<String, Any>): Long? {
        val keys = listOf("dateTime", "date", "timestamp", "start_time")
        for (key in keys) {
            val v = record[key] ?: continue
            when (v) {
                is String -> {
                    runCatching {
                        val f = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
                        f.timeZone = TimeZone.getTimeZone("UTC")
                        f.parse(v)?.time
                    }.getOrNull()?.let { return it }
                    runCatching {
                        val f = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
                        f.timeZone = TimeZone.getTimeZone("UTC")
                        f.parse(v)?.time
                    }.getOrNull()?.let { return it }
                }
                is Number -> return v.toLong()
            }
        }
        return null
    }

    private fun ensureConnected() {
        if (userId == null) throw SynheartWearException("Not connected to Fitbit. Call connect() first.")
    }

    private fun createRetrofitClient(): WearServiceAPI {
        val logging = HttpLoggingInterceptor().apply {
            level = if (cloudConfig.enableDebugLogging) HttpLoggingInterceptor.Level.BODY
            else HttpLoggingInterceptor.Level.NONE
        }
        val client = OkHttpClient.Builder()
            .addInterceptor(logging)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()
        val gson = GsonBuilder().setLenient().create()
        return Retrofit.Builder()
            .baseUrl(cloudConfig.baseUrl)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()
            .create(WearServiceAPI::class.java)
    }

    private fun Date.toRFC3339(): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        return sdf.format(this)
    }

    companion object {
        private const val VENDOR = "fitbit"
    }
}
