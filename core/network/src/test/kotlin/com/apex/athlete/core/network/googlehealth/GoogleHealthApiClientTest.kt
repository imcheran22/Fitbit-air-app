package com.apex.athlete.core.network.googlehealth

import com.apex.athlete.core.network.TestStack
import com.apex.athlete.core.network.auth.AuthState
import com.apex.athlete.core.network.auth.GoogleHealthAuthConfig
import com.apex.athlete.core.network.auth.ReauthReason
import com.apex.athlete.core.network.auth.StoredTokens
import com.apex.athlete.core.network.json
import com.apex.athlete.core.network.rate.RateLimitConfig
import com.apex.athlete.core.network.rate.RequestPriority
import kotlinx.coroutines.runBlocking
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.SocketPolicy
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

private fun hrPoint(bpm: String, t: String) =
    """{"heartRate":{"beatsPerMinute":"$bpm","sampleTime":{"physicalTime":"$t","utcOffset":"3600s"}}}"""

private fun page(points: List<String>, next: String? = null) =
    """{"dataPoints":[${points.joinToString(",")}]${if (next != null) ""","nextPageToken":"$next"""" else ""}}"""

class GoogleHealthApiClientTest {
    private var stack = TestStack()
    private val hr = ListRequest(GoogleHealthDataType.HEART_RATE)

    @AfterTest fun tearDown() = stack.shutdown()

    private fun <T> run(block: suspend () -> T): T = runBlocking { block() }
    private fun fail(r: ApiResult<*>) = assertIs<ApiResult.Failure>(r).error
    private fun apiRequests() = stack.dispatcher.requests.filter { it.path != "/token" }

    // ---- request shape --------------------------------------------------------------------------

    @Test
    fun buildsTheDocumentedListRequest() {
        stack.dispatcher.handler = { json("{}") }
        val filter = GoogleHealthFilter.timeRange(
            GoogleHealthDataType.HEART_RATE, Instant.parse("2026-11-10T00:00:00Z"), Instant.parse("2026-11-11T00:00:00Z"), ZoneId.of("UTC"),
        )
        run { stack.client.listPage(hr.copy(filter = filter, pageSize = 50_000, dataSourceFamily = DataSourceFamily.GOOGLE_WEARABLES), "TOK") }
        val req = apiRequests().single()
        assertEquals("GET", req.method)
        val url = req.requestUrl!!
        assertEquals("/v4/users/me/dataTypes/heart-rate/dataPoints", url.encodedPath)
        assertEquals(
            "heart_rate.sample_time.physical_time >= \"2026-11-10T00:00:00Z\" AND heart_rate.sample_time.physical_time < \"2026-11-11T00:00:00Z\"",
            url.queryParameter("filter"),
        )
        assertEquals("10000", url.queryParameter("pageSize"))
        assertEquals("users/me/dataSourceFamilies/google-wearables", url.queryParameter("dataSourceFamily"))
        assertEquals("TOK", url.queryParameter("pageToken"))
    }

    @Test
    fun sleepAndExercisePageSizeIsCappedAt25AndReconcileUsesItsOwnPath() {
        stack.dispatcher.handler = { json("{}") }
        run { stack.client.listPage(ListRequest(GoogleHealthDataType.SLEEP, pageSize = 100, reconcile = true)) }
        val url = apiRequests().single().requestUrl!!
        assertEquals("/v4/users/me/dataTypes/sleep/dataPoints:reconcile", url.encodedPath)
        assertEquals("25", url.queryParameter("pageSize"))
    }

    @Test
    fun onlyGetRequestsAreEverSent() {
        stack.dispatcher.handler = { json("{\"pairedDevices\":[]}") }
        run {
            stack.client.listPage(hr); stack.client.getIdentity(); stack.client.listPairedDevices()
        }
        assertTrue(apiRequests().all { it.method == "GET" })
    }

    // ---- filters --------------------------------------------------------------------------------

