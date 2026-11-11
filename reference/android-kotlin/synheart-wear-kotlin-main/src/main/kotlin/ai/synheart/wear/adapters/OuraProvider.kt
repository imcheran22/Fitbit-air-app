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
 * Oura cloud provider. Reuses the vendor-templated Retrofit endpoints
 * on [WearServiceAPI] with `vendor = "oura"`. OAuth is mediated by the
 * Synheart Wear API; the device never sees Oura access tokens.
 *
 * Public surface mirrors Flutter's `OuraProvider`: readiness / sleep /
 * hrv / activity fetchers; readiness is surfaced as `fetchRecovery` to
 * satisfy the [WearableProvider] contract.
 */
@OptIn(InternalSerializationApi::class)
class OuraProvider internal constructor(
    private val context: Context,
    private val cloudConfig: CloudConfig,
    apiOverride: WearServiceAPI?
) : WearableProvider {

    constructor(context: Context, cloudConfig: CloudConfig) : this(context, cloudConfig, null)

    override val vendor: DeviceAdapter = DeviceAdapter.OURA

    private val api: WearServiceAPI = apiOverride ?: createRetrofitClient()
    private var userId: String? = null

    private val sharedPrefs: SharedPreferences by lazy {
        context.getSharedPreferences("synheart_oura_${cloudConfig.appId}", Context.MODE_PRIVATE)
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
                throw SynheartWearException("Failed to get Oura authorization URL: ${response.code()} ${response.message()}")
            }
            response.body()?.authorizationUrl
                ?: throw SynheartWearException("Empty Oura authorization URL")
        } catch (e: SynheartWearException) {
            throw e
        } catch (e: Exception) {
            throw SynheartWearException("Failed to start Oura OAuth flow: ${e.message}", e)
        }
    }

    override suspend fun connectWithCode(code: String, state: String, redirectUri: String): String =
        withContext(Dispatchers.IO) {
            try {
                val savedState = sharedPrefs.getString("oauth_state", null)
                if (savedState != null && state != savedState) {
                    throw SynheartWearException("Invalid Oura OAuth state parameter")
                }
                val response = api.handleOAuthCallback(
                    vendor = VENDOR,
                    request = OAuthCallbackRequest(code = code, state = state, redirectUri = redirectUri)
                )
                if (!response.isSuccessful) {
                    throw SynheartWearException("Failed to complete Oura OAuth: ${response.code()} ${response.message()}")
                }
                val body = response.body() ?: throw SynheartWearException("Empty Oura callback response")
                userId = body.userId
                sharedPrefs.edit().putString("user_id", body.userId).remove("oauth_state").apply()
                body.userId
            } catch (e: SynheartWearException) {
                throw e
            } catch (e: Exception) {
                throw SynheartWearException("Failed to complete Oura OAuth flow: ${e.message}", e)
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
                android.util.Log.w("OuraProvider", "disconnect notify failed: ${e.message}")
            }
        }
    }

    override suspend fun fetchRecovery(
        startDate: Date?,
        endDate: Date?,
        limit: Int?,
        cursor: String?
    ): List<WearMetrics> = fetchReadiness(startDate, endDate, limit, cursor)

    suspend fun fetchReadiness(
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
                throw SynheartWearException("Failed to fetch Oura readiness: ${response.code()} ${response.message()}")
            }
            val envelope = response.body() ?: throw SynheartWearException("Empty Oura readiness response")
            envelope.records.mapNotNull { record ->
                recordToMetrics(record, "readiness", envelope.vendor, envelope.userId)
            }
        }
    }

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
                throw SynheartWearException("Failed to fetch Oura sleep: ${response.code()} ${response.message()}")
            }
            val envelope = response.body() ?: throw SynheartWearException("Empty Oura sleep response")
            envelope.records.mapNotNull { record ->
                recordToMetrics(record, "sleep", envelope.vendor, envelope.userId)
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
                throw SynheartWearException("Failed to fetch Oura hrv: ${response.code()} ${response.message()}")
            }
            val envelope = response.body() ?: throw SynheartWearException("Empty Oura hrv response")
            envelope.records.mapNotNull { record ->
                recordToMetrics(record, "hrv", envelope.vendor, envelope.userId)
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
            val response = api.getWorkoutData(
                vendor = VENDOR,
                userId = userId!!,
                appId = cloudConfig.appId,
                start = startDate?.toRFC3339(),
                end = endDate?.toRFC3339(),
                limit = limit,
                cursor = cursor
            )
            if (!response.isSuccessful) {
                throw SynheartWearException("Failed to fetch Oura activity: ${response.code()} ${response.message()}")
            }
            val envelope = response.body() ?: throw SynheartWearException("Empty Oura activity response")
            envelope.records.mapNotNull { record ->
                recordToMetrics(record, "activity", envelope.vendor, envelope.userId)
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
        fun putNum(key: String, field: String) {
            (record[field] as? Number)?.let { builder.metaData(key, it.toString()) }
        }
        putNum("hr", "average_heart_rate")
        putNum("hrv", "rmssd")
        putNum("steps", "steps")
        putNum("calories", "active_calories")
        putNum("readiness_score", "score")
        putNum("sleep_duration_s", "total_sleep_duration")
        (record["object_id"] as? String)?.let { builder.metaData("object_id", it) }
            ?: (record["id"] as? String)?.let { builder.metaData("object_id", it) }
        builder.build()
    } catch (e: Exception) {
        android.util.Log.w("OuraProvider", "convert failed: ${e.message}")
        null
    }

    private fun extractTimestamp(record: Map<String, Any>): Long? {
        val keys = listOf("timestamp", "day", "summary_date")
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
                    runCatching {
                        val f = SimpleDateFormat("yyyy-MM-dd", Locale.US)
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
        if (userId == null) throw SynheartWearException("Not connected to Oura. Call connect() first.")
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
        private const val VENDOR = "oura"
    }
}
