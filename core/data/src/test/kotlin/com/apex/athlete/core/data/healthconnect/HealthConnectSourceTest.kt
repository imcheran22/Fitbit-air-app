package com.apex.athlete.core.data.healthconnect

import com.apex.athlete.core.data.model.HealthBatch
import com.apex.athlete.core.data.source.HealthConnectSource
import com.apex.athlete.core.data.source.SourceAvailability
import com.apex.athlete.core.data.source.SourcePermissionException
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.domain.SyncSource
import kotlinx.coroutines.runBlocking
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

private class FakeData : HealthConnectDataSource {
    var status = HcSdkStatus.AVAILABLE
    var granted: Set<String> = HealthConnectPermissions.recordPermissions
    var features: Set<HcFeature> = emptySet()
    val records = HashMap<HcFamily, List<HcRecord>>()
    var pageSize = 1000
    var readCalls = 0
    /** The `from` of every readPage call, per family. */
    val readFroms = HashMap<HcFamily, MutableList<Long>>()
    /** Throws SecurityException on the Nth readPage call (1-based). */
    var revokeAtCall: Int? = null

    /** What readChanges returns for a token; absent token means expired. */
    val changes = HashMap<String, HcChangesPage>()
    var issued = 0
    val issuedFor = ArrayList<Set<HcFamily>>()

    override fun sdkStatus() = status
    override fun isFeatureAvailable(feature: HcFeature) = feature in features
    override suspend fun grantedPermissions() = granted

    override suspend fun readPage(family: HcFamily, fromMillis: Long, toMillis: Long, pageToken: String?): HcPage {
        readCalls++
        readFroms.getOrPut(family) { ArrayList() } += fromMillis
        if (revokeAtCall == readCalls) throw SecurityException("revoked")
        val all = records[family].orEmpty()
        val start = pageToken?.toInt() ?: 0
        val end = minOf(all.size, start + pageSize)
        return HcPage(all.subList(start, end), if (end < all.size) end.toString() else null)
    }

    override suspend fun newChangesToken(families: Set<HcFamily>): String {
        issued++
        issuedFor += families
        return "new-$issued"
    }

    override suspend fun readChanges(token: String): HcChangesPage =
        changes[token] ?: HcChangesPage(emptyList(), 0, token, hasMore = false, tokenExpired = true)
}

class HealthConnectSourceTest {

    private val utc = ZoneId.of("UTC")
    private fun ms(iso: String) = Instant.parse(iso).toEpochMilli()
    private val from = ms("2026-03-10T00:00:00Z")
    private val to = ms("2026-03-11T00:00:00Z")

    private fun source(d: FakeData, tokens: ChangeTokenStore = InMemoryChangeTokenStore()) =
        HealthConnectSource(d, tokens, utc, listOf("com.fitbit.FitbitMobile"))

    private fun HealthConnectSource.stream(name: String) = streams.first { it.name == name }

    private fun collect(s: HealthConnectSource, name: String, f: Long = from, t: Long = to): List<HealthBatch> = runBlocking {
        val out = ArrayList<HealthBatch>()
        s.pull(s.stream(name), f, t) { out += it }
        out
    }

    private fun hr(vararg times: Long) = HcHeartRateRecord("o", times.map { HcHrSample(it, 60) })

    @Test fun `source identity and provenance`() {
        val d = FakeData().apply { records[HcFamily.HEART_RATE] = listOf(hr(from + 1000)) }
        val s = source(d)
        assertEquals(SyncSource.HEALTH_CONNECT, s.source)
        assertEquals(DataProvenance.IMPORTED_HEALTH_CONNECT, collect(s, "heart-rate").single().provenance)
    }

    @Test fun `not installed and update required are reported as such`() = runBlocking {
        val d = FakeData()
        d.status = HcSdkStatus.UNAVAILABLE
        assertEquals(SourceAvailability.Unavailable(SourceAvailability.Reason.HEALTH_CONNECT_NOT_INSTALLED), source(d).availability())
        d.status = HcSdkStatus.UPDATE_REQUIRED
        assertEquals(SourceAvailability.NeedsAction(SourceAvailability.Reason.HEALTH_CONNECT_UPDATE_REQUIRED), source(d).availability())
    }

