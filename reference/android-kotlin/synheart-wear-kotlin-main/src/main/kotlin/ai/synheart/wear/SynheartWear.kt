package ai.synheart.wear

import android.content.Context
import ai.synheart.wear.config.SynheartWearConfig
import ai.synheart.wear.models.*
import ai.synheart.wear.adapters.HealthConnectAdapter
import ai.synheart.wear.adapters.WearAdapter
import ai.synheart.wear.adapters.WhoopProvider
import ai.synheart.wear.adapters.GarminProvider
import ai.synheart.wear.adapters.FitbitProvider
import ai.synheart.wear.adapters.OuraProvider
import ai.synheart.wear.adapters.WearableProvider
import ai.synheart.wear.adapters.BleHrmProvider
import ai.synheart.wear.adapters.GarminHealth
import ai.synheart.wear.cache.LocalCache
import ai.synheart.wear.consent.ConsentManager
import ai.synheart.wear.internal.RealtimeReadGate
import ai.synheart.wear.normalization.Normalizer
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.delay
import kotlinx.serialization.InternalSerializationApi

/**
 * Main SynheartWear SDK class implementing RFC specifications
 *
 * Provides unified access to biometric data from multiple wearable devices
 * with standardized output format, encryption, and privacy controls.
 *
 * @param context Android application context
 * @param config SDK configuration
 */
@OptIn(InternalSerializationApi::class)
/** Minimum spacing of real-time Health Connect reads; see `healthStoreGate`. */
private const val HEALTH_STORE_MIN_INTERVAL_MS = 10_000L

/** Minimum spacing of real-time cloud recovery fetches; see `cloudRecoveryGate`. */
private const val CLOUD_RECOVERY_MIN_INTERVAL_MS = 15 * 60_000L

