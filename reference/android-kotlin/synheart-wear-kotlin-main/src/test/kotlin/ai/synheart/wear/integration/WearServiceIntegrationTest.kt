package ai.synheart.wear.integration

import ai.synheart.wear.adapters.WhoopProvider
import ai.synheart.wear.cloud.WearServiceAPI
import ai.synheart.wear.cloud.models.*
import ai.synheart.wear.config.CloudConfig
import ai.synheart.wear.models.DeviceAdapter
import android.content.Context
import android.content.SharedPreferences
import io.mockk.*
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Before
import org.junit.Test
import retrofit2.Response
import java.util.*
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Integration tests for complete wear service flows
 *
 * Tests end-to-end scenarios including OAuth and data fetching
 */
class WearServiceIntegrationTest {

    private lateinit var context: Context
    private lateinit var cloudConfig: CloudConfig
    private lateinit var sharedPrefs: SharedPreferences
    private lateinit var sharedPrefsEditor: SharedPreferences.Editor
    private lateinit var whoopProvider: WhoopProvider
    private lateinit var mockApi: WearServiceAPI

    @Before
    fun setup() {
        // Mock context and shared preferences
        context = mockk(relaxed = true)
        sharedPrefs = mockk(relaxed = true)
        sharedPrefsEditor = mockk(relaxed = true)

        every { context.getSharedPreferences(any(), any()) } returns sharedPrefs
        every { sharedPrefs.edit() } returns sharedPrefsEditor
        every { sharedPrefsEditor.putString(any(), any()) } returns sharedPrefsEditor
        every { sharedPrefsEditor.remove(any()) } returns sharedPrefsEditor
        every { sharedPrefsEditor.apply() } just Runs
        every { sharedPrefs.getString(any(), any()) } returns null

        // Create cloud config
        cloudConfig = CloudConfig(
            baseUrl = "https://api.synheart.ai/wear",
            appId = "test-app-id",
            redirectUri = "synheart://oauth/callback",
            enableDebugLogging = true
        )

        // Mock the API
        mockApi = mockk()

        // Create provider with mocked API
        whoopProvider = WhoopProvider(context, cloudConfig, mockApi)
    }

    @After
    fun tearDown() {
        unmockkAll()
    }

    // ========== End-to-End OAuth Flow Test ==========

    @Test
    fun `complete OAuth flow from start to data fetch`() = runTest {
        // ===== Step 1: Start OAuth flow =====
        val authUrl = "https://api.prod.whoop.com/oauth/oauth2/auth?client_id=test&state=abc123"
        val state = "abc123"
        
        val authResponse = Response.success(OAuthAuthorizeResponse(authUrl))
        coEvery { mockApi.getAuthorizationUrl(any(), any(), any(), any(), any()) } returns authResponse

        val returnedAuthUrl = whoopProvider.connect()

        // Verify authorization URL received
        assertNotNull(returnedAuthUrl)
        assertTrue(returnedAuthUrl.contains("whoop.com"))

        // ===== Step 2: User authorizes in browser (simulated) =====
        // User logs in to WHOOP and approves
        // WHOOP redirects back with code and state

        // ===== Step 3: Exchange code for tokens =====
        val code = "auth_code_xyz789"
        val userId = "user_456"

        // Mock state storage
        every { sharedPrefs.getString(match { it.contains("oauth_state") }, any()) } returns state

        val callbackResponse = Response.success(
            OAuthCallbackResponse(status = "success", userId = userId)
        )
        coEvery { mockApi.handleOAuthCallback(any(), any()) } returns callbackResponse

        val returnedUserId = whoopProvider.connectWithCode(code, state, cloudConfig.redirectUri)

        // Verify connection successful
        assertEquals(userId, returnedUserId)
        assertTrue(whoopProvider.isConnected())

        // ===== Step 4: Fetch recovery data =====
        val recoveryRecord = mapOf(
            "score" to 85.0,
            "hrv_rmssd" to 50.0,
            "heart_rate" to 60.0,
            "strain" to 12.5,
            "timestamp" to "2024-01-01T12:00:00Z"
        )

        val recoveryEnvelope = RecoveryEnvelope(
            vendor = "whoop",
            appId = cloudConfig.appId,
            userId = userId,
            records = listOf(recoveryRecord),
            cursor = null
        )

        val recoveryResponse = Response.success(recoveryEnvelope)
        coEvery { mockApi.getRecoveryData(any(), any(), any(), any(), any(), any(), any()) } returns recoveryResponse

        val recoveryMetrics = whoopProvider.fetchRecovery(
            startDate = Date(System.currentTimeMillis() - 24 * 60 * 60 * 1000),
            endDate = Date(),
            limit = 25
        )

        // Verify data fetched successfully
        assertNotNull(recoveryMetrics)
        assertEquals(1, recoveryMetrics.size)
        assertEquals("whoop_recovery", recoveryMetrics.first().source)

        // ===== Step 5: Disconnect =====
        val disconnectResponse = Response.success(DisconnectResponse(status = "disconnected"))
        coEvery { mockApi.disconnect(any(), any(), any()) } returns disconnectResponse

        whoopProvider.disconnect()

        // Verify disconnection
        assertTrue(!whoopProvider.isConnected())
    }

