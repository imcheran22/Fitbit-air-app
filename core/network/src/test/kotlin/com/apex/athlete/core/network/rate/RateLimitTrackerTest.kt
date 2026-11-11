package com.apex.athlete.core.network.rate

import com.apex.athlete.core.network.FakeClock
import com.apex.athlete.core.network.FixedJitter
import okhttp3.Headers
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class RateLimitTrackerTest {
    private val clock = FakeClock()
    private val jitter = FixedJitter(0.5)
    private fun tracker(max: Int = 10, reserve: Int = 3) =
        RateLimitTracker(RateLimitConfig(windowMillis = 60_000, maxRequestsPerWindow = max, foregroundReserve = reserve), clock, jitter)

    @Test
    fun backgroundStopsAtTheReserveForegroundUsesIt() {
        val t = tracker()
        repeat(7) { assertEquals(BudgetDecision.Granted, t.tryAcquire(RequestPriority.BACKGROUND)) }
        assertIs<BudgetDecision.Wait>(t.tryAcquire(RequestPriority.BACKGROUND))
        repeat(3) { assertEquals(BudgetDecision.Granted, t.tryAcquire(RequestPriority.FOREGROUND)) }
        val wait = assertIs<BudgetDecision.Wait>(t.tryAcquire(RequestPriority.FOREGROUND))
        assertEquals(60_000L, wait.millis)
        assertEquals(0, t.state.value.remaining)
    }

    @Test
    fun budgetRefillsAsTheWindowSlides() {
        val t = tracker()
        repeat(7) { t.tryAcquire(RequestPriority.BACKGROUND) }
        clock.advance(60_000)
        assertEquals(BudgetDecision.Granted, t.tryAcquire(RequestPriority.BACKGROUND))
        assertEquals(9, t.state.value.remaining)
    }

    @Test
    fun serverReportedRemainingOverridesLocalCounting() {
        val t = tracker(max = 100, reserve = 0)
        t.onResponse(Headers.headersOf("RateLimit-Remaining", "1", "RateLimit-Limit", "50", "RateLimit-Reset", "30"))
        assertEquals(1, t.state.value.remaining)
        assertEquals(50, t.state.value.limit)
        assertEquals(clock.nowMillis() + 30_000, t.state.value.resetAtMillis)
        assertTrue(t.state.value.reportedByServer)
        assertEquals(BudgetDecision.Granted, t.tryAcquire(RequestPriority.FOREGROUND))
        assertEquals(BudgetDecision.Wait(30_000), t.tryAcquire(RequestPriority.FOREGROUND))
        clock.advance(30_000) // the server window rolled over
        assertEquals(BudgetDecision.Granted, t.tryAcquire(RequestPriority.FOREGROUND))
    }

    @Test
    fun parsesFitbitStyleAndEpochResetHeaders() {
        val t = tracker(max = 100, reserve = 0)
        t.onResponse(Headers.headersOf("Fitbit-Rate-Limit-Remaining", "7", "Fitbit-Rate-Limit-Reset", "120"))
        assertEquals(7, t.state.value.remaining)
        assertEquals(clock.nowMillis() + 120_000, t.state.value.resetAtMillis)
        val epoch = (clock.nowMillis() / 1000) + 90
        t.onResponse(Headers.headersOf("X-RateLimit-Remaining", "5", "X-RateLimit-Reset", epoch.toString()))
        assertEquals(epoch * 1000, t.state.value.resetAtMillis)
    }

    @Test
    fun garbageHeadersAreIgnored() {
        val t = tracker()
        t.onResponse(Headers.headersOf("RateLimit-Remaining", "lots", "RateLimit-Reset", "-3"))
        assertEquals(10, t.state.value.remaining)
        t.onResponse(Headers.headersOf())
    }

    @Test
    fun retryAfterAcceptsSecondsAndHttpDates() {
        val t = tracker()
        assertEquals(7_000L, t.parseRetryAfter("7"))
        assertEquals(0L, t.parseRetryAfter("0"))
        assertNull(t.parseRetryAfter("-5"))
        assertNull(t.parseRetryAfter("soon"))
        assertNull(t.parseRetryAfter(null))
        assertNull(t.parseRetryAfter(""))
        val now = RateLimitTracker.parseRetryAfter("Wed, 21 Oct 2015 07:28:10 GMT", java.time.Instant.parse("2015-10-21T07:28:00Z").toEpochMilli())
        assertEquals(10_000L, now)
        val past = RateLimitTracker.parseRetryAfter("Wed, 21 Oct 2015 07:28:00 GMT", java.time.Instant.parse("2015-10-21T07:29:00Z").toEpochMilli())
        assertEquals(0L, past)
        assertEquals(24L * 3600 * 1000, t.parseRetryAfter(Long.MAX_VALUE.toString()))
    }

    @Test
    fun rateLimitedPausesEveryCaller() {
        val t = tracker()
        t.onRateLimited(5_000)
        assertEquals(BudgetDecision.Wait(5_000), t.tryAcquire(RequestPriority.FOREGROUND))
        assertEquals(clock.nowMillis() + 5_000, t.state.value.blockedUntilMillis)
        clock.advance(5_000)
        assertEquals(BudgetDecision.Granted, t.tryAcquire(RequestPriority.FOREGROUND))
        assertNull(t.state.value.blockedUntilMillis)
    }

    @Test
    fun backoffIsExponentialFullJitterCappedAndHonoursRetryAfter() {
        val t = tracker()
        jitter.value = 1.0
        assertEquals(1_000L, t.backoffMillis(0))
        assertEquals(2_000L, t.backoffMillis(1))
        assertEquals(4_000L, t.backoffMillis(2))
        assertEquals(60_000L, t.backoffMillis(10))
        assertEquals(60_000L, t.backoffMillis(1000))
        jitter.value = 0.0
        assertEquals(0L, t.backoffMillis(5))
        jitter.value = 0.5
        assertEquals(16_000L, t.backoffMillis(5))
        assertEquals(45_000L, t.backoffMillis(1, retryAfterMillis = 45_000))
    }

    @Test
    fun clockMovingBackwardsDoesNotWedgeTheBudget() {
        val t = tracker(max = 2, reserve = 0)
        repeat(2) { t.tryAcquire(RequestPriority.FOREGROUND) }
        clock.advance(-3_600_000)
        assertEquals(BudgetDecision.Granted, t.tryAcquire(RequestPriority.FOREGROUND))
    }
}
