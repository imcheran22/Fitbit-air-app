package ai.synheart.wear.cloud.models

import com.google.gson.annotations.SerializedName

/**
 * OAuth authorization response from wear service
 */
internal data class OAuthAuthorizeResponse(
    @SerializedName("authorization_url")
    val authorizationUrl: String
)

/**
 * OAuth callback request to exchange authorization code for tokens
 */
internal data class OAuthCallbackRequest(
    @SerializedName("code")
    val code: String,
    @SerializedName("state")
    val state: String,
    @SerializedName("redirect_uri")
    val redirectUri: String
)

/**
 * OAuth callback response with user_id
 */
internal data class OAuthCallbackResponse(
    @SerializedName("status")
    val status: String,
    @SerializedName("user_id")
    val userId: String
)

/**
 * Recovery data envelope from wear service
 */
internal data class RecoveryEnvelope(
    @SerializedName("vendor")
    val vendor: String,
    @SerializedName("app_id")
    val appId: String,
    @SerializedName("user_id")
    val userId: String,
    @SerializedName("records")
    val records: List<Map<String, Any>>,
    @SerializedName("cursor")
    val cursor: String?
)

/**
 * Sleep data envelope from wear service
 */
internal data class SleepEnvelope(
    @SerializedName("vendor")
    val vendor: String,
    @SerializedName("app_id")
    val appId: String,
    @SerializedName("user_id")
    val userId: String,
    @SerializedName("records")
    val records: List<Map<String, Any>>,
    @SerializedName("cursor")
    val cursor: String?
)

/**
 * Workout data envelope from wear service
 */
internal data class WorkoutEnvelope(
    @SerializedName("vendor")
    val vendor: String,
    @SerializedName("app_id")
    val appId: String,
    @SerializedName("user_id")
    val userId: String,
    @SerializedName("records")
    val records: List<Map<String, Any>>,
    @SerializedName("cursor")
    val cursor: String?
)

/**
 * Cycle data envelope from wear service
 */
internal data class CycleEnvelope(
    @SerializedName("vendor")
    val vendor: String,
    @SerializedName("app_id")
    val appId: String,
    @SerializedName("user_id")
    val userId: String,
    @SerializedName("records")
    val records: List<Map<String, Any>>,
    @SerializedName("cursor")
    val cursor: String?
)

/**
 * Disconnect response
 */
internal data class DisconnectResponse(
    @SerializedName("status")
    val status: String
)

/**
 * API Error response
 */
internal data class APIErrorResponse(
    @SerializedName("code")
    val code: String,
    @SerializedName("message")
    val message: String,
    @SerializedName("details")
    val details: String? = null,
    @SerializedName("field")
    val field: String? = null
)

/**
 * Integration configuration request
 */
internal data class UpsertIntegrationRequest(
    @SerializedName("app_id")
    val appId: String,
    @SerializedName("client_id")
    val clientId: String,
    @SerializedName("client_secret")
    val clientSecret: String,
    @SerializedName("webhook_secret")
    val webhookSecret: String? = null,
    @SerializedName("redirect_uri")
    val redirectUri: String,
    @SerializedName("scopes")
    val scopes: List<String>,
    @SerializedName("app_webhook_url")
    val appWebhookUrl: String? = null
)

/**
 * Integration configuration response
 */
internal data class IntegrationResponse(
    @SerializedName("id")
    val id: String,
    @SerializedName("app_id")
    val appId: String,
    @SerializedName("vendor")
    val vendor: String,
    @SerializedName("status")
    val status: String,
    @SerializedName("redirect_uri")
    val redirectUri: String,
    @SerializedName("scopes")
    val scopes: List<String>,
    @SerializedName("app_webhook_url")
    val appWebhookUrl: String? = null,
    @SerializedName("created_at")
    val createdAt: String,
    @SerializedName("updated_at")
    val updatedAt: String
)

// ============= Garmin-Specific Models =============

/**
 * Generic Garmin data envelope
 * Used for all 12 Garmin summary types
 */
internal data class GarminDataEnvelope(
    @SerializedName("vendor")
    val vendor: String,
    @SerializedName("app_id")
    val appId: String,
    @SerializedName("user_id")
    val userId: String,
    @SerializedName("summary_type")
    val summaryType: String,
    @SerializedName("records")
    val records: List<Map<String, Any>>,
    @SerializedName("cursor")
    val cursor: String? = null
)

/**
 * Garmin backfill request
 * Used to request historical data (max 90 days per request)
 */
internal data class GarminBackfillRequest(
    @SerializedName("app_id")
    val appId: String,
    @SerializedName("start")
    val start: String,  // RFC3339 format
    @SerializedName("end")
    val end: String     // RFC3339 format
)

/**
 * Garmin backfill response
 */
internal data class GarminBackfillResponse(
    @SerializedName("status")
    val status: String,
    @SerializedName("message")
    val message: String,
    @SerializedName("user_id")
    val userId: String,
    @SerializedName("summary_type")
    val summaryType: String,
    @SerializedName("start")
    val start: String,
    @SerializedName("end")
    val end: String
)

/**
 * Garmin webhook URLs response
 * Contains URLs for all 12 summary types plus deregistration
 */
internal data class GarminWebhookURLsResponse(
    @SerializedName("app_id")
    val appId: String,
    @SerializedName("base_url")
    val baseUrl: String,
    @SerializedName("endpoints")
    val endpoints: Map<String, String>,
    @SerializedName("instructions")
    val instructions: String? = null
)

/**
 * Garmin user permissions response
 */
internal data class GarminUserPermissionsResponse(
    val permissions: List<String>
)

/**
 * Garmin user ID response
 */
internal data class GarminUserIdResponse(
    @SerializedName("user_id")
    val userId: String
)

