package ai.synheart.wear.adapters

import ai.synheart.wear.SynheartWearException
import ai.synheart.wear.cloud.WearServiceAPI
import ai.synheart.wear.cloud.models.*
import ai.synheart.wear.config.CloudConfig
import ai.synheart.wear.models.DeviceAdapter
import ai.synheart.wear.models.MetricType
import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import io.mockk.*
import kotlinx.coroutines.test.runTest
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.After
import org.junit.Before
import org.junit.Test
import retrofit2.Response
import java.util.*
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Unit tests for WhoopProvider
 *
 * Tests OAuth flow, data fetching, error handling, and data conversion
 */
class WhoopProviderTest {

    private lateinit var context: Context
    private lateinit var cloudConfig: CloudConfig
    private lateinit var sharedPrefs: SharedPreferences
    private lateinit var sharedPrefsEditor: SharedPreferences.Editor
    private lateinit var whoopProvider: WhoopProvider
    private lateinit var mockApi: WearServiceAPI

    @Before
    fun setup() {
        // Mock Android Log
        mockkStatic(Log::class)
        every { Log.e(any(), any(), any()) } returns 0
        every { Log.w(any(), any<String>()) } returns 0
        every { Log.d(any(), any()) } returns 0
        every { Log.i(any(), any()) } returns 0

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
            baseUrl = "https://test-api.synheart.io",
            appId = "test-app-id",
            redirectUri = "synheart://oauth/callback",
            enableDebugLogging = false
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

    // ========== OAuth Flow Tests ==========

    @Test
    fun `connect should return authorization URL`() = runTest {
        // Given
        val expectedAuthUrl = "https://api.prod.whoop.com/oauth/oauth2/auth?client_id=test&state=123"
        val response = Response.success(OAuthAuthorizeResponse(expectedAuthUrl))
        coEvery { mockApi.getAuthorizationUrl(any(), any(), any(), any(), any()) } returns response

        // When
        val authUrl = whoopProvider.connect()

        // Then
        assertEquals(expectedAuthUrl, authUrl)
        verify { sharedPrefsEditor.putString(match { it.contains("oauth_state") }, any()) }
    }

    @Test
    fun `connect should generate and store state parameter`() = runTest {
        // Given
        val authUrl = "https://api.prod.whoop.com/oauth/oauth2/auth?state=abc123"
        val response = Response.success(OAuthAuthorizeResponse(authUrl))
        coEvery { mockApi.getAuthorizationUrl(any(), any(), any(), any(), any()) } returns response

        // When
        whoopProvider.connect()

        // Then
        verify { 
            sharedPrefsEditor.putString(
                match { it.contains("oauth_state") }, 
                match { it.isNotEmpty() }
            )
        }
    }

    @Test(expected = SynheartWearException::class)
    fun `connect should throw exception on API failure`() = runTest {
        // Given
        val errorResponse = Response.error<OAuthAuthorizeResponse>(
            500,
            "Server error".toResponseBody()
        )
        coEvery { mockApi.getAuthorizationUrl(any(), any(), any(), any(), any()) } returns errorResponse

        // When
        whoopProvider.connect()

        // Then - exception thrown
    }

    @Test
    fun `connectWithCode should exchange code for user_id`() = runTest {
        // Given
        val code = "auth_code_123"
        val state = "state_abc"
        val userId = "user_456"
        val savedState = state

        every { sharedPrefs.getString(match { it.contains("oauth_state") }, any()) } returns savedState
        
        val callbackResponse = Response.success(
            OAuthCallbackResponse(status = "success", userId = userId)
        )
        coEvery { mockApi.handleOAuthCallback(any(), any()) } returns callbackResponse

        // When
        val returnedUserId = whoopProvider.connectWithCode(code, state, cloudConfig.redirectUri)

        // Then
        assertEquals(userId, returnedUserId)
        assertTrue(whoopProvider.isConnected())
        assertEquals(userId, whoopProvider.getUserId())
        verify { sharedPrefsEditor.putString("user_id", userId) }
        verify { sharedPrefsEditor.remove(match { it.contains("oauth_state") }) }
    }

    @Test(expected = SynheartWearException::class)
    fun `connectWithCode should throw exception on invalid state`() = runTest {
        // Given
        val code = "auth_code_123"
        val state = "state_abc"
        val differentState = "different_state"

        every { sharedPrefs.getString(match { it.contains("oauth_state") }, any()) } returns differentState

        // When
        whoopProvider.connectWithCode(code, state, cloudConfig.redirectUri)

        // Then - exception thrown
    }

    @Test(expected = SynheartWearException::class)
    fun `connectWithCode should throw exception if no OAuth flow initiated`() = runTest {
        // Given
        val code = "auth_code_123"
        val state = "state_abc"

        every { sharedPrefs.getString(match { it.contains("oauth_state") }, any()) } returns null

        // When
        whoopProvider.connectWithCode(code, state, cloudConfig.redirectUri)

        // Then - exception thrown
    }

    @Test
    fun `disconnect should clear local state and call API`() = runTest {
        // Given - set up connected state
        val userId = "user_456"
        setPrivateField(whoopProvider, "userId", userId)
        
        val disconnectResponse = Response.success(DisconnectResponse(status = "disconnected"))
        coEvery { mockApi.disconnect(any(), any(), any()) } returns disconnectResponse

        // When
        whoopProvider.disconnect()

        // Then
        assertFalse(whoopProvider.isConnected())
        assertEquals(null, whoopProvider.getUserId())
        verify { sharedPrefsEditor.remove("user_id") }
    }

    @Test
    fun `disconnect should clear local state even if API fails`() = runTest {
        // Given - set up connected state
        val userId = "user_456"
        setPrivateField(whoopProvider, "userId", userId)
        
        // Mock API failure
        coEvery { mockApi.disconnect(any(), any(), any()) } throws Exception("Network error")

        // When
        whoopProvider.disconnect()

        // Then - local state should still be cleared
        assertFalse(whoopProvider.isConnected())
        assertEquals(null, whoopProvider.getUserId())
        verify { sharedPrefsEditor.remove("user_id") }
    }

    // ========== Data Fetching Tests ==========

    @Test
    fun `fetchRecovery should return parsed recovery data`() = runTest {
        // Given - set up connected state
        val userId = "user_456"
        setPrivateField(whoopProvider, "userId", userId)

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

        val response = Response.success(recoveryEnvelope)
        coEvery { mockApi.getRecoveryData(any(), any(), any(), any(), any(), any(), any()) } returns response

        // When
        val metrics = whoopProvider.fetchRecovery(
            startDate = Date(System.currentTimeMillis() - 24 * 60 * 60 * 1000),
            endDate = Date(),
            limit = 25
        )

        // Then
        assertNotNull(metrics)
        assertEquals(1, metrics.size)
        
        val metric = metrics.first()
        assertEquals("whoop_recovery", metric.source)
        assertEquals("85.0", metric.meta["recovery_score"])
        assertEquals(50.0, metric.getMetric(MetricType.HRV_RMSSD))
        assertEquals(60.0, metric.getMetric(MetricType.HR))
    }

    @Test(expected = SynheartWearException::class)
    fun `fetchRecovery should throw exception when not connected`() = runTest {
        // Given - not connected (userId is null)
        setPrivateField(whoopProvider, "userId", null)

        // When
        whoopProvider.fetchRecovery()

        // Then - exception thrown
    }

    @Test
    fun `fetchSleep should return parsed sleep data`() = runTest {
        // Given - set up connected state
        val userId = "user_456"
        setPrivateField(whoopProvider, "userId", userId)

        val sleepRecord = mapOf(
            "duration" to 28800.0, // 8 hours in seconds
            "sleep_score" to 90.0,
            "sleep_efficiency" to 95.0,
            "rem_duration" to 7200.0, // 2 hours in seconds
            "deep_duration" to 5400.0, // 1.5 hours in seconds
            "timestamp" to "2024-01-01T06:00:00Z"
        )

        val sleepEnvelope = SleepEnvelope(
            vendor = "whoop",
            appId = cloudConfig.appId,
            userId = userId,
            records = listOf(sleepRecord),
            cursor = null
        )

        val response = Response.success(sleepEnvelope)
        coEvery { mockApi.getSleepData(any(), any(), any(), any(), any(), any(), any()) } returns response

        // When
        val metrics = whoopProvider.fetchSleep(
            startDate = Date(System.currentTimeMillis() - 24 * 60 * 60 * 1000),
            endDate = Date(),
            limit = 25
        )

        // Then
        assertNotNull(metrics)
        assertEquals(1, metrics.size)
        
        val metric = metrics.first()
        assertEquals("whoop_sleep", metric.source)
        assertEquals("8.0", metric.meta["sleep_duration_hours"])
        assertEquals("90.0", metric.meta["sleep_score"])
        assertEquals("95.0", metric.meta["sleep_efficiency"])
    }

    @Test
    fun `fetchWorkouts should return parsed workout data`() = runTest {
        // Given - set up connected state
        val userId = "user_456"
        setPrivateField(whoopProvider, "userId", userId)

        val workoutRecord = mapOf(
            "duration" to 3600.0, // 1 hour in seconds
            "calories" to 500.0,
            "avg_hr" to 150.0,
            "max_hr" to 180.0,
            "distance_meters" to 8000.0,
            "workout_type" to "running",
            "timestamp" to "2024-01-01T18:00:00Z"
        )

        val workoutEnvelope = WorkoutEnvelope(
            vendor = "whoop",
            appId = cloudConfig.appId,
            userId = userId,
            records = listOf(workoutRecord),
            cursor = null
        )

        val response = Response.success(workoutEnvelope)
        coEvery { mockApi.getWorkoutData(any(), any(), any(), any(), any(), any(), any()) } returns response

        // When
        val metrics = whoopProvider.fetchWorkouts(
            startDate = Date(System.currentTimeMillis() - 24 * 60 * 60 * 1000),
            endDate = Date(),
            limit = 25
        )

        // Then
        assertNotNull(metrics)
        assertEquals(1, metrics.size)
        
        val metric = metrics.first()
        assertEquals("whoop_workout", metric.source)
        assertEquals("60.0", metric.meta["workout_duration_minutes"])
        assertEquals(500.0, metric.getMetric(MetricType.CALORIES))
        assertEquals(150.0, metric.getMetric(MetricType.HR))
        assertEquals("180.0", metric.meta["max_hr"])
        assertEquals("running", metric.meta["workout_type"])
    }

    @Test
    fun `fetchCycles should return parsed cycle data`() = runTest {
        // Given - set up connected state
        val userId = "user_456"
        setPrivateField(whoopProvider, "userId", userId)

        val cycleRecord = mapOf(
            "cycle_day" to 1.0,
            "strain" to 15.5,
            "recovery_score" to 80.0,
            "timestamp" to "2024-01-01T00:00:00Z"
        )

        val cycleEnvelope = CycleEnvelope(
            vendor = "whoop",
            appId = cloudConfig.appId,
            userId = userId,
            records = listOf(cycleRecord),
            cursor = null
        )

        val response = Response.success(cycleEnvelope)
        coEvery { mockApi.getCycleData(any(), any(), any(), any(), any(), any(), any()) } returns response

        // When
        val metrics = whoopProvider.fetchCycles(
            startDate = Date(System.currentTimeMillis() - 7 * 24 * 60 * 60 * 1000),
            endDate = Date(),
            limit = 7
        )

        // Then
        assertNotNull(metrics)
        assertEquals(1, metrics.size)
        
        val metric = metrics.first()
        assertEquals("whoop_cycle", metric.source)
        assertEquals("1.0", metric.meta["cycle_day"])
        assertEquals("15.5", metric.meta["strain"])
        assertEquals("80.0", metric.meta["recovery_score"])
    }

    // ========== Connection State Tests ==========

    @Test
    fun `isConnected should return false when userId is null`() {
        // Given - fresh provider (userId is null)
        setPrivateField(whoopProvider, "userId", null)

        // When
        val connected = whoopProvider.isConnected()

        // Then
        assertFalse(connected)
    }

    @Test
    fun `isConnected should return true when userId is set`() {
        // Given
        setPrivateField(whoopProvider, "userId", "user_123")

        // When
        val connected = whoopProvider.isConnected()

        // Then
        assertTrue(connected)
    }

    @Test
    fun `getUserId should return null when not connected`() {
        // Given
        setPrivateField(whoopProvider, "userId", null)

        // When
        val userId = whoopProvider.getUserId()

        // Then
        assertEquals(null, userId)
    }

    @Test
    fun `getUserId should return userId when connected`() {
        // Given
        val expectedUserId = "user_789"
        setPrivateField(whoopProvider, "userId", expectedUserId)

        // When
        val userId = whoopProvider.getUserId()

        // Then
        assertEquals(expectedUserId, userId)
    }

    @Test
    fun `vendor should be WHOOP`() {
        // When
        val vendor = whoopProvider.vendor

        // Then
        assertEquals(DeviceAdapter.WHOOP, vendor)
    }

    // ========== Error Handling Tests ==========

    @Test(expected = SynheartWearException::class)
    fun `fetchRecovery should throw exception on API error`() = runTest {
        // Given - set up connected state
        setPrivateField(whoopProvider, "userId", "user_456")

        val errorResponse = Response.error<RecoveryEnvelope>(
            404,
            "Not found".toResponseBody()
        )
        coEvery { mockApi.getRecoveryData(any(), any(), any(), any(), any(), any(), any()) } returns errorResponse

        // When
        whoopProvider.fetchRecovery()

        // Then - exception thrown
    }

    @Test
    fun `fetchRecovery should return empty list when no records`() = runTest {
        // Given - set up connected state
        setPrivateField(whoopProvider, "userId", "user_456")

        val emptyEnvelope = RecoveryEnvelope(
            vendor = "whoop",
            appId = cloudConfig.appId,
            userId = "user_456",
            records = emptyList(),
            cursor = null
        )

        val response = Response.success(emptyEnvelope)
        coEvery { mockApi.getRecoveryData(any(), any(), any(), any(), any(), any(), any()) } returns response

        // When
        val metrics = whoopProvider.fetchRecovery()

        // Then
        assertNotNull(metrics)
        assertTrue(metrics.isEmpty())
    }

    // ========== Data Conversion Tests ==========

    @Test
    fun `should handle timestamp in ISO8601 format`() = runTest {
        // Given
        setPrivateField(whoopProvider, "userId", "user_456")

        val record = mapOf(
            "timestamp" to "2024-01-15T10:30:00Z",
            "score" to 85.0
        )

        val envelope = RecoveryEnvelope(
            vendor = "whoop",
            appId = cloudConfig.appId,
            userId = "user_456",
            records = listOf(record),
            cursor = null
        )

        val response = Response.success(envelope)
        coEvery { mockApi.getRecoveryData(any(), any(), any(), any(), any(), any(), any()) } returns response

        // When
        val metrics = whoopProvider.fetchRecovery()

        // Then
        assertNotNull(metrics)
        assertEquals(1, metrics.size)
        assertTrue(metrics.first().timestamp > 0)
    }

    @Test
    fun `should handle multiple metrics in single response`() = runTest {
        // Given
        setPrivateField(whoopProvider, "userId", "user_456")

        val records = listOf(
            mapOf("score" to 85.0, "timestamp" to "2024-01-01T12:00:00Z"),
            mapOf("score" to 90.0, "timestamp" to "2024-01-02T12:00:00Z"),
            mapOf("score" to 78.0, "timestamp" to "2024-01-03T12:00:00Z")
        )

        val envelope = RecoveryEnvelope(
            vendor = "whoop",
            appId = cloudConfig.appId,
            userId = "user_456",
            records = records,
            cursor = "next_token_123"
        )

        val response = Response.success(envelope)
        coEvery { mockApi.getRecoveryData(any(), any(), any(), any(), any(), any(), any()) } returns response

        // When
        val metrics = whoopProvider.fetchRecovery()

        // Then
        assertEquals(3, metrics.size)
        assertEquals("85.0", metrics[0].meta["recovery_score"])
        assertEquals("90.0", metrics[1].meta["recovery_score"])
        assertEquals("78.0", metrics[2].meta["recovery_score"])
    }

    // ========== Helper Methods ==========

    private fun setPrivateField(obj: Any, fieldName: String, value: Any?) {
        try {
            // Try direct field access
            val field = obj.javaClass.getDeclaredField(fieldName)
            field.isAccessible = true
            field.set(obj, value)
        } catch (e: NoSuchFieldException) {
            // Try with Kotlin backing field naming (property$delegate or just property)
            try {
                val backingField = obj.javaClass.getDeclaredField("$fieldName\$delegate")
                backingField.isAccessible = true
                // For lazy properties, we need to set the value differently
                // For now, try to set the field directly
            } catch (e2: NoSuchFieldException) {
                // Last resort: try all declared fields
                obj.javaClass.declaredFields.forEach { field ->
                    if (field.name.contains(fieldName)) {
                        field.isAccessible = true
                        field.set(obj, value)
                        return
                    }
                }
                throw NoSuchFieldException("Cannot find field: $fieldName in ${obj.javaClass.name}")
            }
        }
    }
}

