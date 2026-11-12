package com.apex.athlete.core.data.takeout

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.apex.athlete.core.data.ingest.HealthIngestor
import com.apex.athlete.core.data.model.DailyObservation
import com.apex.athlete.core.data.model.HealthBatch
import com.apex.athlete.core.data.pipeline.DailyIntelligencePipeline
import com.apex.athlete.core.data.settings.UserProfile
import com.apex.athlete.core.data.store.ActiveStore
import com.apex.athlete.core.database.ApexDatabase
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.domain.SyncSource
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.coroutines.coroutineContext
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The engine bound to the real ingestor, a real Room database and the real pipeline (only the
 * ZIP content is synthetic). Needs Room, hence Robolectric; the engine's own logic is covered
 * without Android by TakeoutZipImporterTest.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class TakeoutRoomBindingsRobolectricTest {
    private val zone = ZoneId.of("UTC")
    private val now = Instant.parse("2024-06-14T12:00:00Z").toEpochMilli()
    private lateinit var db: ApexDatabase
    private lateinit var store: ActiveStore
    private val mutex = Mutex()

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, ApexDatabase::class.java).allowMainThreadQueries().build()
        store = ActiveStore(
            db, false, HealthIngestor(db, { now }, { zone }),
            DailyIntelligencePipeline(db, { UserProfile(birthYear = 1990) }, { zone }, { now }),
        )
    }

    @After
    fun tearDown() = db.close()

    private fun importer(batchRows: Int = TakeoutZipImporter.BATCH_ROWS, target: ActiveStore = store) = TakeoutZipImporter(
        RoomTakeoutSink(target, mutex), RoomTakeoutWatermarks(target.db), PipelineTakeoutReplayer(target, mutex),
        TakeoutTimeConfig(zone), nowMillis = { now }, batchRows = batchRows,
    )

    private fun day(iso: String) = LocalDate.parse(iso).toEpochDay()
    private fun hrFile(date: String, mmddyy: String, minutes: Int) =
        "$HR_PATH$date.json" to heartRateJson(clockTexts(mmddyy, minutes).map { Triple(it, 60 + it.takeLast(4).take(1).toInt(), 2) })

    private fun run(vararg entries: Pair<String, String>, force: Boolean = false, batchRows: Int = TakeoutZipImporter.BATCH_ROWS) =
        runBlocking { importer(batchRows).import(listOf(partOf(zipOf(*entries))), force) }

    private suspend fun heartRate() = db.intradayHeartRateDao().range(0, Long.MAX_VALUE)

    @Test
    fun importWritesThroughTheIngestorAndARepeatChangesNothing(): Unit = runBlocking {
        val file = hrFile("2024-06-10", "06/10/24", 300)
        val first = run(file)
        assertEquals(TakeoutOutcome.COMPLETED, first.outcome)
        val stored = heartRate()
        assertEquals(300, stored.size)
        assertTrue(stored.all { it.provenance == DataProvenance.IMPORTED_FILE_ARCHIVE })

        val again = run(file)
        assertEquals(TakeoutOutcome.NOTHING_NEW, again.outcome)
        assertEquals(stored, heartRate())
        assertEquals(0L, again.rowsImported)
    }

    @Test
    fun forceReimportLeavesTheSameRows(): Unit = runBlocking {
        val file = hrFile("2024-06-10", "06/10/24", 300)
        run(file)
        val before = heartRate()
        run(file, force = true)
        assertEquals(before, heartRate())
    }

    @Test
    fun cancelledMidFileThenResumedEndsWithTheRowsOfACleanImport(): Unit = runBlocking {
        val file = hrFile("2024-06-10", "06/10/24", 600)
        val clean = run(file).let { heartRate() }
        db.clearAllTables()

        val job: Job = launch {
            val inner = RoomTakeoutSink(store, mutex)
            val sink = object : TakeoutSink by inner {
                var calls = 0
                // Applies the batch through the real ingestor, then cancels after the second one.
                override suspend fun write(batch: HealthBatch) = inner.write(batch).also {
                    if (++calls == 2) coroutineContext[Job]!!.cancel()
                }
            }
            TakeoutZipImporter(sink, RoomTakeoutWatermarks(db), PipelineTakeoutReplayer(store, mutex), TakeoutTimeConfig(zone), nowMillis = { now }, batchRows = 100)
                .import(listOf(partOf(zipOf(file))))
        }
        job.join()
        val mark = db.takeoutFileMarkDao().get("heart_rate", "heart_rate-2024-06-10.json")
        assertNotNull(mark)
        assertFalse(mark.complete)
        assertTrue(mark.committedRows > 0 && mark.replayPending)
        assertNotNull(db.takeoutFileMarkDao().pendingReplayFromDay())

        val resumed = run(file, batchRows = 100)
        assertEquals(TakeoutFileDecision.IMPORT_RESUME, resumed.files.single().decision)
        assertEquals(clean, heartRate())
        assertTrue(db.takeoutFileMarkDao().get("heart_rate", "heart_rate-2024-06-10.json")!!.complete)
        assertNull(db.takeoutFileMarkDao().pendingReplayFromDay(), "the recomputation the cancelled run owed is done")
        assertEquals(day("2024-06-10"), resumed.earliestModifiedEpochDay)
    }

    @Test
    fun theCategoryWatermarkOnlyMovesForward(): Unit = runBlocking {
        run(hrFile("2024-06-12", "06/12/24", 10))
        run(hrFile("2024-06-10", "06/10/24", 10))
        val mark = db.syncWatermarkDao().get(SyncSource.FITBIT_TAKEOUT_ARCHIVE, TakeoutCategory.HEART_RATE.watermarkStream)
        assertNotNull(mark)
        assertEquals(day("2024-06-12") * 86_400_000L, mark.lastSyncedEpochMillis)
    }

    @Test
    fun anArchiveStepDayTotalReplacesALowerPriorityTotalInsteadOfAddingToIt(): Unit = runBlocking {
        store.ingestor.ingest(
            HealthBatch(DataProvenance.IMPORTED_HEALTH_CONNECT, daily = listOf(DailyObservation(MetricType.STEPS, day("2024-06-10"), 900.0))),
            store.ingestor.newSession(),
        )
        val steps = (0 until 96).joinToString(",", "[", "]") { i -> """{"dateTime":"06/10/24 %02d:%02d:00","value":"10"}""".format(i / 4, (i % 4) * 15) }
        val report = run("Takeout/Fitbit/Global Export Data/steps-2024-06-10.json" to steps)
        assertEquals(1, report.stepDayTotalsWritten)
        val rows = db.dailyBiometricSummaryDao().range(MetricType.STEPS, day("2024-06-10"), day("2024-06-10"))
        assertEquals(1, rows.size, "one real day, one row")
        assertEquals(960.0, rows.single().value)
    }

    @Test
    fun theDemoStoreIsRefused() {
        val demo = ActiveStore(db, true, store.ingestor, store.pipeline)
        assertFailsWith<IllegalStateException> { RoomTakeoutSink(demo, mutex) }
    }
}