    @Test
    fun filterBuilderFollowsTheDiscoveryGrammar() {
        val from = Instant.parse("2026-11-01T00:00:00Z")
        val to = Instant.parse("2026-11-04T00:00:00Z")
        val utc = ZoneId.of("UTC")
        assertEquals(
            "steps.interval.start_time >= \"2026-11-01T00:00:00Z\" AND steps.interval.start_time < \"2026-11-04T00:00:00Z\"",
            GoogleHealthFilter.timeRange(GoogleHealthDataType.STEPS, from, to, utc),
        )
        assertEquals(
            "sleep.interval.end_time >= \"2026-11-01T00:00:00Z\" AND sleep.interval.end_time < \"2026-11-04T00:00:00Z\"",
            GoogleHealthFilter.timeRange(GoogleHealthDataType.SLEEP, from, to, utc),
        )
        assertEquals(
            "daily_heart_rate_variability.date >= \"2026-11-01\" AND daily_heart_rate_variability.date < \"2026-11-04\"",
            GoogleHealthFilter.timeRange(GoogleHealthDataType.DAILY_HEART_RATE_VARIABILITY, from, to, utc),
        )
        assertEquals(
            "exercise.interval.civil_start_time >= \"2026-10-31T00:00:00\" AND exercise.interval.civil_start_time < \"2026-11-06T00:00:00\"",
            GoogleHealthFilter.timeRange(GoogleHealthDataType.EXERCISE, from, to, utc),
        )
        assertEquals(
            "daily_resting_heart_rate.date >= \"2026-11-01\" AND daily_resting_heart_rate.date < \"2026-11-02\"",
            GoogleHealthFilter.dateRange(GoogleHealthDataType.DAILY_RESTING_HEART_RATE, LocalDate.of(2026, 11, 1), LocalDate.of(2026, 11, 2)),
        )
        assertEquals("steps.interval.start_time >= \"2026-11-01T00:00:00Z\"", GoogleHealthFilter.since(GoogleHealthDataType.STEPS, from, utc))
    }

    @Test
    fun dailyFilterUsesTheZoneForTheCivilDate() {
        val tokyo = ZoneId.of("Asia/Tokyo")
        // 2026-11-01T00:00Z is 09:00 on 11-01 in Tokyo; the end instant is exclusive.
        val f = GoogleHealthFilter.timeRange(
            GoogleHealthDataType.DAILY_OXYGEN_SATURATION, Instant.parse("2026-11-01T00:00:00Z"), Instant.parse("2026-11-02T15:00:00Z"), tokyo,
        )
        assertEquals("daily_oxygen_saturation.date >= \"2026-11-01\" AND daily_oxygen_saturation.date < \"2026-11-03\"", f)
    }

    @Test
    fun everyDataTypeIdIsKebabCaseAndUnique() {
        val ids = GoogleHealthDataType.entries.map { it.id }
        assertEquals(ids.size, ids.toSet().size)
        assertTrue(ids.all { Regex("[a-z0-9]+(-[a-z0-9]+)*").matches(it) })
        assertEquals("daily_sleep_temperature_derivations", GoogleHealthDataType.DAILY_SLEEP_TEMPERATURE_DERIVATIONS.filterField)
    }

    // ---- parsing and tolerance ----------------------------------------------------------------

    @Test
    fun parsesHeartRateWithInt64StringsAndIgnoresUnknownFieldsAndEnums() {
        val body = """{"dataPoints":[{"heartRate":{"beatsPerMinute":"61","sampleTime":{"physicalTime":"2026-11-10T22:00:00Z","utcOffset":"-18000s","futureField":{"a":1}},
            "metadata":{"sensorLocation":"BRAND_NEW_PLACE","motionContext":"SEDENTARY"}},"dataSource":{"platform":"FITBIT","recordingMethod":"NEW_METHOD","device":{"formFactor":"HOLOGRAM"}},"somethingElse":true}],"nextPageToken":"","extra":1}"""
        stack.dispatcher.handler = { json(body) }
        val page = assertIs<ApiResult.Success<DataPointsPage>>(run { stack.client.listPage(hr) }).value
        assertEquals(1, page.dataPoints.size)
        assertNull(page.nextPageToken, "empty token means complete")
        val p = page.dataPoints.single()
        assertEquals(61L, p.heartRate?.beatsPerMinute)
        assertEquals(Instant.parse("2026-11-10T22:00:00Z"), GoogleTime.parseInstant(p.heartRate?.sampleTime?.physicalTime))
        assertEquals(-18000, GoogleTime.offsetSeconds(p.heartRate?.sampleTime?.utcOffset))
        assertEquals("BRAND_NEW_PLACE", p.heartRate?.metadata?.sensorLocation)
        assertEquals("HOLOGRAM", p.dataSource?.device?.formFactor)
    }

