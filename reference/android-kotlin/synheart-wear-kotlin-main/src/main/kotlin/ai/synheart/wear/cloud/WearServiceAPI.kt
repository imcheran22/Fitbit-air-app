package ai.synheart.wear.cloud

import ai.synheart.wear.cloud.models.*
import retrofit2.Response
import retrofit2.http.*

/**
 * Retrofit API interface for Synheart Wear Service
 *
 * This interface defines all REST API endpoints for communicating
 * with the wear service backend for cloud-based wearable integration.
 *
 * Supports multiple vendors:
 * - WHOOP: Standard OAuth2, direct data queries
 * - Garmin: OAuth2 PKCE, webhook-based data delivery, 12 summary types
 */
internal interface WearServiceAPI {

    // ============= OAuth Endpoints =============

    /**
     * Get OAuth authorization URL for a vendor
     *
     * For WHOOP: Returns standard OAuth2 authorization URL
     * For Garmin: Returns OAuth2 PKCE authorization URL (service handles code_verifier)
     *
     * @param vendor Vendor type (whoop, garmin, fitbit)
     * @param redirectUri OAuth redirect URI (for Garmin, this is the app's deep link)
     * @param state OAuth state parameter for CSRF protection
     * @param appId Application ID
     * @param userId User ID (optional)
     */
    @GET("/v1/{vendor}/oauth/authorize")
    suspend fun getAuthorizationUrl(
        @Path("vendor") vendor: String,
        @Query("redirect_uri") redirectUri: String,
        @Query("state") state: String,
        @Query("app_id") appId: String,
        @Query("user_id") userId: String? = null
    ): Response<OAuthAuthorizeResponse>

    /**
     * Handle OAuth callback - exchange authorization code for tokens
     *
     * @param vendor Vendor type (whoop, garmin, fitbit)
     * @param request OAuth callback request containing code, state, and redirect_uri
     */
    @POST("/v1/{vendor}/oauth/callback")
    suspend fun handleOAuthCallback(
        @Path("vendor") vendor: String,
        @Body request: OAuthCallbackRequest
    ): Response<OAuthCallbackResponse>

    /**
     * Disconnect user from vendor
     *
     * @param vendor Vendor type (whoop, garmin, fitbit)
     * @param userId User ID
     * @param appId Application ID
     */
    @DELETE("/v1/{vendor}/oauth/disconnect")
    suspend fun disconnect(
        @Path("vendor") vendor: String,
        @Query("user_id") userId: String,
        @Query("app_id") appId: String
    ): Response<DisconnectResponse>

    // ============= Data Endpoints =============

    /**
     * Fetch recovery data for a user
     *
     * @param vendor Vendor type (whoop, garmin, fitbit)
     * @param userId User ID
     * @param appId Application ID
     * @param start Start time (RFC3339)
     * @param end End time (RFC3339)
     * @param limit Number of records (default: 100, max: 1000)
     * @param cursor Pagination cursor
     */
    @GET("/v1/{vendor}/data/{user_id}/recovery")
    suspend fun getRecoveryData(
        @Path("vendor") vendor: String,
        @Path("user_id") userId: String,
        @Query("app_id") appId: String,
        @Query("start") start: String? = null,
        @Query("end") end: String? = null,
        @Query("limit") limit: Int? = null,
        @Query("cursor") cursor: String? = null
    ): Response<RecoveryEnvelope>

    /**
     * Fetch sleep data for a user
     *
     * @param vendor Vendor type (whoop, garmin, fitbit)
     * @param userId User ID
     * @param appId Application ID
     * @param start Start time (RFC3339)
     * @param end End time (RFC3339)
     * @param limit Number of records (default: 100, max: 1000)
     * @param cursor Pagination cursor
     */
    @GET("/v1/{vendor}/data/{user_id}/sleep")
    suspend fun getSleepData(
        @Path("vendor") vendor: String,
        @Path("user_id") userId: String,
        @Query("app_id") appId: String,
        @Query("start") start: String? = null,
        @Query("end") end: String? = null,
        @Query("limit") limit: Int? = null,
        @Query("cursor") cursor: String? = null
    ): Response<SleepEnvelope>

    /**
     * Fetch workout data for a user
     *
     * @param vendor Vendor type (whoop, garmin, fitbit)
     * @param userId User ID
     * @param appId Application ID
     * @param start Start time (RFC3339)
     * @param end End time (RFC3339)
     * @param limit Number of records (default: 100, max: 1000)
     * @param cursor Pagination cursor
     */
    @GET("/v1/{vendor}/data/{user_id}/workouts")
    suspend fun getWorkoutData(
        @Path("vendor") vendor: String,
        @Path("user_id") userId: String,
        @Query("app_id") appId: String,
        @Query("start") start: String? = null,
        @Query("end") end: String? = null,
        @Query("limit") limit: Int? = null,
        @Query("cursor") cursor: String? = null
    ): Response<WorkoutEnvelope>

