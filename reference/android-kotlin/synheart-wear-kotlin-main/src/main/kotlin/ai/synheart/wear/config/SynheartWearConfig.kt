package ai.synheart.wear.config

import ai.synheart.wear.models.DeviceAdapter

/**
 * Configuration for SynheartWear SDK
 *
 * @property enabledAdapters Set of device adapters to enable
 * @property enableLocalCaching Whether to cache data locally
 * @property enableEncryption Whether to encrypt cached data
 * @property streamInterval Default streaming interval in milliseconds
 * @property maxCacheSize Maximum cache size in bytes
 * @property maxCacheAge Maximum age of cached data in milliseconds
 * @property cloudConfig Configuration for cloud wearable integration (required for WHOOP, GARMIN, FITBIT)
 */
data class SynheartWearConfig(
    val enabledAdapters: Set<DeviceAdapter> = setOf(DeviceAdapter.HEALTH_CONNECT),
    val enableLocalCaching: Boolean = true,
    val enableEncryption: Boolean = true,
    val streamInterval: Long = 3000L,
    val maxCacheSize: Long = 100 * 1024 * 1024, // 100 MB
    val maxCacheAge: Long = 30L * 24 * 60 * 60 * 1000, // 30 days
    val cloudConfig: CloudConfig? = null
)