    @Test
    fun parsesSleepWithStagesAndTolerantNumbers() {
        val body = """{"dataPoints":[{"name":"users/me/dataTypes/sleep/dataPoints/abc","sleep":{"type":"STAGES",
          "interval":{"startTime":"2026-11-10T22:30:00Z","endTime":"2026-11-11T06:30:00Z","startUtcOffset":"0s","endUtcOffset":"0s"},
          "stages":[{"type":"LIGHT","startTime":"2026-11-10T22:30:00Z","endTime":"2026-11-10T23:30:00Z"},{"type":"QUANTUM","startTime":"2026-11-10T23:30:00Z","endTime":"2026-11-11T00:00:00Z"}],
          "summary":{"minutesAsleep":"450","minutesAwake":30,"stagesSummary":[{"type":"DEEP","count":"3","minutes":"80"}]},
          "metadata":{"mainSleep":true,"nap":false,"processed":true,"stagesStatus":"SUCCEEDED"}}}]}"""
        stack.dispatcher.handler = { json(body) }
        val sleep = assertIs<ApiResult.Success<DataPointsPage>>(run { stack.client.listPage(ListRequest(GoogleHealthDataType.SLEEP)) })
            .value.dataPoints.single()
        assertEquals("users/me/dataTypes/sleep/dataPoints/abc", sleep.resourceName)
        val s = assertNotNull(sleep.sleep)
        assertEquals(450L, s.summary?.minutesAsleep)
        assertEquals(30L, s.summary?.minutesAwake, "numbers are accepted where strings are documented")
        assertEquals(80L, s.summary?.stagesSummary?.single()?.minutes)
        assertEquals(listOf("LIGHT", "QUANTUM"), s.stages.map { it.type })
        assertEquals(true, s.metadata?.mainSleep)
    }

    @Test
    fun parsesDailyAndExerciseShapes() {
        val body = """{"dataPoints":[
          {"dailyHeartRateVariability":{"date":{"year":2026,"month":11,"day":10},"averageHeartRateVariabilityMilliseconds":42.5,"deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds":"51.0"}},
          {"dailyOxygenSaturation":{"date":{"year":2026,"month":11,"day":10},"averagePercentage":96.1,"lowerBoundPercentage":93,"upperBoundPercentage":98.4}},
          {"dailySleepTemperatureDerivations":{"date":{"year":2026,"month":11,"day":10},"nightlyTemperatureCelsius":33.9,"baselineTemperatureCelsius":34.1}},
          {"exercise":{"exerciseType":"RUNNING","displayName":"Run","activeDuration":"1800s","interval":{"startTime":"2026-11-10T07:00:00Z","endTime":"2026-11-10T07:32:00Z"},
            "metricsSummary":{"caloriesKcal":310.5,"distanceMillimeters":5200000,"averageHeartRateBeatsPerMinute":"152","heartRateZoneDurations":{"peakTime":"60s","lightTime":"600s"}}}}]}"""
        stack.dispatcher.handler = { json(body) }
        val pts = assertIs<ApiResult.Success<DataPointsPage>>(run { stack.client.listPage(hr) }).value.dataPoints
        assertEquals(42.5, pts[0].dailyHeartRateVariability?.averageHeartRateVariabilityMilliseconds)
        assertEquals(51.0, pts[0].dailyHeartRateVariability?.deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds)
        assertEquals("2026-11-10", GoogleTime.isoDate(pts[0].dailyHeartRateVariability?.date))
        assertEquals(93.0, pts[1].dailyOxygenSaturation?.lowerBoundPercentage)
        assertEquals(33.9, pts[2].dailySleepTemperatureDerivations?.nightlyTemperatureCelsius)
        val ex = assertNotNull(pts[3].exercise)
        assertEquals("RUNNING", ex.exerciseType)
        assertEquals(1_800_000L, GoogleTime.durationMillis(ex.activeDuration))
        assertEquals(152L, ex.metricsSummary?.averageHeartRateBeatsPerMinute)
        assertEquals(60_000L, GoogleTime.durationMillis(ex.metricsSummary?.heartRateZoneDurations?.peakTime))
    }

    @Test
    fun googleTimeHelpersAreTolerant() {
        assertNull(GoogleTime.parseInstant("yesterday"))
        assertNull(GoogleTime.parseInstant(null))
        assertEquals(Instant.parse("2026-11-10T21:00:00Z"), GoogleTime.parseInstant("2026-11-10T22:00:00+01:00"))
        assertEquals(Instant.parse("2026-11-10T22:00:00.123Z"), GoogleTime.parseInstant("2026-11-10T22:00:00.123Z"))
        assertEquals(500L, GoogleTime.durationMillis("0.5s"))
        assertNull(GoogleTime.durationMillis("5m"))
        assertNull(GoogleTime.durationMillis("abs"))
        assertNull(GoogleTime.isoDate(GhDate(2026, 13, 1)))
        assertNull(GoogleTime.isoDate(GhDate(2026, null, 1)))
    }

