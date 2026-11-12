package com.apex.athlete.core.data.sync

import com.apex.athlete.core.data.model.DailyObservation
import com.apex.athlete.core.data.model.HealthBatch
import com.apex.athlete.core.data.model.HeartRatePoint
import com.apex.athlete.core.data.model.IngestCounts
import com.apex.athlete.core.data.source.FixtureReplaySource
import com.apex.athlete.core.data.source.SourceAvailability
import com.apex.athlete.core.data.worker.LastRun
import com.apex.athlete.core.data.worker.SyncCodes
import com.apex.athlete.core.data.worker.SyncOutcomes
import com.apex.athlete.core.data.worker.SyncRunContext
import com.apex.athlete.core.data.worker.SyncRunState
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.domain.SleepStage
import com.apex.athlete.core.domain.SyncSource
import com.apex.athlete.core.network.rate.RequestPriority
import kotlinx.coroutines.runBlocking
import java.time.Instant
import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class FixtureReplayAndOutcomesTest {
    private fun ms(iso: String) = Instant.parse(iso).toEpochMilli()
    private fun day(iso: String) = LocalDate.parse(iso).toEpochDay()

    private val batch = HealthBatch(
        DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API,
        heartRate = listOf(HeartRatePoint(ms("2026-11-10T10:00:00Z"), 60), HeartRatePoint(ms("2026-11-12T10:00:00Z"), 61)),
        daily = listOf(DailyObservation(MetricType.STEPS, day("2026-11-10"), 5000.0), DailyObservation(MetricType.STEPS, day("2026-11-12"), 700.0)),
    )

    private fun replay(source: FixtureReplaySource, from: String, to: String): List<HealthBatch> = runBlocking {
        val out = ArrayList<HealthBatch>()
        source.pull(source.streams.single(), ms(from), ms(to)) { out += it }
        out
    }

    @Test
    fun replaysOnlyTheRequestedWindowKeepsProvenanceAndIsDeterministic() {
        val s = FixtureReplaySource(SyncSource.GOOGLE_HEALTH_API, listOf(batch))
        val a = replay(s, "2026-11-10T00:00:00Z", "2026-11-11T00:00:00Z")
        assertEquals(listOf(60), a.flatMap { it.heartRate }.map { it.bpm })
        assertEquals(listOf(5000.0), a.flatMap { it.daily }.map { it.value })
        assertTrue(a.all { it.provenance == DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API })
        assertEquals(a, replay(s, "2026-11-10T00:00:00Z", "2026-11-11T00:00:00Z"))
        assertTrue(replay(s, "2026-11-20T00:00:00Z", "2026-11-21T00:00:00Z").isEmpty())
        assertEquals(3, s.pulledWindows.size)
    }

    @Test
    fun batchesAreBoundedAndFaultsAreInjectable() {
        val many = HealthBatch(DataProvenance.IMPORTED_HEALTH_CONNECT, heartRate = (0 until 10).map { HeartRatePoint(ms("2026-11-10T10:00:00Z") + it * 1000L, 60) })
        val s = FixtureReplaySource(SyncSource.HEALTH_CONNECT, listOf(many), maxRowsPerBatch = 4)
        assertEquals(listOf(4, 4, 2), replay(s, "2026-11-10T00:00:00Z", "2026-11-11T00:00:00Z").map { it.heartRate.size })
        val boom = FixtureReplaySource(SyncSource.HEALTH_CONNECT, listOf(many), faults = { _, _ -> IllegalStateException("x") })
        assertFailsWith<IllegalStateException> { replay(boom, "2026-11-10T00:00:00Z", "2026-11-11T00:00:00Z") }
        val off = FixtureReplaySource(SyncSource.GOOGLE_HEALTH_API, emptyList(), availability = SourceAvailability.NeedsAction(SourceAvailability.Reason.NOT_SIGNED_IN))
        assertEquals(SourceAvailability.NeedsAction(SourceAvailability.Reason.NOT_SIGNED_IN), runBlocking { off.availability() })
    }

    @Test
    fun jsonFixturesAreParsedTolerantly() {
        val json = """
            {"future":1,"batches":[
              {"provenance":"ghealth_api","extra":true,
               "heartRate":[{"t":${ms("2026-11-10T10:00:00Z")},"bpm":58}],
               "daily":[{"metric":"steps","day":${day("2026-11-10")},"value":4200.0},{"metric":"no_such_metric","day":1,"value":1.0}],
               "sleeps":[{"id":"s1","start":${ms("2026-11-09T22:00:00Z")},"end":${ms("2026-11-10T06:00:00Z")},
                          "stages":[{"start":${ms("2026-11-09T22:00:00Z")},"end":${ms("2026-11-09T23:00:00Z")},"stage":"deep"},{"start":1,"end":2,"stage":"nonsense"}]}],
               "workouts":[{"id":"w1","start":${ms("2026-11-10T07:00:00Z")},"end":${ms("2026-11-10T08:00:00Z")},"type":"RUNNING","meters":9000.0}]},
              {"provenance":"from_the_future","heartRate":[{"t":1,"bpm":1}]}
            ]}
        """.trimIndent()
        val batches = FixtureReplaySource.parse(json.byteInputStream())
        assertEquals(1, batches.size)
        val b = batches.single()
        assertEquals(DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API, b.provenance)
        assertEquals(58, b.heartRate.single().bpm)
        assertEquals(MetricType.STEPS, b.daily.single().metric)
        assertEquals(listOf(SleepStage.DEEP), b.sleeps.single().stages.map { it.stage })
        assertEquals(3_600_000L, b.workouts.single().activeDurationMillis)
        assertEquals(9000.0, b.workouts.single().distanceMeters)
        val s = FixtureReplaySource.fromJson(SyncSource.GOOGLE_HEALTH_API, json.byteInputStream())
        assertEquals(1, replay(s, "2026-11-10T00:00:00Z", "2026-11-11T00:00:00Z").flatMap { it.workouts }.size)
    }

    // --- worker decisions ------------------------------------------------------------------------------

    private fun report(vararg o: StreamOutcome, skipped: Map<SyncSource, SourceAvailability> = emptyMap()) = SyncReport(
        0, 1, skipped, o.mapIndexed { i, x -> StreamReport(SyncSource.GOOGLE_HEALTH_API, "s$i", x, 1) }, IngestCounts(), 0,
    )

    @Test
    fun classifiesReports() {
        val ok = SyncOutcomes.classify(report(StreamOutcome.SYNCED, StreamOutcome.UP_TO_DATE), 0)
        assertEquals(SyncCodes.OK, ok.code); assertTrue(ok.success); assertFalse(ok.retry)

        val transient = SyncOutcomes.classify(report(StreamOutcome.SYNCED, StreamOutcome.FAILED), 0)
        assertEquals(SyncCodes.PARTIAL, transient.code); assertTrue(transient.retry); assertTrue(transient.success)
        assertFalse(SyncOutcomes.classify(report(StreamOutcome.FAILED), SyncOutcomes.MAX_ATTEMPTS - 1).retry)
        assertEquals(SyncCodes.NETWORK, SyncOutcomes.classify(report(StreamOutcome.FAILED), 0).code)

        val auth = SyncOutcomes.classify(report(StreamOutcome.AUTH_EXPIRED), 0)
        assertEquals(SyncCodes.NEEDS_SIGN_IN, auth.code); assertFalse(auth.retry); assertFalse(auth.success)
        val skippedAuth = SyncOutcomes.classify(
            report(StreamOutcome.SYNCED, skipped = mapOf(SyncSource.GOOGLE_HEALTH_API to SourceAvailability.NeedsAction(SourceAvailability.Reason.SIGN_IN_EXPIRED))), 0,
        )
        assertEquals(SyncCodes.NEEDS_SIGN_IN, skippedAuth.code); assertTrue(skippedAuth.success)

        val limited = SyncOutcomes.classify(report(StreamOutcome.SYNCED, StreamOutcome.RATE_LIMITED), 0)
        assertEquals(SyncCodes.RATE_LIMITED, limited.code); assertFalse(limited.retry); assertTrue(limited.success)
        assertEquals(SyncCodes.PERMISSION_MISSING, SyncOutcomes.classify(report(StreamOutcome.PERMISSION_MISSING), 0).code)
        val none = SyncOutcomes.classify(report(), 0)
        assertEquals(SyncCodes.NO_SOURCE, none.code); assertFalse(none.success)
    }

    @Test
    fun mapsRunsToStates() {
        assertEquals(SyncRunState.Running, SyncOutcomes.stateFor(true, null))
        assertEquals(SyncRunState.Idle, SyncOutcomes.stateFor(false, null))
        assertEquals(SyncRunState.NeedsSignIn, SyncOutcomes.stateFor(false, LastRun(SyncCodes.NEEDS_SIGN_IN, 5, true)))
        assertEquals(SyncRunState.Succeeded(5), SyncOutcomes.stateFor(false, LastRun(SyncCodes.OK, 5, true)))
        assertEquals(SyncRunState.Failed("network"), SyncOutcomes.stateFor(false, LastRun(SyncCodes.NETWORK, 5, false)))
    }

    @Test
    fun foregroundRunsRaiseRequestPriorityOnlyWhileTheyRun() = runBlocking {
        assertEquals(RequestPriority.BACKGROUND, SyncRunContext.currentPriority())
        SyncRunContext.withPriority(foreground = true) { assertEquals(RequestPriority.FOREGROUND, SyncRunContext.currentPriority()) }
        SyncRunContext.withPriority(foreground = false) { assertEquals(RequestPriority.BACKGROUND, SyncRunContext.currentPriority()) }
        assertEquals(RequestPriority.BACKGROUND, SyncRunContext.currentPriority())
    }
}