class SynheartWear(
    private val context: Context,
    private val config: SynheartWearConfig = SynheartWearConfig()
) {
    private var initialized = false
    private val normalizer = Normalizer()
    private val consentManager = ConsentManager(context)
    private val localCache = LocalCache(context, config.enableEncryption)

    // Wearable providers for cloud integrations
    private var whoopProvider: WhoopProvider? = null
    private var garminProvider: GarminProvider? = null
    private var fitbitProvider: FitbitProvider? = null
    private var ouraProvider: OuraProvider? = null

    /** Fitbit cloud provider for OAuth + data fetch via the Synheart Wear API */
    val fitbit: FitbitProvider? get() = fitbitProvider

    /** Oura ring cloud provider for OAuth + data fetch via the Synheart Wear API */
    val oura: OuraProvider? get() = ouraProvider

    // BLE HRM provider
    private var _bleHrmProvider: BleHrmProvider? = null

    /**
     * Real-time reads are the streaming ticks (`streamHR` / `streamHRV`, every
     * 1-3 s). Health Connect is a sync store with a per-app read quota that
     * receives watch data in batches seconds to minutes apart, and each read
     * is five queries (HR, HRV, steps, calories, distance), so ticks faster
     * than this only spend quota re-reading the same samples.
     */
    private val healthStoreGate = RealtimeReadGate(HEALTH_STORE_MIN_INTERVAL_MS)

    /**
     * Cloud recovery records (WHOOP, Garmin, Fitbit, Oura) change a few times
     * a day; fetching them over the network on every streaming tick was pure
     * load on the vendor APIs and the device radio.
     */
    private val cloudRecoveryGate = RealtimeReadGate(CLOUD_RECOVERY_MIN_INTERVAL_MS)

    // Garmin Health SDK provider (native device integration)
    private var _garminHealth: GarminHealth? = null

    /** BLE Heart Rate Monitor provider for direct BLE sensor access */
    val bleHrm: BleHrmProvider? get() = _bleHrmProvider

    /**
     * Garmin Health SDK provider for native device integration (scan, pair, stream)
     *
     * Available when a [GarminHealth] instance is provided via [setGarminHealth].
     * The Garmin Health SDK real-time streaming (RTS) capability requires a
     * separate license from Garmin. This facade is available on demand for
     * licensed integrations. The underlying native SDK code is proprietary
     * to Garmin and is not distributed as open source.
     */
    val garminHealth: GarminHealth? get() = _garminHealth

    /**
     * Set the Garmin Health SDK provider for native device integration
     *
     * @param garminHealth A configured GarminHealth instance with a valid Garmin SDK license key
     */
    fun setGarminHealth(garminHealth: GarminHealth) {
        _garminHealth = garminHealth
    }

    private val adapterRegistry: Map<DeviceAdapter, WearAdapter> by lazy {
        val adapters = mutableMapOf<DeviceAdapter, WearAdapter>(
            DeviceAdapter.HEALTH_CONNECT to HealthConnectAdapter(context)
        )

        // Initialize cloud providers if cloud config is provided.
        // Cloud providers are accessed via getProvider(vendor) and the
        // sdk.{whoop,garmin,fitbit,oura} accessors — they do not register
        // as WearAdapters; readMetrics() pulls from each provider directly.
        config.cloudConfig?.let { cloudConfig ->
            if (DeviceAdapter.WHOOP in config.enabledAdapters) {
                whoopProvider = WhoopProvider(context, cloudConfig)
            }
            if (DeviceAdapter.GARMIN in config.enabledAdapters) {
                garminProvider = GarminProvider(context, cloudConfig)
            }
            if (DeviceAdapter.FITBIT in config.enabledAdapters) {
                fitbitProvider = FitbitProvider(context, cloudConfig)
            }
            if (DeviceAdapter.OURA in config.enabledAdapters) {
                ouraProvider = OuraProvider(context, cloudConfig)
            }
        }

        // Initialize BLE HRM provider if enabled
        if (DeviceAdapter.BLE_HRM in config.enabledAdapters) {
            _bleHrmProvider = BleHrmProvider(context)
        }

        adapters.toMap()
    }

    /**
     * Initialize the SDK with permissions and setup
     *
     * This must be called before any other SDK methods.
     * Requests necessary permissions and initializes enabled adapters.
     *
     * @throws SynheartWearException if initialization fails
     */
    suspend fun initialize() {
        if (initialized) return

        try {
            // Initialize consent manager
            consentManager.initialize()

            // Initialize adapters
            enabledAdapters().forEach { adapter ->
                adapter.initialize()
            }

            initialized = true
        } catch (e: Exception) {
            throw SynheartWearException("Failed to initialize SynheartWear: ${e.message}", e)
        }
    }

    /**
     * Request specific permissions from the user
     *
     * @param permissions Set of permission types to request
     * @return Map of permission types to granted status
     */
    suspend fun requestPermissions(
        permissions: Set<PermissionType>
    ): Map<PermissionType, Boolean> {
        ensureInitialized()

        val results = mutableMapOf<PermissionType, Boolean>()

        enabledAdapters().forEach { adapter ->
            val adapterResults = adapter.requestPermissions(permissions)
            results.putAll(adapterResults)
        }

        return results
    }

    /**
     * Get current permission status
     *
     * @return Map of permission types to granted status
     */
    fun getPermissionStatus(): Map<PermissionType, Boolean> {
        ensureInitialized()

        val status = mutableMapOf<PermissionType, Boolean>()

        enabledAdapters().forEach { adapter ->
            status.putAll(adapter.getPermissionStatus())
        }

        return status
    }

    /**
     * Read current biometric metrics from all enabled adapters
     *
     * Reads metrics from all available sources (Health Connect and connected cloud providers)
     * and merges them into a unified WearMetrics object.
     *
     * @param isRealTime Whether to read real-time data or historical snapshot
     * @return Unified WearMetrics containing all available biometric data
     * @throws SynheartWearException if metrics cannot be read
     */
    @OptIn(InternalSerializationApi::class)
    suspend fun readMetrics(isRealTime: Boolean = false): WearMetrics {
        ensureInitialized()

        try {
            // Validate consents
            consentManager.validateConsents(getRequiredPermissions())

            val allMetrics = mutableListOf<WearMetrics>()

            val nowMs = System.currentTimeMillis()

            // Gather data from enabled adapters (Health Connect, etc.). A
            // real-time tick inside the health-store interval skips them.
            val readHealthStore = !isRealTime || healthStoreGate.tryAcquire(nowMs)
            val adapters = if (readHealthStore) enabledAdapters() else emptyList()
            val adapterData = adapters.mapNotNull { adapter ->
                try {
                    adapter.readSnapshot(isRealTime)
                } catch (e: Exception) {
                    // Log but continue with other adapters
                    android.util.Log.w("SynheartWear", "Failed to read from adapter: ${e.message}")
                    null
                }
            }
            allMetrics.addAll(adapterData)

            // Read latest record from each connected cloud provider.
            // Failures here log a warning but never fail the snapshot —
            // we always continue with whatever other sources are available.
            val now = java.util.Date()
            val yesterday = java.util.Date(System.currentTimeMillis() - 24 * 60 * 60 * 1000)
            suspend fun pullLatest(name: String, provider: WearableProvider?) {
                if (provider == null || !provider.isConnected()) return
                try {
                    val data = provider.fetchRecovery(startDate = yesterday, endDate = now, limit = 1)
                    if (data.isNotEmpty()) allMetrics.add(data.first())
                } catch (e: Exception) {
                    android.util.Log.w("SynheartWear", "Failed to read $name metrics: ${e.message}")
                }
            }
            if (!isRealTime || cloudRecoveryGate.tryAcquire(nowMs)) {
                if (DeviceAdapter.WHOOP  in config.enabledAdapters) pullLatest("WHOOP",  whoopProvider)
                if (DeviceAdapter.GARMIN in config.enabledAdapters) pullLatest("Garmin", garminProvider)
                if (DeviceAdapter.FITBIT in config.enabledAdapters) pullLatest("Fitbit", fitbitProvider)
                if (DeviceAdapter.OURA   in config.enabledAdapters) pullLatest("Oura",   ouraProvider)
            }

            // Include BLE HRM last sample if connected
            _bleHrmProvider?.let { bleProvider ->
                if (bleProvider.isConnected()) {
                    bleProvider.lastSample?.let { sample ->
                        allMetrics.add(sample.toWearMetrics())
                    }
                }
            }

            // Merge all metrics from different sources
            val mergedData = if (allMetrics.isEmpty()) {
                // No data available from any source
                WearMetrics.builder()
                    .timestamp(System.currentTimeMillis())
                    .deviceId("unknown")
                    .source("none")
                    .metaData("error", "No data sources available")
                    .build()
            } else if (allMetrics.size == 1) {
                // Only one source available
                allMetrics.first()
            } else {
                // Multiple sources - merge them
                normalizer.mergeSnapshots(allMetrics)
            }

            // Validate data quality
            if (!normalizer.validateMetrics(mergedData)) {
                throw SynheartWearException("Invalid metrics data received")
            }

            // Cache data if enabled
            if (config.enableLocalCaching) {
                localCache.storeSession(mergedData)
            }

            return mergedData
        } catch (e: SynheartWearException) {
            throw e
        } catch (e: Exception) {
            throw SynheartWearException("Failed to read metrics: ${e.message}", e)
        }
    }

    /**
     * Stream real-time heart rate data
     *
     * @param intervalMs Polling interval in milliseconds (default: from config)
     * @return Flow of WearMetrics with updated HR data
     */
    fun streamHR(intervalMs: Long = config.streamInterval): Flow<WearMetrics> = flow {
        ensureInitialized()

        while (true) {
            try {
                val metrics = readMetrics(isRealTime = true)
                emit(metrics)
            } catch (e: Exception) {
                // Continue streaming even on errors
            }
            delay(intervalMs)
        }
    }

    /**
     * Stream HRV data in configurable windows
     *
     * @param windowMs Window size in milliseconds for HRV calculation
     * @return Flow of WearMetrics with updated HRV data
     */
    fun streamHRV(windowMs: Long = 5000L): Flow<WearMetrics> = flow {
        ensureInitialized()

        while (true) {
            try {
                val metrics = readMetrics(isRealTime = true)
                emit(metrics)
            } catch (e: Exception) {
                // Continue streaming even on errors
            }
            delay(windowMs)
        }
    }

    /**
     * Get cached biometric sessions
     *
     * @param startDateMs Start date in milliseconds since epoch
     * @param endDateMs End date in milliseconds since epoch (default: now)
     * @param limit Maximum number of sessions to return
     * @return List of cached WearMetrics
     */
    suspend fun getCachedSessions(
        startDateMs: Long,
        endDateMs: Long = System.currentTimeMillis(),
        limit: Int = 100
    ): List<WearMetrics> {
        ensureInitialized()
        return localCache.getSessions(startDateMs, endDateMs, limit)
    }

    /**
     * Get cache statistics
     *
     * @return Map containing cache statistics
     */
    suspend fun getCacheStats(): Map<String, Any> {
        ensureInitialized()
        return localCache.getStats()
    }

    /**
     * Clear old cached data
     *
     * @param maxAgeMs Maximum age of data to keep in milliseconds
     */
    suspend fun clearOldCache(maxAgeMs: Long = 30L * 24 * 60 * 60 * 1000) {
        ensureInitialized()
        localCache.clearOldData(maxAgeMs)
    }

    /**
     * Purge all cached data (GDPR compliance)
     */
    suspend fun purgeAllData() {
        ensureInitialized()
        localCache.purgeAll()
        consentManager.revokeAllConsents()
    }

    /**
     * Get wearable provider for a specific vendor
     *
     * Provides access to vendor-specific provider with dedicated methods
     * for that vendor (e.g., WhoopProvider for WHOOP)
     *
     * @param vendor Device adapter type (e.g., WHOOP)
     * @return WearableProvider instance or null if not enabled/configured
     * @throws SynheartWearException if provider is not available
     */
    fun getProvider(vendor: DeviceAdapter): WearableProvider {
        ensureInitialized()
        
        return when (vendor) {
            DeviceAdapter.WHOOP -> whoopProvider
                ?: throw SynheartWearException("WHOOP provider not configured. Please provide cloudConfig in SynheartWearConfig.")
            DeviceAdapter.GARMIN -> garminProvider
                ?: throw SynheartWearException("Garmin provider not configured. Please provide cloudConfig in SynheartWearConfig.")
            DeviceAdapter.FITBIT -> fitbitProvider
                ?: throw SynheartWearException("Fitbit provider not configured. Add FITBIT to SynheartWearConfig.enabledAdapters and provide cloudConfig.")
            DeviceAdapter.OURA -> ouraProvider
                ?: throw SynheartWearException("Oura provider not configured. Add OURA to SynheartWearConfig.enabledAdapters and provide cloudConfig.")
            else ->
                throw SynheartWearException("Provider for $vendor not available.")
        }
    }

    /**
     * Check if a cloud wearable is enabled and configured
     *
     * @param vendor Device adapter type (WHOOP, GARMIN, FITBIT)
     * @return True if cloud adapter is enabled and configured
     */
    fun isCloudAdapterEnabled(vendor: DeviceAdapter): Boolean {
        return vendor in config.enabledAdapters && config.cloudConfig != null
    }
    
    /**
     * Read metrics from a specific provider without merging
     *
     * Useful for provider-specific data or historical queries
     *
     * @param vendor Device adapter type (e.g., WHOOP)
     * @param startDate Start date for data query (optional)
     * @param endDate End date for data query (optional)
     * @param limit Maximum number of records (optional)
     * @return List of WearMetrics from the specified provider
     */
    suspend fun readMetricsFromProvider(
        vendor: DeviceAdapter,
        startDate: java.util.Date? = null,
        endDate: java.util.Date? = null,
        limit: Int? = null
    ): List<WearMetrics> {
        ensureInitialized()
        
        return when (vendor) {
            DeviceAdapter.WHOOP -> {
                val provider = whoopProvider
                    ?: throw SynheartWearException("WHOOP provider not configured")
                if (!provider.isConnected()) {
                    throw SynheartWearException("Not connected to WHOOP. Call getProvider(WHOOP).connect() first.")
                }
                provider.fetchRecovery(startDate, endDate, limit)
            }
            DeviceAdapter.GARMIN -> {
                val provider = garminProvider
                    ?: throw SynheartWearException("Garmin provider not configured")
                if (!provider.isConnected()) {
                    throw SynheartWearException("Not connected to Garmin. Call getProvider(GARMIN).connect() first.")
                }
                provider.fetchRecovery(startDate, endDate, limit)
            }
            DeviceAdapter.FITBIT -> {
                val provider = fitbitProvider
                    ?: throw SynheartWearException("Fitbit provider not configured")
                if (!provider.isConnected()) {
                    throw SynheartWearException("Not connected to Fitbit. Call getProvider(FITBIT).connect() first.")
                }
                provider.fetchRecovery(startDate, endDate, limit)
            }
            DeviceAdapter.OURA -> {
                val provider = ouraProvider
                    ?: throw SynheartWearException("Oura provider not configured")
                if (!provider.isConnected()) {
                    throw SynheartWearException("Not connected to Oura. Call getProvider(OURA).connect() first.")
                }
                provider.fetchRecovery(startDate, endDate, limit)
            }
            DeviceAdapter.BLE_HRM -> {
                val ble = _bleHrmProvider ?: return emptyList()
                ble.lastSample?.toWearMetrics()?.let { listOf(it) } ?: emptyList()
            }
            DeviceAdapter.HEALTH_CONNECT -> {
                // For Health Connect, return current metrics
                listOf(readMetrics())
            }
            else -> throw SynheartWearException("Provider for $vendor not yet implemented.")
        }
    }

    // Private helper methods

    private fun ensureInitialized() {
        if (!initialized) {
            throw SynheartWearException("SDK not initialized. Call initialize() first.")
        }
    }

    private fun enabledAdapters(): List<WearAdapter> {
        return config.enabledAdapters.mapNotNull { adapterRegistry[it] }
    }

    private fun getRequiredPermissions(): Set<PermissionType> {
        return setOf(
            PermissionType.HEART_RATE,
            PermissionType.HRV,
            PermissionType.STEPS,
            PermissionType.CALORIES
        )
    }
}

/**
 * Exception thrown by SynheartWear SDK
 *
 * @property code Error code for programmatic handling
 */
class SynheartWearException(
    message: String,
    cause: Throwable? = null,
    val code: String? = null
) : Exception(message, cause)