    @Test
    fun oneBadPointIsCountedAndSkippedNotFatal() {
        val body = """{"dataPoints":[${hrPoint("60", "2026-11-10T22:00:00Z")},{"heartRate":"oops"},${hrPoint("61", "2026-11-10T22:01:00Z")}]}"""
        stack.dispatcher.handler = { json(body) }
        val p = assertIs<ApiResult.Success<DataPointsPage>>(run { stack.client.listPage(hr) }).value
        assertEquals(2, p.dataPoints.size)
        assertEquals(3, p.receivedCount)
        assertEquals(1, p.malformedCount)
    }

    @Test
    fun truncatedJsonIsATypedParseFailureWithoutTheBodyInAnyMessage() {
        val secret = "SECRET-HEALTH-VALUE-1234"
        stack.dispatcher.handler = { json("{\"dataPoints\":[{\"heartRate\":{\"beatsPerMinute\":\"$secret") }
        val error = fail(run { stack.client.listPage(hr) })
        val pf = assertIs<GoogleHealthError.ParseFailure>(error)
        assertTrue(pf.bodyBytes > 0)
        assertFalse(error.toString().contains(secret))
        assertFalse(GoogleHealthException(error).message.orEmpty().contains(secret))
        assertEquals(1, apiRequests().size, "a parse failure is not retried")
    }

    @Test
    fun wrongShapedTopLevelOrDataPointsIsAParseFailure() {
        stack.dispatcher.handler = { json("[1,2,3]") }
        assertIs<GoogleHealthError.ParseFailure>(fail(run { stack.client.listPage(hr) }))
        stack.dispatcher.handler = { json("{\"dataPoints\":{\"a\":1}}") }
        assertIs<GoogleHealthError.ParseFailure>(fail(run { stack.client.listPage(hr) }))
    }

    @Test
    fun readAllFailsLoudlyWhenEveryPointIsMalformed() {
        stack.dispatcher.handler = { json("""{"dataPoints":[{"heartRate":"x"},{"heartRate":[1]}]}""") }
        val error = fail(run { stack.client.readAll(hr) })
        assertEquals(GoogleHealthError.ParseFailure(0, 2, 0), error)
    }

    // ---- pagination -----------------------------------------------------------------------------

    @Test
    fun followsPageTokensUntilNoneIsLeft() {
        stack.dispatcher.handler = { req ->
            when (req.requestUrl?.queryParameter("pageToken")) {
                null -> json(page(listOf(hrPoint("60", "2026-11-10T22:02:00Z")), "p2"))
                "p2" -> json(page(listOf(hrPoint("61", "2026-11-10T22:01:00Z")), "p3"))
                else -> json(page(listOf(hrPoint("62", "2026-11-10T22:00:00Z"))))
            }
        }
        val seen = ArrayList<List<Long?>>()
        val summary = assertIs<ApiResult.Success<PageReadSummary>>(
            run { stack.client.forEachPage(hr) { seen += it.dataPoints.map { p -> p.heartRate?.beatsPerMinute } } },
        ).value
        assertEquals<List<List<Long?>>>(listOf(listOf(60L), listOf(61L), listOf(62L)), seen)
        assertEquals(PageReadSummary(3, 3, 0, PageStopReason.COMPLETE), summary)
    }

    @Test
    fun aRepeatedTokenEndsTheReadInsteadOfLoopingForever() {
        stack.dispatcher.handler = { json(page(listOf(hrPoint("60", "2026-11-10T22:00:00Z")), "same")) }
        val all = ArrayList<DataPoint>()
        val summary = assertIs<ApiResult.Success<PageReadSummary>>(run { stack.client.forEachPage(hr) { all += it.dataPoints } }).value
        assertEquals(PageStopReason.REPEATED_TOKEN, summary.stopReason)
        assertEquals(2, summary.pages)
        assertEquals(2, apiRequests().size)
        assertEquals(2, all.size, "duplicates are returned; de-duplication belongs to the ingestor")
    }

