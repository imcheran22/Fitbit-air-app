package ai.synheart.wear.adapters

import ai.synheart.wear.SynheartWearException
import ai.synheart.wear.cloud.WearServiceAPI
import ai.synheart.wear.config.CloudConfig
import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import com.google.gson.GsonBuilder
import io.mockk.*
import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * Reference test: exercises a cloud provider through the full
 * Retrofit + OkHttp + JSON-decode stack against an in-process
 * MockWebServer. Validates real wire behavior (network → response
 * decode → SDK error mapping) — not just the Retrofit interface
 * boundary the MockK-based tests cover.
 *
 * Use this pattern when you need to verify:
 *   - HTTP-status → SynheartWearException mapping (4xx, 5xx)
 *   - Response-body decode against the real GSON converter
 *   - Header/auth handling that the WearServiceAPI interface hides
 *   - Network failures (timeouts, malformed responses)
 *
 * For pure provider-logic tests (state transitions, OAuth flow shape),
 * keep using the MockK + apiOverride pattern in WhoopProviderTest.
 */
class WhoopProviderMockServerTest {

    private lateinit var server: MockWebServer
    private lateinit var context: Context
    private lateinit var sharedPrefs: SharedPreferences
    private lateinit var sharedPrefsEditor: SharedPreferences.Editor
    private lateinit var api: WearServiceAPI
    private lateinit var provider: WhoopProvider

    @Before
    fun setup() {
        // Silence Android logging — the SDK uses Log.w on network failures.
        mockkStatic(Log::class)
        every { Log.w(any(), any<String>()) } returns 0
        every { Log.e(any(), any(), any()) } returns 0

        // Boot the in-process HTTP server.
        server = MockWebServer().apply { start() }

        // Mock the Android Context / SharedPreferences — WhoopProvider
        // reads its user-id from prefs at construction time.
        context = mockk(relaxed = true)
        sharedPrefs = mockk(relaxed = true)
        sharedPrefsEditor = mockk(relaxed = true)
        every { context.getSharedPreferences(any(), any()) } returns sharedPrefs
        every { sharedPrefs.edit() } returns sharedPrefsEditor
        every { sharedPrefsEditor.putString(any(), any()) } returns sharedPrefsEditor
        every { sharedPrefsEditor.remove(any()) } returns sharedPrefsEditor
        every { sharedPrefsEditor.apply() } just Runs
        // Simulate a previously-connected user so fetchSleep skips the
        // not-connected check and actually hits the server.
        every { sharedPrefs.getString("user_id", null) } returns "test-user-42"
        every { sharedPrefs.getString(any(), any()) } returns null
        every { sharedPrefs.getString("user_id", null) } returns "test-user-42"

        // Build a real Retrofit client pointed at the MockWebServer.
        val gson = GsonBuilder().setLenient().create()
        val retrofit = Retrofit.Builder()
            .baseUrl(server.url("/"))
            .client(OkHttpClient.Builder().build())
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()
        api = retrofit.create(WearServiceAPI::class.java)

        val cloudConfig = CloudConfig(
            baseUrl = server.url("/").toString(),
            appId = "test-app",
            redirectUri = "synheart://oauth/callback"
        )
        provider = WhoopProvider(context, cloudConfig, api)
    }

    @After
    fun tearDown() {
        server.shutdown()
        unmockkAll()
    }

    @Test
    fun `fetchSleep wraps 401 token-expired into SynheartWearException`() = runTest {
        server.enqueue(MockResponse().setResponseCode(401))

        val ex = assertFailsWith<SynheartWearException> {
            provider.fetchSleep()
        }
        // Surface the upstream HTTP code so callers can branch on
        // re-authentication paths.
        assertTrue(
            ex.message?.contains("401") == true,
            "Expected message to surface upstream 401 code; got: ${ex.message}"
        )
    }
}