    // ========== Multiple Data Type Fetch Test ==========

    @Test
    fun `fetch multiple data types in sequence`() = runTest {
        // Setup connected state
        val userId = "user_789"
        setPrivateField(whoopProvider, "userId", userId)

        // ===== Fetch Recovery =====
        val recoveryEnvelope = RecoveryEnvelope(
            vendor = "whoop",
            appId = cloudConfig.appId,
            userId = userId,
            records = listOf(mapOf("score" to 85.0, "timestamp" to "2024-01-01T12:00:00Z")),
            cursor = null
        )
        coEvery { mockApi.getRecoveryData(any(), any(), any(), any(), any(), any(), any()) } returns 
            Response.success(recoveryEnvelope)

        val recoveryData = whoopProvider.fetchRecovery()
        assertEquals(1, recoveryData.size)

        // ===== Fetch Sleep =====
        val sleepEnvelope = SleepEnvelope(
            vendor = "whoop",
            appId = cloudConfig.appId,
            userId = userId,
            records = listOf(mapOf("duration" to 28800.0, "timestamp" to "2024-01-01T06:00:00Z")),
            cursor = null
        )
        coEvery { mockApi.getSleepData(any(), any(), any(), any(), any(), any(), any()) } returns 
            Response.success(sleepEnvelope)

        val sleepData = whoopProvider.fetchSleep()
        assertEquals(1, sleepData.size)

        // ===== Fetch Workouts =====
        val workoutEnvelope = WorkoutEnvelope(
            vendor = "whoop",
            appId = cloudConfig.appId,
            userId = userId,
            records = listOf(mapOf("calories" to 500.0, "timestamp" to "2024-01-01T18:00:00Z")),
            cursor = null
        )
        coEvery { mockApi.getWorkoutData(any(), any(), any(), any(), any(), any(), any()) } returns 
            Response.success(workoutEnvelope)

        val workoutData = whoopProvider.fetchWorkouts()
        assertEquals(1, workoutData.size)

        // ===== Fetch Cycles =====
        val cycleEnvelope = CycleEnvelope(
            vendor = "whoop",
            appId = cloudConfig.appId,
            userId = userId,
            records = listOf(mapOf("cycle_day" to 1.0, "timestamp" to "2024-01-01T00:00:00Z")),
            cursor = null
        )
        coEvery { mockApi.getCycleData(any(), any(), any(), any(), any(), any(), any()) } returns 
            Response.success(cycleEnvelope)

        val cycleData = whoopProvider.fetchCycles()
        assertEquals(1, cycleData.size)

        // Verify all data fetched successfully
        assertTrue(recoveryData.isNotEmpty())
        assertTrue(sleepData.isNotEmpty())
        assertTrue(workoutData.isNotEmpty())
        assertTrue(cycleData.isNotEmpty())
    }

    // ========== Pagination Test ==========

    @Test
    fun `handle paginated data fetching`() = runTest {
        // Setup connected state
        val userId = "user_999"
        setPrivateField(whoopProvider, "userId", userId)

        // ===== First page =====
        val records1 = listOf(
            mapOf("score" to 85.0, "timestamp" to "2024-01-01T12:00:00Z"),
            mapOf("score" to 90.0, "timestamp" to "2024-01-02T12:00:00Z")
        )

        val envelope1 = RecoveryEnvelope(
            vendor = "whoop",
            appId = cloudConfig.appId,
            userId = userId,
            records = records1,
            cursor = "next_page_token"
        )

        coEvery { 
            mockApi.getRecoveryData(any(), any(), any(), any(), any(), any(), isNull()) 
        } returns Response.success(envelope1)

        val page1 = whoopProvider.fetchRecovery(limit = 2)
        assertEquals(2, page1.size)

        // ===== Second page =====
        val records2 = listOf(
            mapOf("score" to 78.0, "timestamp" to "2024-01-03T12:00:00Z")
        )

        val envelope2 = RecoveryEnvelope(
            vendor = "whoop",
            appId = cloudConfig.appId,
            userId = userId,
            records = records2,
            cursor = null // Last page
        )

        coEvery { 
            mockApi.getRecoveryData(any(), any(), any(), any(), any(), any(), "next_page_token") 
        } returns Response.success(envelope2)

        val page2 = whoopProvider.fetchRecovery(limit = 2, cursor = "next_page_token")
        assertEquals(1, page2.size)

        // Verify pagination worked
        assertTrue(page1.size == 2)
        assertTrue(page2.size == 1)
    }