    @Test
    fun aTokenThatEqualsTheStartTokenEndsTheRead() {
        stack.dispatcher.handler = { json(page(listOf(hrPoint("60", "2026-11-10T22:00:00Z")), "start")) }
        val summary = assertIs<ApiResult.Success<PageReadSummary>>(
            run { stack.client.forEachPage(hr.copy(startPageToken = "start")) { } },
        ).value
        assertEquals(PageStopReason.REPEATED_TOKEN, summary.stopReason)
        assertEquals(1, summary.pages)
    }

    @Test
    fun outOfOrderPagesAreReturnedAsReceived() {
        stack.dispatcher.handler = { req ->
            if (req.requestUrl?.queryParameter("pageToken") == null) json(page(listOf(hrPoint("1", "2026-11-10T10:00:00Z")), "n"))
            else json(page(listOf(hrPoint("2", "2026-11-10T09:00:00Z"), hrPoint("3", "2026-11-10T11:00:00Z"))))
        }
        val all = assertIs<ApiResult.Success<List<DataPoint>>>(run { stack.client.readAll(hr) }).value
        assertEquals(listOf(1L, 2L, 3L), all.map { it.heartRate?.beatsPerMinute })
    }

    @Test
    fun pageCapStopsARunawayServer() {
        stack.shutdown()
        stack = TestStack(clientConfig = GoogleHealthClientConfig(maxPages = 3, allowInsecureHttp = true))
        val n = java.util.concurrent.atomic.AtomicInteger()
        stack.dispatcher.handler = { json(page(listOf(hrPoint("60", "2026-11-10T22:00:00Z")), "t${n.incrementAndGet()}")) }
        val summary = assertIs<ApiResult.Success<PageReadSummary>>(run { stack.client.forEachPage(hr) { } }).value
        assertEquals(PageStopReason.PAGE_CAP, summary.stopReason)
        assertEquals(3, summary.pages)
    }

    @Test
    fun tokenExpiryDuringAPaginatedReadIsRefreshedAndTheReadCompletes() {
        stack.dispatcher.handler = { req ->
            val auth = req.getHeader("Authorization")
            when {
                req.path == "/token" -> json(TestStack.tokenJson("access-2", null))
                req.requestUrl?.queryParameter("pageToken") == null -> json(page(listOf(hrPoint("60", "2026-11-10T22:02:00Z")), "p2"))
                auth == "Bearer access-1" -> MockResponse().setResponseCode(401) // expired between pages
                else -> json(page(listOf(hrPoint("61", "2026-11-10T22:01:00Z"))))
            }
        }
        val all = assertIs<ApiResult.Success<List<DataPoint>>>(run { stack.client.readAll(hr) }).value
        assertEquals(listOf(60L, 61L), all.map { it.heartRate?.beatsPerMinute })
        assertEquals(1, stack.dispatcher.count("/token"))
        assertEquals("access-2", stack.store.load()?.accessToken)
    }

    @Test
    fun aFailureMidwayKeepsEarlierPagesWithTheCaller() {
        stack.dispatcher.handler = { req ->
            if (req.requestUrl?.queryParameter("pageToken") == null) json(page(listOf(hrPoint("60", "2026-11-10T22:02:00Z")), "p2"))
            else MockResponse().setResponseCode(400)
        }
        val seen = ArrayList<DataPoint>()
        val error = fail(run { stack.client.forEachPage(hr) { seen += it.dataPoints } })
        assertEquals(GoogleHealthError.BadRequest(400, null), error)
        assertEquals(1, seen.size)
    }

    // ---- no data --------------------------------------------------------------------------------

    @Test
    fun a404IsNoDataNotAnError() {
        stack.dispatcher.handler = { MockResponse().setResponseCode(404).setBody("{\"error\":{\"code\":404,\"status\":\"NOT_FOUND\"}}") }
        assertEquals(ApiResult.NoData, run { stack.client.listPage(hr) })
        assertEquals(ApiResult.NoData, run { stack.client.forEachPage(hr) { } })
        assertEquals(ApiResult.NoData, run { stack.client.readAll(hr) })
        assertEquals(ApiResult.NoData, run { stack.client.getIdentity() })
        assertEquals(4, apiRequests().size)
    }

    @Test
    fun anEmptyAnswerIsNoDataAndEmptyBodiesToo() {
        stack.dispatcher.handler = { json("{}") }
        assertEquals(ApiResult.NoData, run { stack.client.forEachPage(hr) { } })
        stack.dispatcher.handler = { json("{\"dataPoints\":[]}") }
        assertEquals(ApiResult.NoData, run { stack.client.readAll(hr) })
        stack.dispatcher.handler = { MockResponse().setResponseCode(204) }
        assertEquals(ApiResult.NoData, run { stack.client.listPage(hr) })
        stack.dispatcher.handler = { MockResponse().setResponseCode(200).setBody("") }
        assertEquals(ApiResult.NoData, run { stack.client.listPage(hr) })
    }