    @Test fun `no permissions needs action and partial permissions is ready`() = runBlocking {
        val d = FakeData()
        d.granted = emptySet()
        assertEquals(SourceAvailability.NeedsAction(SourceAvailability.Reason.PERMISSIONS_MISSING), source(d).availability())
        d.granted = setOf(HealthConnectPermissions.heartRate)
        assertEquals(SourceAvailability.Ready, source(d).availability())
        // History and background alone do not make any record readable.
        d.granted = setOf(HealthConnectPermissions.history, HealthConnectPermissions.background)
        assertEquals(SourceAvailability.NeedsAction(SourceAvailability.Reason.PERMISSIONS_MISSING), source(d).availability())
    }

    @Test fun `partial permissions pull only the permitted streams`() {
        val d = FakeData().apply {
            granted = setOf(HealthConnectPermissions.heartRate)
            records[HcFamily.HEART_RATE] = listOf(hr(from + 1000))
            records[HcFamily.STEPS] = listOf(HcIntervalRecord(HcFamily.STEPS, "o", from + 1000, from + 2000, 0, 0, 10.0))
        }
        val s = source(d)
        assertEquals(1, collect(s, "heart-rate").single().heartRate.size)
        val e = assertFailsWith<SourcePermissionException> { collect(s, "steps") }
        assertEquals("steps", e.stream)
        // Nothing was read for the refused stream.
        assertEquals(1, d.readCalls)
    }

    @Test fun `permission revoked in the middle of a run becomes a permission error`() {
        val d = FakeData().apply {
            records[HcFamily.HEART_RATE] = listOf(hr(from + 1000), hr(from + 2000), hr(from + 3000))
            pageSize = 1
            revokeAtCall = 2
        }
        val s = source(d)
        val seen = ArrayList<HealthBatch>()
        val e = assertFailsWith<SourcePermissionException> {
            runBlocking { s.pull(s.stream("heart-rate"), from, to) { seen += it } }
        }
        assertEquals("heart-rate", e.stream)
        assertEquals(1, seen.size) // the first page had already been delivered
    }

    @Test fun `heart rate reads start a day before the window and samples are still kept to the window`() {
        // A record that began before the window and crosses its edge: Health Connect only returns it to a read whose range contains its start.
        val crossing = HcHeartRateRecord("o", listOf(HcHrSample(from - 3_600_000L, 55), HcHrSample(from + 1_000L, 61), HcHrSample(to + 1_000L, 70)))
        val d = FakeData().apply { records[HcFamily.HEART_RATE] = listOf(crossing) }
        val points = collect(source(d), "heart-rate").flatMap { it.heartRate }
        assertEquals(listOf(from + 1_000L), points.map { it.epochMillis }) // before-window and after-window samples are not delivered here
        assertEquals(from - 24L * 3_600_000L, d.readFroms.getValue(HcFamily.HEART_RATE).single())
    }

    @Test fun `all pages are read and delivered`() {
        val recs = (1..5).map { hr(from + it * 1000L) }
        val d = FakeData().apply { records[HcFamily.HEART_RATE] = recs; pageSize = 2 }
        val points = collect(source(d), "heart-rate").flatMap { it.heartRate }
        assertEquals(5, points.size)
        assertEquals(3, d.readCalls)
    }

    @Test fun `a page token that never advances cannot loop forever`() {
        val d = object : HealthConnectDataSource by FakeData() {
            override suspend fun readPage(family: HcFamily, fromMillis: Long, toMillis: Long, pageToken: String?) =
                HcPage(emptyList(), "same")
        }
        runBlocking {
            val s = HealthConnectSource(d, InMemoryChangeTokenStore(), utc)
            s.pull(s.stream("sleep"), from, to) { }
        }
    }