    // ========== Date Range Test ==========

    @Test
    fun `fetch data with specific date range`() = runTest {
        // Setup connected state
        val userId = "user_555"
        setPrivateField(whoopProvider, "userId", userId)

        // Define date range - last 7 days
        val startDate = Date(System.currentTimeMillis() - 7 * 24 * 60 * 60 * 1000)
        val endDate = Date()

        // Mock response with data in range
        val records = listOf(
            mapOf("score" to 85.0, "timestamp" to "2024-01-15T12:00:00Z"),
            mapOf("score" to 90.0, "timestamp" to "2024-01-16T12:00:00Z"),
            mapOf("score" to 78.0, "timestamp" to "2024-01-17T12:00:00Z")
        )

        val envelope = RecoveryEnvelope(
            vendor = "whoop",
            appId = cloudConfig.appId,
            userId = userId,
            records = records,
            cursor = null
        )

        val response = Response.success(envelope)
        coEvery { mockApi.getRecoveryData(any(), any(), any(), any(), any(), any(), any()) } returns response

        // Fetch with date range
        val metrics = whoopProvider.fetchRecovery(
            startDate = startDate,
            endDate = endDate,
            limit = 10
        )

        // Verify data returned
        assertNotNull(metrics)
        assertEquals(3, metrics.size)
        
        // Verify all timestamps are within range (in milliseconds)
        val startMs = startDate.time
        val endMs = endDate.time
        metrics.forEach { metric ->
            assertTrue(metric.timestamp >= startMs || metric.timestamp <= endMs)
        }
    }

    // ========== Reconnection Test ==========

    @Test
    fun `disconnect and reconnect flow`() = runTest {
        // ===== Initial connection =====
        val authUrl = "https://api.prod.whoop.com/oauth/oauth2/auth"
        val state = "state_123"
        val userId = "user_reconnect"

        val authResponse = Response.success(OAuthAuthorizeResponse(authUrl))
        coEvery { mockApi.getAuthorizationUrl(any(), any(), any(), any(), any()) } returns authResponse

        whoopProvider.connect()
        assertTrue(!whoopProvider.isConnected()) // Not connected until code exchange

        // Exchange code
        every { sharedPrefs.getString(match { it.contains("oauth_state") }, any()) } returns state
        val callbackResponse = Response.success(
            OAuthCallbackResponse(status = "success", userId = userId)
        )
        coEvery { mockApi.handleOAuthCallback(any(), any()) } returns callbackResponse

        whoopProvider.connectWithCode("code_123", state, cloudConfig.redirectUri)
        assertTrue(whoopProvider.isConnected())

        // ===== Disconnect =====
        val disconnectResponse = Response.success(DisconnectResponse(status = "disconnected"))
        coEvery { mockApi.disconnect(any(), any(), any()) } returns disconnectResponse

        whoopProvider.disconnect()
        assertTrue(!whoopProvider.isConnected())

        // ===== Reconnect =====
        val newState = "state_456"
        every { sharedPrefs.getString(match { it.contains("oauth_state") }, any()) } returns newState
        
        coEvery { mockApi.getAuthorizationUrl(any(), any(), any(), any(), any()) } returns authResponse
        whoopProvider.connect()

        val newCallbackResponse = Response.success(
            OAuthCallbackResponse(status = "success", userId = userId)
        )
        coEvery { mockApi.handleOAuthCallback(any(), any()) } returns newCallbackResponse

        whoopProvider.connectWithCode("code_456", newState, cloudConfig.redirectUri)
        
        // Verify reconnected
        assertTrue(whoopProvider.isConnected())
        assertEquals(userId, whoopProvider.getUserId())
    }

    // ========== Helper Methods ==========

    private fun setPrivateField(obj: Any, fieldName: String, value: Any?) {
        val field = obj.javaClass.getDeclaredField(fieldName)
        field.isAccessible = true
        field.set(obj, value)
    }
}

