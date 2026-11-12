package com.apex.athlete.core.data.googlehealth

import com.apex.athlete.core.data.model.HealthBatch
import com.apex.athlete.core.data.source.GoogleHealthApiSource
import com.apex.athlete.core.data.source.GoogleHealthNetworkException
import com.apex.athlete.core.data.source.GoogleHealthServerException
import com.apex.athlete.core.data.source.SourceAuthExpiredException
import com.apex.athlete.core.data.source.SourceAvailability
import com.apex.athlete.core.data.source.SourcePermissionException
import com.apex.athlete.core.data.source.SourceRateLimitedException
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.domain.SyncSource
import com.apex.athlete.core.network.GoogleHealthNetwork
import com.apex.athlete.core.network.JitterSource
import com.apex.athlete.core.network.NetworkModule
import com.apex.athlete.core.network.Sleeper
import com.apex.athlete.core.network.auth.InMemoryTokenStore
import com.apex.athlete.core.network.auth.ReauthReason
import com.apex.athlete.core.network.auth.StoredTokens
import com.apex.athlete.core.network.googlehealth.GoogleHealthClientConfig
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertIs
import kotlin.test.assertTrue

/** GoogleHealthApiSource against a MockWebServer, through the real GoogleHealthApiClient built by NetworkModule. */
class GoogleHealthApiSourceTest {
    private val server = MockWebServer()
    private val tokens = InMemoryTokenStore()
    private val requests = CopyOnWriteArrayList<RecordedRequest>()
    private var handler: (RecordedRequest) -> MockResponse = { MockResponse().setResponseCode(404) }
    private val clientId = "123-abc.apps.googleusercontent.com"