    @Test fun `no stored token issues one before reading and saves it after`() {
        val d = FakeData().apply { records[HcFamily.HEART_RATE] = listOf(hr(from + 1000)) }
        val tokens = InMemoryChangeTokenStore()
        collect(source(d, tokens), "heart-rate")
        assertEquals(1, d.issued)
        assertEquals(setOf(HcFamily.HEART_RATE), d.issuedFor.single())
        assertEquals("new-1", runBlocking { tokens.get("heart-rate") })
    }

    @Test fun `expired token falls back to the windowed read and issues a fresh token`() {
        val d = FakeData().apply { records[HcFamily.HEART_RATE] = listOf(hr(from + 1000)) }
        val tokens = InMemoryChangeTokenStore().also { runBlocking { it.put("heart-rate", "old") } }
        val points = collect(source(d, tokens), "heart-rate").flatMap { it.heartRate }
        assertEquals(1, points.size)
        assertEquals("new-1", runBlocking { tokens.get("heart-rate") })
    }

    @Test fun `a failing change feed also falls back to the windowed read`() {
        val inner = FakeData().apply { records[HcFamily.HEART_RATE] = listOf(hr(from + 1000)) }
        val d = object : HealthConnectDataSource by inner {
            override suspend fun readChanges(token: String): HcChangesPage = throw java.io.IOException("boom")
        }
        val tokens = InMemoryChangeTokenStore().also { runBlocking { it.put("heart-rate", "old") } }
        val s = HealthConnectSource(d, tokens, utc)
        val out = ArrayList<HealthBatch>()
        runBlocking { s.pull(s.stream("heart-rate"), from, to) { out += it } }
        assertEquals(1, out.flatMap { it.heartRate }.size)
        assertEquals("new-1", runBlocking { tokens.get("heart-rate") })
    }

    @Test fun `valid token re-reads a changed record older than the window and advances the token`() {
        val oldDay = LocalDate.parse("2026-03-03")
        val oldStart = ms("2026-03-03T09:00:00Z")
        val d = FakeData().apply {
            records[HcFamily.STEPS] = listOf(
                HcIntervalRecord(HcFamily.STEPS, "o", oldStart, oldStart + 60_000, 0, 0, 500.0),
                HcIntervalRecord(HcFamily.STEPS, "o", from + 1000, from + 2000, 0, 0, 10.0),
            )
            changes["t1"] = HcChangesPage(
                upserted = listOf(HcIntervalRecord(HcFamily.STEPS, "o", oldStart, oldStart + 60_000, 0, 0, 500.0)),
                deletedCount = 0,
                nextToken = "t2",
                hasMore = false,
                tokenExpired = false,
            )
        }
        val tokens = InMemoryChangeTokenStore().also { runBlocking { it.put("steps", "t1") } }
        val daily = collect(source(d, tokens), "steps").flatMap { it.daily }
        assertTrue(daily.any { it.metric == MetricType.STEPS && it.epochDay == oldDay.toEpochDay() && it.value == 500.0 })
        assertTrue(daily.any { it.epochDay == LocalDate.parse("2026-03-10").toEpochDay() && it.value == 10.0 })
        assertEquals("t2", runBlocking { tokens.get("steps") })
        assertEquals(0, d.issued) // a valid token is reused, not replaced
    }

    @Test fun `token is not advanced when the window read fails`() {
        val d = FakeData().apply {
            records[HcFamily.HEART_RATE] = listOf(hr(from + 1000))
            changes["t1"] = HcChangesPage(emptyList(), 0, "t2", hasMore = false, tokenExpired = false)
            revokeAtCall = 1
        }
        val tokens = InMemoryChangeTokenStore().also { runBlocking { it.put("heart-rate", "t1") } }
        assertFailsWith<SourcePermissionException> { collect(source(d, tokens), "heart-rate") }
        assertEquals("t1", runBlocking { tokens.get("heart-rate") })
    }

