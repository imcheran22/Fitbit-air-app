package ai.synheart.wear.config

/**
 * Configuration for cloud wearable integration
 *
 * @property baseUrl Base URL of the Synheart Wear Service backend
 * @property appId Application ID for multi-tenant support
 * @property redirectUri OAuth redirect URI for deep link callback (default: synheart://oauth/callback)
 * @property organizationId Organization ID (optional)
 * @property enableDebugLogging Enable HTTP debug logging
 */
data class CloudConfig(
    val baseUrl: String = "https://api.synheart.ai/wear",
    val appId: String,
    val redirectUri: String = "synheart://oauth/callback",
    val organizationId: String? = null,
    val enableDebugLogging: Boolean = false
)

