package ai.synheart.wear.adapters

import ai.synheart.wear.SynheartWearException
import ai.synheart.wear.cloud.WearServiceAPI
import ai.synheart.wear.cloud.models.OAuthAuthorizeResponse
import ai.synheart.wear.cloud.models.OAuthCallbackResponse
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

class OuraProviderTest {

    private lateinit var context: Context
    private lateinit var cloudConfig: CloudConfig
    private lateinit var sharedPrefs: SharedPreferences
    private lateinit var sharedPrefsEditor: SharedPreferences.Editor
    private lateinit var provider: OuraProvider
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
        provider = OuraProvider(context, cloudConfig, mockApi)
    }

    @After
    fun tearDown() = unmockkAll()

    @Test
    fun `vendor is OURA`() {
        assertEquals(DeviceAdapter.OURA, provider.vendor)
    }

    @Test
    fun `not connected by default`() {
        assertFalse(provider.isConnected())
    }

    @Test
    fun `connect returns authorization url`() = runTest {
        val authUrl = "https://cloud.ouraring.com/oauth/authorize?client_id=test"
        coEvery {
            mockApi.getAuthorizationUrl(any(), any(), any(), any(), any())
        } returns Response.success(OAuthAuthorizeResponse(authUrl))

        val result = provider.connect()
        assertEquals(authUrl, result)
    }

    @Test
    fun `connectWithCode stores user id`() = runTest {
        val callbackResponse = OAuthCallbackResponse(status = "success", userId = "oura-user-abc")
        coEvery {
            mockApi.handleOAuthCallback(any(), any())
        } returns Response.success(callbackResponse)

        val resultId = provider.connectWithCode(code = "code", state = "s", redirectUri = "synheart://oauth/callback")

        assertEquals("oura-user-abc", resultId)
        assertTrue(provider.isConnected())
    }

    @Test
    fun `fetchReadiness throws when not connected`() = runTest {
        assertFailsWith<SynheartWearException> {
            provider.fetchReadiness()
        }
    }
}