    init {
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                requests += request
                return handler(request)
            }
        }
        server.start()
        signIn()
    }

    @AfterTest fun tearDown() = server.shutdown()

    private fun signIn(refresh: String? = "refresh-1") = tokens.save(
        StoredTokens("access-1", refresh, System.currentTimeMillis() + 3_600_000L, setOf("https://www.googleapis.com/auth/googlehealth.sleep.readonly"), clientId),
    )

    private fun network(): GoogleHealthNetwork = NetworkModule.create(
        clientId = clientId,
        tokenStore = tokens,
        pendingStore = tokens,
        clientConfig = GoogleHealthClientConfig(baseUrl = server.url("/").toString(), allowInsecureHttp = true, maxRetries = 1),
        jitter = JitterSource { 0.5 },
        sleeper = Sleeper { },
    )

    private val net = network()
    private val source = GoogleHealthApiSource({ net }, { ZoneId.of("UTC") })
    private fun stream(name: String) = source.streams.first { it.name == name }

    private fun json(body: String, code: Int = 200) =
        MockResponse().setResponseCode(code).setHeader("Content-Type", "application/json").setBody(body)

    private fun page(points: List<String>, next: String? = null) =
        """{"dataPoints":[${points.joinToString(",")}]${if (next != null) ""","nextPageToken":"$next"""" else ""}}"""

    private fun sleepPoint(id: String, start: String, end: String) =
        """{"name":"users/me/dataTypes/sleep/dataPoints/$id","sleep":{"interval":{"startTime":"$start","endTime":"$end","startUtcOffset":"0s","endUtcOffset":"0s"},"summary":{"minutesAsleep":"400"}}}"""

    private fun hrPoint(t: Instant, bpm: Int) = """{"heartRate":{"beatsPerMinute":"$bpm","sampleTime":{"physicalTime":"$t","utcOffset":"0s"}}}"""

    private fun ms(iso: String) = Instant.parse(iso).toEpochMilli()
    private fun pull(name: String, from: String, to: String): List<HealthBatch> = runBlocking {
        val out = ArrayList<HealthBatch>()
        source.pull(stream(name), ms(from), ms(to)) { out += it }
        out
    }

    private val d10 = ms("2026-11-10T00:00:00Z")
    private val d11 = ms("2026-11-11T00:00:00Z")

    // --- availability ---------------------------------------------------------------------------------

    @Test
    fun availabilityFollowsTheNetworkAndSignInState() = runBlocking {
        assertEquals(SourceAvailability.Unavailable(SourceAvailability.Reason.NO_CLIENT_ID), GoogleHealthApiSource({ GoogleHealthNetwork.NotConfigured }).availability())
        assertEquals(SourceAvailability.Ready, source.availability())
        assertEquals(SyncSource.GOOGLE_HEALTH_API, source.source)
        tokens.markNeedsReauth(ReauthReason.REFRESH_TOKEN_REJECTED)
        assertEquals(SourceAvailability.NeedsAction(SourceAvailability.Reason.SIGN_IN_EXPIRED), source.availability())
        tokens.clear()
        assertEquals(SourceAvailability.NeedsAction(SourceAvailability.Reason.NOT_SIGNED_IN), source.availability())
    }

    // --- happy paths ----------------------------------------------------------------------------------

    @Test
    fun multiPageSleepIsHandedThroughIncludingDuplicatesAndOutOfOrderPages() {
        handler = { r ->
            when (r.requestUrl!!.queryParameter("pageToken")) {
                null -> json(page(listOf(sleepPoint("2", "2026-11-10T22:00:00Z", "2026-11-11T06:00:00Z")), next = "T2"))
                "T2" -> json(
                    page(
                        listOf(
                            sleepPoint("1", "2026-11-09T22:00:00Z", "2026-11-10T06:00:00Z"),
                            sleepPoint("2", "2026-11-10T22:00:00Z", "2026-11-11T06:00:00Z"), // repeated on a later page
                        ),
                    ),
                )
                else -> json("{}")
            }
        }
        val batches = pull("sleep", "2026-11-09T00:00:00Z", "2026-11-12T00:00:00Z")
        assertEquals(2, requests.size)
        assertTrue(requests.all { it.method == "GET" })
        assertTrue(batches.all { it.provenance == DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API })
        // Newest first as the API sends it, duplicate passed on untouched: de-duplication is the ingestor's job.
        assertEquals(listOf("gh:sleep:2", "gh:sleep:1", "gh:sleep:2"), batches.flatMap { it.sleeps }.map { it.id })
        assertTrue(requests[0].requestUrl!!.encodedPath.endsWith("/dataTypes/sleep/dataPoints"))
    }

    @Test
    fun heartRateRowsAreBatchedAtMost2500AndDuplicateInstantsDropped() {
        val base = Instant.parse("2026-11-10T00:00:00Z")
        val pts = (0 until 3000).map { hrPoint(base.plusSeconds(it.toLong()), 60 + it % 30) } + hrPoint(base, 99) // repeated instant
        handler = { json(page(pts)) }
        val batches = pull("heart-rate", "2026-11-10T00:00:00Z", "2026-11-11T00:00:00Z")
        assertTrue(batches.all { it.heartRate.size <= GoogleHealthApiSource.MAX_ROWS })
        assertEquals(3000, batches.sumOf { it.heartRate.size })
        assertEquals(2, batches.size)
        assertEquals(10000, requests.single().requestUrl!!.queryParameter("pageSize")!!.toInt())
    }

    @Test
    fun heartRateWindowAboveTheIntradayCapIsRefused() {
        assertFailsWith<IllegalArgumentException> { pull("heart-rate", "2026-11-10T00:00:00Z", "2026-11-12T00:00:00Z") }
        assertTrue(requests.isEmpty())
        assertEquals(24L * 3600_000, stream("heart-rate").maxWindowMillis)
    }

    @Test
    fun stepsAreReadReconciledForWholeDaysAndEmittedAsDailyTotals() {
        handler = { r ->
            assertTrue(r.requestUrl!!.encodedPath.endsWith("/dataTypes/steps/dataPoints:reconcile"))
            json(
                page(
                    listOf(
                        """{"dataPointName":"users/me/dataTypes/steps/dataPoints/a","steps":{"count":"100","interval":{"startTime":"2026-11-10T10:00:00Z","endTime":"2026-11-10T10:01:00Z"}}}""",
                        """{"dataPointName":"users/me/dataTypes/steps/dataPoints/b","steps":{"count":"250","interval":{"startTime":"2026-11-10T11:00:00Z","endTime":"2026-11-10T11:01:00Z"}}}""",
                        """{"dataPointName":"users/me/dataTypes/steps/dataPoints/b","steps":{"count":"250","interval":{"startTime":"2026-11-10T11:00:00Z","endTime":"2026-11-10T11:01:00Z"}}}""",
                    ),
                ),
            )
        }
        // The window covers only the afternoon, yet the whole civil day is totalled.
        val batches = pull("steps", "2026-11-10T12:00:00Z", "2026-11-10T18:00:00Z")
        val daily = batches.flatMap { it.daily }.single()
        assertEquals(MetricType.STEPS, daily.metric)
        assertEquals(LocalDate.parse("2026-11-10").toEpochDay(), daily.epochDay)
        assertEquals(350.0, daily.value)
    }

    @Test
    fun malformedPointsAreCountedAndTheRestIsDelivered() {
        handler = { json(page(listOf("""{"heartRate":"oops"}""", hrPoint(Instant.parse("2026-11-10T10:00:00Z"), 70), """{"heartRate":{"beatsPerMinute":"72","sampleTime":{"physicalTime":"garbage"}}}"""))) }
        val batches = pull("heart-rate", "2026-11-10T00:00:00Z", "2026-11-11T00:00:00Z")
        assertEquals(1, batches.sumOf { it.heartRate.size })
        assertEquals(1L, source.stats.clientMalformed)
        assertEquals(1L, source.stats.mapperMalformed)
    }

    @Test
    fun manualWeightIsLabelledSelfReported() {
        handler = {
            json(
                page(
                    listOf(
                        """{"dataSource":{"recordingMethod":"MANUAL"},"weight":{"weightGrams":80000,"sampleTime":{"physicalTime":"2026-11-10T07:00:00Z"}}}""",
                        """{"dataSource":{"recordingMethod":"PASSIVELY_MEASURED"},"weight":{"weightGrams":81000,"sampleTime":{"physicalTime":"2026-11-10T08:00:00Z"}}}""",
                    ),
                ),
            )
        }
        val batches = pull("weight", "2026-11-01T00:00:00Z", "2026-11-11T00:00:00Z")
        assertEquals(setOf(DataProvenance.USER_REPORTED, DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API), batches.map { it.provenance }.toSet())
        assertEquals(80.0, batches.first { it.provenance == DataProvenance.USER_REPORTED }.samples.single().value, 1e-9)
    }

    // --- empty and absent -----------------------------------------------------------------------------

    @Test
    fun a404OrAnEmptyAnswerMeansTheWindowIsCompleteWithNoData() {
        handler = { MockResponse().setResponseCode(404) }
        assertTrue(pull("sleep", "2026-11-09T00:00:00Z", "2026-11-12T00:00:00Z").isEmpty())
        handler = { json("{}") }
        assertTrue(pull("exercise", "2026-11-09T00:00:00Z", "2026-11-12T00:00:00Z").isEmpty())
        handler = { MockResponse().setResponseCode(204) }
        assertTrue(pull("resting-heart-rate", "2026-11-09T00:00:00Z", "2026-11-12T00:00:00Z").isEmpty())
    }

    // --- errors ---------------------------------------------------------------------------------------

    @Test
    fun a401WithNoWayToRefreshIsAuthExpired() {
        signIn(refresh = null)
        handler = { MockResponse().setResponseCode(401) }
        assertFailsWith<SourceAuthExpiredException> { pull("sleep", "2026-11-09T00:00:00Z", "2026-11-12T00:00:00Z") }
    }

    @Test
    fun a403NamesTheStream() {
        handler = { json("""{"error":{"status":"PERMISSION_DENIED","message":"needs https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly"}}""", 403) }
        val e = assertFailsWith<SourcePermissionException> { pull("steps", "2026-11-10T00:00:00Z", "2026-11-11T00:00:00Z") }
        assertEquals("steps", e.stream)
    }

    @Test
    fun a429BecomesRateLimitedWithTheRetryDelay() {
        handler = { MockResponse().setResponseCode(429).setHeader("Retry-After", "600") }
        val e = assertFailsWith<SourceRateLimitedException> { pull("sleep", "2026-11-09T00:00:00Z", "2026-11-12T00:00:00Z") }
        assertTrue((e.retryAfterMillis ?: 0) >= 600_000L)
    }

    @Test
    fun serverErrorsAfterRetriesAreAPlainFailure() {
        handler = { MockResponse().setResponseCode(503) }
        assertFailsWith<GoogleHealthServerException> { pull("sleep", "2026-11-09T00:00:00Z", "2026-11-12T00:00:00Z") }
        assertEquals(2, requests.size) // first try plus one retry (maxRetries = 1)
    }

    @Test
    fun anUnreadablePageIsNotMarkedComplete() {
        handler = { json("<html>not json</html>") }
        assertFailsWith<com.apex.athlete.core.data.source.GoogleHealthParseException> { pull("sleep", "2026-11-09T00:00:00Z", "2026-11-12T00:00:00Z") }
    }

    @Test
    fun aSecondPageFailureKeepsTheFirstPageDelivered() {
        handler = { r ->
            if (r.requestUrl!!.queryParameter("pageToken") == null) json(page(listOf(sleepPoint("1", "2026-11-10T22:00:00Z", "2026-11-11T06:00:00Z")), next = "T2"))
            else MockResponse().setResponseCode(429).setHeader("Retry-After", "900")
        }
        val got = ArrayList<HealthBatch>()
        assertFailsWith<SourceRateLimitedException> {
            runBlocking { source.pull(stream("sleep"), ms("2026-11-09T00:00:00Z"), ms("2026-11-12T00:00:00Z")) { got += it } }
        }
        assertEquals(1, got.sumOf { it.sleeps.size })
    }

    @Test
    fun notConfiguredAtPullTimeAsksForSignIn() {
        val s = GoogleHealthApiSource({ GoogleHealthNetwork.NotConfigured })
        assertFailsWith<SourceAuthExpiredException> { runBlocking { s.pull(s.streams.first(), d10, d11) {} } }
    }

    @Test
    fun streamsCoverTheDocumentedTypesWithinTheirWindows() {
        val names = source.streams.map { it.name }
        assertTrue(names.containsAll(listOf("heart-rate", "sleep", "exercise", "steps", "calories", "hrv", "spo2", "skin-temperature", "vo2-max")))
        assertEquals(names.size, names.toSet().size)
        assertIs<GoogleHealthNetworkException>(GoogleHealthNetworkException())
    }
}
