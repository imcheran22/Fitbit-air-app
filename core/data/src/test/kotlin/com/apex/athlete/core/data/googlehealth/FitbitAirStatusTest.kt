package com.apex.athlete.core.data.googlehealth

import com.apex.athlete.core.data.source.AirStatusResult
import com.apex.athlete.core.data.source.FitbitAirStatus
import com.apex.athlete.core.data.source.FitbitAirStatusReader
import com.apex.athlete.core.network.GoogleHealthNetwork
import com.apex.athlete.core.network.JitterSource
import com.apex.athlete.core.network.NetworkModule
import com.apex.athlete.core.network.Sleeper
import com.apex.athlete.core.network.auth.InMemoryTokenStore
import com.apex.athlete.core.network.auth.StoredTokens
import com.apex.athlete.core.network.googlehealth.GhPairedDevice
import com.apex.athlete.core.network.googlehealth.GoogleHealthClientConfig
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import java.time.Instant
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull

/** The Fitbit Air status: mapping of paired devices, and the reader against a MockWebServer. */
class FitbitAirStatusTest {
    private val server = MockWebServer()
    private val tokens = InMemoryTokenStore()
    private var calls = 0
    private var handler: (RecordedRequest) -> MockResponse = { MockResponse().setResponseCode(404) }
    private val clientId = "123-abc.apps.googleusercontent.com"
    private var now = 1_000_000L

    init {
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                calls++
                return handler(request)
            }
        }
        server.start()
        tokens.save(StoredTokens("a", "r", System.currentTimeMillis() + 3_600_000L, setOf("https://www.googleapis.com/auth/googlehealth.settings.readonly"), clientId))
    }

    @AfterTest fun tearDown() = server.shutdown()

    private val net: GoogleHealthNetwork = NetworkModule.create(
        clientId = clientId,
        tokenStore = tokens,
        pendingStore = tokens,
        clientConfig = GoogleHealthClientConfig(baseUrl = server.url("/").toString(), allowInsecureHttp = true, maxRetries = 0),
        jitter = JitterSource { 0.5 },
        sleeper = Sleeper { },
    )
    private val reader = FitbitAirStatusReader({ net }, { now })

    private fun json(body: String, code: Int = 200) =
        MockResponse().setResponseCode(code).setHeader("Content-Type", "application/json").setBody(body)

    private fun dev(type: String?, version: String? = null, level: Long? = null, sync: String? = null, status: String? = null) =
        GhPairedDevice(deviceVersion = version, deviceType = type, batteryLevel = level, lastSyncTime = sync, batteryStatus = status)

    // --- mapping ---------------------------------------------------------------------------------

    @Test fun mapsTheTrackerAndIgnoresTheScale() {
        val s = FitbitAirStatus.from(listOf(dev("SCALE", "Aria"), dev("TRACKER", "Fitbit Air", 80, "2026-11-11T06:00:00Z", "High")))!!
        assertEquals("Fitbit Air", s.model)
        assertEquals(80, s.batteryPercent)
        assertEquals("High", s.batteryStatus)
        assertEquals(Instant.parse("2026-11-11T06:00:00Z").toEpochMilli(), s.lastSyncMillis)
    }

    @Test fun missingFieldsStayNullNotInvented() {
        val s = FitbitAirStatus.from(listOf(dev("TRACKER")))!!
        assertNull(s.model); assertNull(s.batteryPercent); assertNull(s.batteryStatus); assertNull(s.lastSyncMillis)
    }

    @Test fun outOfRangeBatteryAndUnreadableTimeAreDropped() {
        val s = FitbitAirStatus.from(listOf(dev("TRACKER", "Fitbit Air", 250, "yesterday")))!!
        assertNull(s.batteryPercent); assertNull(s.lastSyncMillis)
        assertNull(FitbitAirStatus.from(listOf(dev("TRACKER", level = -1)))!!.batteryPercent)
    }

    @Test fun onlyAScaleMeansNoAir() {
        assertNull(FitbitAirStatus.from(listOf(dev("SCALE"))))
        assertNull(FitbitAirStatus.from(emptyList()))
    }

    @Test fun theMostRecentlySyncedTrackerWins() {
        val s = FitbitAirStatus.from(listOf(dev("TRACKER", "Old", sync = "2026-11-01T00:00:00Z"), dev("TRACKER", "New", sync = "2026-11-11T00:00:00Z")))!!
        assertEquals("New", s.model)
    }

    // --- reader ----------------------------------------------------------------------------------

    @Test fun readsThePairedDevicesAndCachesInMemory() = runBlocking {
        handler = { json("""{"pairedDevices":[{"deviceVersion":"Fitbit Air","deviceType":"TRACKER","batteryLevel":55,"lastSyncTime":"2026-11-11T06:00:00Z"}]}""") }
        val first = assertIs<AirStatusResult.Found>(reader.get())
        assertEquals(55, first.status.batteryPercent)
        assertEquals("/v4/users/me/pairedDevices", server.takeRequest().requestUrl!!.encodedPath)
        reader.get()
        assertEquals(1, calls) // second call from the cache
        assertIs<AirStatusResult.Found>(reader.cached())
        now += 10 * 60_000L
        reader.get()
        assertEquals(2, calls) // cache expired
        reader.get(force = true)
        assertEquals(3, calls)
    }

    @Test fun noDevicesIsNoAirNotAnError() = runBlocking {
        handler = { json("{}") }
        assertEquals(AirStatusResult.NoDevice, reader.get())
    }

    @Test fun a403AsksForTheSettingsScopeAndIsNotCached() = runBlocking {
        handler = { MockResponse().setResponseCode(403) }
        assertEquals(AirStatusResult.ScopeMissing, reader.get())
        assertNull(reader.cached())
        reader.get()
        assertEquals(2, calls)
    }

    @Test fun otherFailuresAreUnavailable() = runBlocking {
        handler = { MockResponse().setResponseCode(503) }
        assertEquals(AirStatusResult.Unavailable, reader.get())
    }

    @Test fun signedOutOrNotConfiguredMakesNoRequest() = runBlocking {
        tokens.clear()
        assertEquals(AirStatusResult.NotSignedIn, reader.get())
        assertEquals(AirStatusResult.NotSignedIn, FitbitAirStatusReader({ GoogleHealthNetwork.NotConfigured }, { now }).get())
        assertEquals(0, calls)
    }
}