    @Test fun `skin temperature stream exists only when the platform supports it`() {
        val d = FakeData()
        assertFalse(source(d).streams.any { it.name == "skin-temperature" })
        d.features = setOf(HcFeature.SKIN_TEMPERATURE)
        assertTrue(source(d).streams.any { it.name == "skin-temperature" })
        d.features = emptySet()
        assertFailsWith<SourcePermissionException> {
            runBlocking { source(d).let { s -> s.pull(com.apex.athlete.core.data.source.SourceStream("skin-temperature", 1), from, to) { } } }
        }
    }

    @Test fun `every stream has a bounded window and a unique name`() {
        val d = FakeData().apply { features = setOf(HcFeature.SKIN_TEMPERATURE) }
        val streams = source(d).streams
        assertEquals(12, streams.size)
        assertEquals(streams.size, streams.map { it.name }.toSet().size)
        assertTrue(streams.all { it.maxWindowMillis in 1..(14L * 24 * 3600 * 1000) })
    }

    @Test fun `sleep is delivered with stages and a nightly hrv daily value needs the sleep permission`() {
        val sleep = HcSleepRecord(
            "s1", "o", ms("2026-03-10T00:00:00Z"), ms("2026-03-10T07:00:00Z"), 0, 0,
            listOf(HcSleepStage(ms("2026-03-10T00:00:00Z"), ms("2026-03-10T07:00:00Z"), HealthConnectMapper.STAGE_LIGHT)),
        )
        val hrv = HcInstantRecord(HcFamily.HRV_RMSSD, "o", ms("2026-03-10T03:00:00Z"), 0, 64.0)
        val d = FakeData().apply { records[HcFamily.SLEEP] = listOf(sleep); records[HcFamily.HRV_RMSSD] = listOf(hrv) }
        val s = source(d)
        assertEquals("hc:sleep:s1", collect(s, "sleep").single().sleeps.single().id)
        val withSleep = collect(s, "hrv").single()
        assertEquals(64.0, withSleep.daily.single().value)
        assertEquals(1, withSleep.samples.size)

        d.granted = d.granted - HealthConnectPermissions.sleep
        val without = collect(s, "hrv").single()
        assertTrue(without.daily.isEmpty())
        assertEquals(1, without.samples.size)
    }

    @Test fun `exercise is delivered without heart rate when that permission is missing`() {
        val ex = HcExerciseRecord("e1", "o", ms("2026-03-10T10:00:00Z"), ms("2026-03-10T11:00:00Z"), 0, "RUNNING", null)
        val d = FakeData().apply {
            granted = setOf(HealthConnectPermissions.exercise, HealthConnectPermissions.totalCalories)
            records[HcFamily.EXERCISE] = listOf(ex)
            records[HcFamily.HEART_RATE] = listOf(HcHeartRateRecord("o", listOf(HcHrSample(ms("2026-03-10T10:10:00Z"), 150))))
            records[HcFamily.TOTAL_CALORIES] = listOf(HcIntervalRecord(HcFamily.TOTAL_CALORIES, "o", ex.startEpochMillis, ex.endEpochMillis, 0, 0, 600.0))
        }
        val w = collect(source(d), "exercise").single().workouts.single()
        assertNull(w.averageHeartRate)
        assertEquals(600.0, w.caloriesKcal)
    }

    @Test fun `permission set is read only`() {
        assertTrue(HealthConnectPermissions.all.all { it.startsWith("android.permission.health.READ_") })
        assertEquals(15, HealthConnectPermissions.all.size)
        val status = runBlocking { HealthConnectAvailability(FakeData().apply { granted = setOf(HealthConnectPermissions.steps) }).status() }
        assertFalse(HealthConnectPermissions.steps in status.missingRecordPermissions)
        assertFalse(status.isFullyPermitted)
        assertTrue(status.isReadable)
        assertFalse(HealthConnectPermissions.skinTemperature in status.missingRecordPermissions) // feature absent: not demanded
    }
}