    /**
     * Fetch cycle data for a user
     *
     * @param vendor Vendor type (whoop, garmin, fitbit)
     * @param userId User ID
     * @param appId Application ID
     * @param start Start time (RFC3339)
     * @param end End time (RFC3339)
     * @param limit Number of records (default: 100, max: 1000)
     * @param cursor Pagination cursor
     */
    @GET("/v1/{vendor}/data/{user_id}/cycles")
    suspend fun getCycleData(
        @Path("vendor") vendor: String,
        @Path("user_id") userId: String,
        @Query("app_id") appId: String,
        @Query("start") start: String? = null,
        @Query("end") end: String? = null,
        @Query("limit") limit: Int? = null,
        @Query("cursor") cursor: String? = null
    ): Response<CycleEnvelope>

    // ============= Integration Endpoints =============

    /**
     * Create or update vendor integration
     *
     * @param vendor Vendor type (whoop, garmin, fitbit)
     * @param request Integration configuration
     */
    @POST("/v1/integrations/{vendor}")
    suspend fun upsertIntegration(
        @Path("vendor") vendor: String,
        @Body request: UpsertIntegrationRequest
    ): Response<IntegrationResponse>

    /**
     * Get vendor integration configuration
     *
     * @param vendor Vendor type (whoop, garmin, fitbit)
     * @param appId Application ID
     */
    @GET("/v1/integrations/{vendor}")
    suspend fun getIntegration(
        @Path("vendor") vendor: String,
        @Query("app_id") appId: String
    ): Response<IntegrationResponse>

    // ============= Garmin-Specific Endpoints =============

    /**
     * Fetch Garmin data for any summary type
     *
     * Garmin supports 12 summary types:
     * - dailies: Daily summaries (steps, calories, heart rate, stress, body battery)
     * - epochs: 15-minute granular activity periods
     * - sleeps: Sleep duration, levels (deep/light/REM), scores
     * - stressDetails: Detailed stress values and body battery events
     * - hrv: Heart rate variability metrics
     * - userMetrics: VO2 Max, Fitness Age
     * - bodyComps: Body composition (weight, BMI, body fat, etc.)
     * - pulseox: Pulse oximetry data
     * - respiration: Respiration rate data
     * - healthSnapshot: Health snapshot data
     * - bloodPressures: Blood pressure measurements
     * - skinTemp: Skin temperature data
     *
     * Note: Garmin uses webhook-based data delivery. Direct queries may return
     * 501 Not Implemented. Use webhooks for real-time data and backfill for historical.
     *
     * @param userId User ID
     * @param summaryType One of the 12 Garmin summary types
     * @param appId Application ID
     * @param start Start time (RFC3339 format, UTC)
     * @param end End time (RFC3339 format, UTC)
     */
    @GET("/v1/garmin/data/{user_id}/{summary_type}")
    suspend fun getGarminData(
        @Path("user_id") userId: String,
        @Path("summary_type") summaryType: String,
        @Query("app_id") appId: String,
        @Query("start") start: String? = null,
        @Query("end") end: String? = null
    ): Response<GarminDataEnvelope>

    /**
     * Request historical Garmin data (Backfill)
     *
     * Garmin doesn't support direct historical queries. Use this endpoint to
     * request historical data which will be delivered via webhooks to your
     * configured app_webhook_url.
     *
     * Rate Limits (from Garmin):
     * - Evaluation keys: 100 days of data per minute
     * - Production keys: 10,000 days per minute
     * - Per user: 1 request per time range per summary type
     *
     * @param userId User ID
     * @param summaryType One of the 12 Garmin summary types
     * @param request Backfill request with date range (max 90 days)
     */
    @POST("/v1/garmin/backfill/{user_id}/{summary_type}")
    suspend fun requestGarminBackfill(
        @Path("user_id") userId: String,
        @Path("summary_type") summaryType: String,
        @Body request: GarminBackfillRequest
    ): Response<GarminBackfillResponse>

    /**
     * Get Garmin webhook URLs
     *
     * Returns webhook URLs for all 12 Garmin summary types plus deregistration.
     * Configure these in your Garmin Developer Portal at:
     * https://apis.garmin.com/tools/endpoints/
     *
     * @param appId Application ID
     * @param baseUrl Base URL (optional, defaults to request host)
     */
    @GET("/v1/garmin/webhooks/url")
    suspend fun getGarminWebhookUrls(
        @Query("app_id") appId: String,
        @Query("base_url") baseUrl: String? = null
    ): Response<GarminWebhookURLsResponse>

    /**
     * Get Garmin user ID
     *
     * Returns the Garmin API User ID for the connected user.
     *
     * @param userId User ID (your system's user ID)
     * @param appId Application ID
     */
    @GET("/v1/garmin/data/{user_id}/user_id")
    suspend fun getGarminUserId(
        @Path("user_id") userId: String,
        @Query("app_id") appId: String
    ): Response<GarminUserIdResponse>

    /**
     * Get Garmin user permissions
     *
     * Returns the permissions granted by the user during OAuth.
     * Possible permissions: ACTIVITY_EXPORT, HEALTH_EXPORT, WORKOUT_IMPORT
     *
     * @param userId User ID
     * @param appId Application ID
     */
    @GET("/v1/garmin/data/{user_id}/user_permissions")
    suspend fun getGarminUserPermissions(
        @Path("user_id") userId: String,
        @Query("app_id") appId: String
    ): Response<List<String>>
}

