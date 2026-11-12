package com.apex.athlete.core.data.export

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.apex.athlete.core.data.ingest.HealthIngestor
import com.apex.athlete.core.data.pipeline.DailyIntelligencePipeline
import com.apex.athlete.core.data.settings.UserProfile
import com.apex.athlete.core.data.source.DemoSource
import com.apex.athlete.core.data.store.ActiveStore
import com.apex.athlete.core.database.ApexDatabase
import com.apex.athlete.core.domain.DataProvenance
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.time.Instant
import java.time.ZoneId
import kotlin.math.abs
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/** Export a seeded store, import into a fresh one, compare the observed rows; then import again. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class RoundTripTest {
    private val zone = ZoneId.of("UTC")
    private val now = Instant.parse("2026-11-10T14:00:00Z").toEpochMilli()
    private lateinit var source: ActiveStore
    private lateinit var fresh: ActiveStore

    private fun newStore(isDemo: Boolean = false): ActiveStore {
        val ctx = ApplicationProvider.getApplicationContext<Context>()
        val db = Room.inMemoryDatabaseBuilder(ctx, ApexDatabase::class.java).allowMainThreadQueries().build()
        return ActiveStore(db, isDemo, HealthIngestor(db, { now }, { zone }), DailyIntelligencePipeline(db, { UserProfile(birthYear = 1990) }, { zone }, { now }))
    }

    @Before
    fun setUp() {
        source = newStore(); fresh = newStore()
        runBlocking {
            val session = source.ingestor.newSession()
            // The demo simulator stands in for a sensor; re-label it so the rows are importable.
            for (b in DemoSource(days = 20, zone = zone, nowMillis = { now }).batches()) {
                source.ingestor.ingest(b.copy(provenance = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API), session)
            }
            source.pipeline.replay(session.earliestAffectedDay!!, source.pipeline.today())
        }
    }

    @After
    fun tearDown() { source.db.close(); fresh.db.close() }

    private fun exportBytes(): ByteArray = ByteArrayOutputStream().also {
        runBlocking { DataExporter({ RoomExportDataSource(source) }, "test", nowMillis = { now }).exportJson(it) }
    }.toByteArray()

    private fun importInto(store: ActiveStore, bytes: ByteArray) = runBlocking {
        DataImporter({ StoreImportTarget(store, Mutex(), {}) }, batchRows = 500).import(ByteArrayInputStream(bytes))
    }

    /** Observed rows only (derived values are recomputed), without update times. */
    private suspend fun snapshot(s: ActiveStore): List<String> {
        val db = s.db
        val daily = db.dailyBiometricSummaryDao().all().filter { it.algorithmVersion == null && !it.metricType.isDerived }
            .map { "d ${it.metricType} ${it.epochDay} ${it.value} ${it.provenance} ${it.sourceResolutionSeconds} ${it.sampleCount}" }
        val hr = db.intradayHeartRateDao().range(0, Long.MAX_VALUE)
            .map { "h ${it.timestampEpochMillis} ${it.minBpm} ${it.maxBpm} ${it.sampleCount} ${it.provenance}" }
        val sleep = db.sleepDao().allSessions().map { x ->
            "s ${x.copy(updatedAtEpochMillis = 0)} ${db.sleepDao().stagesFor(x.id)}"
        }
        val w = db.workoutDao().all().map { it.copy(updatedAtEpochMillis = 0, derivedTrimp = null, derivedStrain = null) }.map { "w $it" }
        return daily + hr + sleep + w
    }

    @Test
    fun roundTripGivesIdenticalObservedRows() = runBlocking {
        val report = importInto(fresh, exportBytes())
        assertEquals(ImportStatus.COMPLETED, report.status)
        assertEquals(0L, report.quarantined.filterKeys { it != QuarantineReason.DERIVED_VALUE_SKIPPED }.values.sum())
        val a = snapshot(source); val b = snapshot(fresh)
        assertTrue(a.size > 100)
        assertEquals(a, b)
        // Heart-rate averages agree to within half a beat over the count.
        val src = source.db.intradayHeartRateDao().range(0, Long.MAX_VALUE).associateBy { it.timestampEpochMillis }
        for (r in fresh.db.intradayHeartRateDao().range(0, Long.MAX_VALUE)) assertTrue(abs(r.avgBpm - src.getValue(r.timestampEpochMillis).avgBpm) <= 0.5 / r.sampleCount + 1e-9)
    }

    @Test
    fun importingTwiceChangesNothing() = runBlocking {
        val bytes = exportBytes()
        importInto(fresh, bytes)
        val once = snapshot(fresh)
        val hrOnce = fresh.db.intradayHeartRateDao().range(0, Long.MAX_VALUE).map { it.copy() }
        importInto(fresh, bytes)
        assertEquals(once, snapshot(fresh))
        assertEquals(hrOnce, fresh.db.intradayHeartRateDao().range(0, Long.MAX_VALUE))
    }

    @Test
    fun demoStoreIsRefused() {
        val demo = newStore(isDemo = true)
        try {
            assertFailsWith<DemoStoreRefusedException> { runBlocking { DataExporter({ RoomExportDataSource(demo) }, "t").exportJson(ByteArrayOutputStream()) } }
            assertFailsWith<DemoStoreRefusedException> { importInto(demo, exportBytes()) }
            assertEquals(0, demo.db.intradayHeartRateDao().count())
        } finally { demo.db.close() }
    }
}