    // ---- 403 ------------------------------------------------------------------------------------

    @Test
    fun a403NamesTheScopeGoogleMentions() {
        val body = """{"error":{"code":403,"status":"PERMISSION_DENIED","message":"Request had insufficient authentication scopes. Needs https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly.",
            "details":[{"@type":"type.googleapis.com/google.rpc.ErrorInfo","reason":"ACCESS_TOKEN_SCOPE_INSUFFICIENT","domain":"googleapis.com"}]}}"""
        stack.dispatcher.handler = { json(body, 403) }
        val e = assertIs<GoogleHealthError.PermissionDenied>(fail(run { stack.client.listPage(ListRequest(GoogleHealthDataType.STEPS)) }))
        assertEquals(GoogleHealthAuthConfig.SCOPE_ACTIVITY, e.missingScope)
        assertFalse(e.scopeInferred)
        assertEquals("ACCESS_TOKEN_SCOPE_INSUFFICIENT", e.reason)
        assertTrue(GoogleHealthException(e).message.orEmpty().contains("activity_and_fitness"))
    }

    @Test
    fun a403FallsBackToComparingGrantedScopesWithTheLikelyOnes() {
        stack.dispatcher.handler = { json("{\"error\":{\"code\":403,\"status\":\"PERMISSION_DENIED\"}}", 403) }
        // Granted: sleep only. Steps need an activity or health-metrics scope.
        val e = assertIs<GoogleHealthError.PermissionDenied>(fail(run { stack.client.listPage(ListRequest(GoogleHealthDataType.STEPS)) }))
        assertEquals(GoogleHealthAuthConfig.SCOPE_ACTIVITY, e.missingScope)
        assertTrue(e.scopeInferred)
        assertEquals("PERMISSION_DENIED", e.reason)
    }

    @Test
    fun a403WithoutAnyEvidenceDoesNotInventAScope() {
        stack.shutdown()
        stack = TestStack(scopes = GoogleHealthAuthConfig.READ_SCOPES.toSet())
        stack.dispatcher.handler = { MockResponse().setResponseCode(403).setBody("<html>nope</html>") }
        val e = assertIs<GoogleHealthError.PermissionDenied>(fail(run { stack.client.listPage(ListRequest(GoogleHealthDataType.STEPS)) }))
        assertNull(e.missingScope)
        assertNull(e.reason)
    }

    @Test
    fun a403ReadsTheScopeFromWwwAuthenticate() {
        stack.dispatcher.handler = {
            MockResponse().setResponseCode(403).setHeader(
                "WWW-Authenticate",
                "Bearer error=\"insufficient_scope\", scope=\"https://www.googleapis.com/auth/googlehealth.sleep.readonly\"",
            )
        }
        val e = assertIs<GoogleHealthError.PermissionDenied>(fail(run { stack.client.listPage(ListRequest(GoogleHealthDataType.SLEEP)) }))
        assertEquals(GoogleHealthAuthConfig.SCOPE_SLEEP, e.missingScope)
    }

    @Test
    fun a403IsNotRetried() {
        stack.dispatcher.handler = { MockResponse().setResponseCode(403) }
        run { stack.client.listPage(hr) }
        assertEquals(1, apiRequests().size)
    }

    // ---- 429 and budget --------------------------------------------------------------------------

    @Test
    fun a429HonoursRetryAfterThenSucceeds() {
        var calls = 0
        stack.dispatcher.handler = {
            if (++calls == 1) MockResponse().setResponseCode(429).setHeader("Retry-After", "7") else json(page(listOf(hrPoint("60", "2026-11-10T22:00:00Z"))))
        }
        assertIs<ApiResult.Success<*>>(run { stack.client.listPage(hr) })
        assertEquals(2, apiRequests().size)
        assertTrue(stack.sleeper.sleeps.sum() >= 7_000, "waited at least Retry-After: ${stack.sleeper.sleeps}")
        assertEquals(null, stack.limiter.state.value.blockedUntilMillis, "pause elapsed")
    }

