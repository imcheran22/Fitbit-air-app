package ai.synheart.wear.adapters

import ai.synheart.wear.SynheartWearException
import ai.synheart.wear.cloud.WearServiceAPI
import ai.synheart.wear.cloud.models.OAuthAuthorizeResponse
import ai.synheart.wear.cloud.models.OAuthCallbackResponse
import ai.synheart.wear.cloud.models.SleepEnvelope
import ai.synheart.wear.config.CloudConfig
import ai.synheart.wear.models.DeviceAdapter
import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import io.mockk.*
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Before
import org.junit.Test
import retrofit2.Response
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class FitbitProviderTest {

    private lateinit var context: Context
    private lateinit var cloudConfig: CloudConfig
    private lateinit var sharedPrefs: SharedPreferences
    private lateinit var sharedPrefsEditor: SharedPreferences.Editor
    private lateinit var provider: FitbitProvider
    private lateinit var mockApi: WearServiceAPI

    @Before
    fun setup() {
        mockkStatic(Log::class)
        every { Log.w(any(), any<String>()) } returns 0
        every { Log.e(any(), any(), any()) } returns 0

        context = mockk(relaxed = true)
        sharedPrefs = mockk(relaxed = true)
        sharedPrefsEditor = mockk(relaxed = true)
        every { context.getSharedPreferences(any(), any()) } returns sharedPrefs
        every { sharedPrefs.edit() } returns sharedPrefsEditor
        every { sharedPrefsEditor.putString(any(), any()) } returns sharedPrefsEditor
        every { sharedPrefsEditor.remove(any()) } returns sharedPrefsEditor
        every { sharedPrefsEditor.apply() } just Runs
        every { sharedPrefs.getString(any(), any()) } returns null

        cloudConfig = CloudConfig(
            baseUrl = "https://test-api.synheart.io",
            appId = "test-app",
            redirectUri = "synheart://oauth/callback",
            enableDebugLogging = false
        )

        mockApi = mockk()
        provider = FitbitProvider(context, cloudConfig, mockApi)
    }

    @After
    fun tearDown() = unmockkAll()

    @Test
    fun `vendor is FITBIT`() {
        assertEquals(DeviceAdapter.FITBIT, provider.vendor)
    }

    @Test
    fun `not connected by default`() {
        assertFalse(provider.isConnected())
    }

    @Test
    fun `connect returns authorization url`() = runTest {
        val authUrl = "https://www.fitbit.com/oauth2/authorize?client_id=test"
        coEvery {
            mockApi.getAuthorizationUrl(any(), any(), any(), any(), any())
        } returns Response.success(OAuthAuthorizeResponse(authUrl))

        val result = provider.connect()

        assertEquals(authUrl, result)
        verify {
            sharedPrefsEditor.putString(match { it.contains("oauth_state") }, any())
        }
    }

    @Test
    fun `connectWithCode stores user id`() = runTest {
        val callbackResponse = OAuthCallbackResponse(status = "success", userId = "fitbit-user-123")
        coEvery {
            mockApi.handleOAuthCallback(any(), any())
        } returns Response.success(callbackResponse)

        val resultId = provider.connectWithCode(code = "auth-code", state = "state-x", redirectUri = "synheart://oauth/callback")

        assertEquals("fitbit-user-123", resultId)
        assertTrue(provider.isConnected())
        verify { sharedPrefsEditor.putString("user_id", "fitbit-user-123") }
    }

    @Test
    fun `fetchSleep throws when not connected`() = runTest {
        assertFailsWith<SynheartWearException> {
            provider.fetchSleep()
        }
    }
}