    @Test
    fun aLongRetryAfterIsReturnedNotSlept_andPausesLaterCallsWithoutNetwork() {
        stack.dispatcher.handler = { MockResponse().setResponseCode(429).setHeader("Retry-After", "600") }
        val e = assertIs<GoogleHealthError.RateLimited>(fail(run { stack.client.listPage(hr) }))
        assertEquals(600_000L, e.retryAfterMillis)
        assertEquals(1, apiRequests().size)
        assertTrue(stack.sleeper.sleeps.isEmpty())
        val again = assertIs<GoogleHealthError.RateLimited>(fail(run { stack.client.listPage(hr) }))
        assertTrue(again.retryAfterMillis!! > 0)
        assertEquals(1, apiRequests().size, "the shared pause stops further requests")
    }

    @Test
    fun a429HttpDateRetryAfterIsUnderstood() {
        stack.dispatcher.handler = {
            val at = java.time.format.DateTimeFormatter.RFC_1123_DATE_TIME.format(
                java.time.ZonedDateTime.ofInstant(Instant.ofEpochMilli(stack.clock.nowMillis() + 5_000), ZoneId.of("GMT")),
            )
            MockResponse().setResponseCode(429).setHeader("Retry-After", at)
        }
        val e = assertIs<GoogleHealthError.RateLimited>(fail(run { stack.client.listPage(hr) }))
        assertTrue(e.retryAfterMillis!! >= 4_000)
    }

    @Test
    fun persistent429sGiveUpAfterTheRetryLimit() {
        stack.dispatcher.handler = { MockResponse().setResponseCode(429) }
        assertIs<GoogleHealthError.RateLimited>(fail(run { stack.client.listPage(hr) }))
        assertEquals(4, apiRequests().size) // first try + 3 retries
    }

    @Test
    fun anExhaustedLocalBudgetReturnsRateLimitedWithoutCallingTheServer() {
        stack.shutdown()
        stack = TestStack(rateConfig = RateLimitConfig(windowMillis = 3_600_000, maxRequestsPerWindow = 2, foregroundReserve = 1))
        stack.dispatcher.handler = { json("{}") }
        run { stack.client.listPage(hr) } // background: 2 - 1 reserve = 1 allowed
        val e = assertIs<GoogleHealthError.RateLimited>(fail(run { stack.client.listPage(hr) }))
        assertTrue(e.retryAfterMillis!! > 15_000)
        assertEquals(1, apiRequests().size)
        // The foreground may use the reserve.
        assertIs<ApiResult.NoData>(run { stack.client.forEachPage(hr.copy(priority = RequestPriority.FOREGROUND)) { } })
        assertEquals(2, apiRequests().size)
    }

    @Test
    fun serverRateLimitHeadersFeedTheSharedState() {
        stack.dispatcher.handler = { json("{}").setHeader("RateLimit-Remaining", "42").setHeader("RateLimit-Limit", "100") }
        run { stack.client.listPage(hr) }
        assertEquals(42, stack.limiter.state.value.remaining)
        assertEquals(100, stack.limiter.state.value.limit)
    }

    // ---- 5xx, network, 401 ----------------------------------------------------------------------

    @Test
    fun a5xxIsRetriedWithJitterThenSucceeds() {
        var calls = 0
        stack.dispatcher.handler = { if (++calls < 3) MockResponse().setResponseCode(503) else json(page(listOf(hrPoint("60", "2026-11-10T22:00:00Z")))) }
        assertIs<ApiResult.Success<*>>(run { stack.client.listPage(hr) })
        assertEquals(3, apiRequests().size)
        assertEquals(listOf(500L, 1000L), stack.sleeper.sleeps.toList(), "full jitter at 0.5 of 1 s and 2 s")
    }

    @Test
    fun a5xxThatNeverRecoversIsAServerErrorAfterBoundedRetries() {
        stack.dispatcher.handler = { MockResponse().setResponseCode(500) }
        assertEquals(GoogleHealthError.ServerError(500, 4), fail(run { stack.client.listPage(hr) }))
        assertEquals(4, apiRequests().size)
    }

    @Test
    fun aDroppedConnectionIsRetriedThenReportedAsNetwork() {
        var calls = 0
        stack.dispatcher.handler = {
            if (++calls == 1) MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST) else json(page(listOf(hrPoint("60", "2026-11-10T22:00:00Z"))))
        }
        assertIs<ApiResult.Success<*>>(run { stack.client.listPage(hr) })
        stack.dispatcher.handler = { MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST) }
        assertEquals(GoogleHealthError.Network(4), fail(run { stack.client.listPage(hr) }))
    }

    @Test
    fun aBodyCutShortIsNeverReturnedAsData() {
        stack.dispatcher.handler = {
            json(page(listOf(hrPoint("60", "2026-11-10T22:00:00Z")))).setSocketPolicy(SocketPolicy.DISCONNECT_DURING_RESPONSE_BODY)
        }
        val e = fail(run { stack.client.listPage(hr) })
        assertTrue(e is GoogleHealthError.Network || e is GoogleHealthError.ParseFailure, e.toString())
    }

    @Test
    fun a401WithAWorkingRefreshIsTransparent_andAFailedOneIsAuthExpired() {
        stack.dispatcher.handler = { req ->
            if (req.path == "/token") json("{\"error\":\"invalid_grant\"}", 400) else MockResponse().setResponseCode(401)
        }
        val e = assertIs<GoogleHealthError.AuthExpired>(fail(run { stack.client.listPage(hr) }))
        assertEquals(ReauthReason.REFRESH_TOKEN_REJECTED, e.reason)
        assertIs<AuthState.NeedsReauth>(stack.store.currentState())
    }

    @Test
    fun otherClientErrorsAreBadRequestWithGoogleStatusOnly() {
        stack.dispatcher.handler = { json("{\"error\":{\"code\":400,\"status\":\"INVALID_ARGUMENT\",\"message\":\"filter secret-ish text\"}}", 400) }
        val e = assertIs<GoogleHealthError.BadRequest>(fail(run { stack.client.listPage(hr) }))
        assertEquals("INVALID_ARGUMENT", e.status)
        assertFalse(e.toString().contains("secret-ish"))
    }

    // ---- identity and devices ---------------------------------------------------------------------

    @Test
    fun readsIdentityAndPagedDevices() {
        stack.dispatcher.handler = { req ->
            val url = req.requestUrl!!
            when {
                url.encodedPath == "/v4/users/me/identity" -> json("""{"name":"users/me/identity","healthUserId":"abc-123","legacyUserId":"X1"}""")
                url.queryParameter("pageToken") == null -> json("""{"pairedDevices":[{"deviceVersion":"Fitbit Air","deviceType":"TRACKER","batteryLevel":80,"lastSyncTime":"2026-11-11T06:00:00Z","features":["HEART_RATE","SPO2","NEW_FEATURE"]}],"nextPageToken":"d2"}""")
                else -> json("""{"pairedDevices":[{"deviceType":"SCALE"}]}""")
            }
        }
        val id = assertIs<ApiResult.Success<GhIdentity>>(run { stack.client.getIdentity() }).value
        assertEquals("abc-123", id.healthUserId)
        val devices = assertIs<ApiResult.Success<List<GhPairedDevice>>>(run { stack.client.listPairedDevices() }).value
        assertEquals(2, devices.size)
        assertEquals("Fitbit Air", devices[0].deviceVersion)
        assertEquals(Instant.parse("2026-11-11T06:00:00Z"), GoogleTime.parseInstant(devices[0].lastSyncTime))
        assertEquals("SCALE", devices[1].deviceType)
    }

    @Test
    fun noDevicesIsNoData() {
        stack.dispatcher.handler = { json("{}") }
        assertEquals(ApiResult.NoData, run { stack.client.listPairedDevices() })
    }

    @Test
    fun getOrThrowSurfacesTheTypedError() {
        stack.dispatcher.handler = { MockResponse().setResponseCode(403) }
        val r = run { stack.client.listPage(hr) }
        val ex = kotlin.runCatching { r.getOrThrow() }.exceptionOrNull()
        assertIs<GoogleHealthException>(ex)
        assertIs<GoogleHealthError.PermissionDenied>(ex.error)
    }

    @Test
    fun theClientRefusesAPlainHttpBaseUrlUnlessTestsAllowIt() {
        val ex = kotlin.runCatching {
            GoogleHealthApiClient(stack.http, stack.store, stack.limiter, GoogleHealthClientConfig(baseUrl = "http://health.googleapis.com/"))
        }.exceptionOrNull()
        assertIs<IllegalArgumentException>(ex)
    }

    @Test
    fun tokenStoreStateCarriesGrantedScopesForTheClient() {
        stack.store.save(StoredTokens("a", "r", stack.clock.nowMillis() + 3_600_000, GoogleHealthAuthConfig.READ_SCOPES.toSet(), stack.oauth.clientId))
        assertEquals(3, (stack.store.currentState() as AuthState.SignedIn).grantedScopes.size)
    }
}
