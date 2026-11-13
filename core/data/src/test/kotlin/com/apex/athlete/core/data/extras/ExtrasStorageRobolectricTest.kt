package com.apex.athlete.core.data.extras

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.apex.athlete.core.data.export.DataExporter
import com.apex.athlete.core.data.export.DataImporter
import com.apex.athlete.core.data.export.DemoStoreRefusedException
import com.apex.athlete.core.data.export.ExportReport
import com.apex.athlete.core.data.export.ExtrasTable
import com.apex.athlete.core.data.export.ImportStatus
import com.apex.athlete.core.data.export.RoomExportDataSource
import com.apex.athlete.core.data.export.StoreImportTarget
import com.apex.athlete.core.database.ApexDatabase
import com.apex.athlete.core.database.ApexDatabaseFactory
import com.apex.athlete.core.database.entity.BehaviourKind
import com.apex.athlete.core.database.entity.BloodPressureSource
import com.apex.athlete.core.database.entity.CoachTopic
import com.apex.athlete.core.database.entity.FoodSource
import com.apex.athlete.core.database.entity.GoalKind
import com.apex.athlete.core.database.entity.MealKind
import com.apex.athlete.core.database.entity.QuickLogKind
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.zip.ZipInputStream
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * The nine v4 tables through the real exporter, importer and "delete all my data" path, on real Room databases:
 * each table round-trips, importing twice changes nothing, the Demo store is refused, and deleting the database file
 * (what `ApexStores.resetRealStore` does) leaves every table empty.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class ExtrasStorageRobolectricTest {
    private val harnesses = ArrayList<ExtrasHarness>()
    private fun harness(isDemo: Boolean = false) = ExtrasHarness(isDemo).also { harnesses += it }

    @After fun tearDown() = harnesses.forEach { it.close() }

    private suspend fun fill(h: ExtrasHarness) {
        val e = h.extras
        val sauna = e.behaviours.add("Sauna", BehaviourKind.YES_NO, "sauna")
        e.behaviours.setValue(h.today, sauna, 1.0)
        e.behaviours.rename("journal_travel", "Trips")
        e.quickLog.addWater(250.0)
        e.quickLog.add(QuickLogKind.NOTE, text = "=1+1, \"quoted\"\nsecond line")
        e.goals.add(GoalKind.WEEKLY_RECOVERED_DAYS, 4.0, reminderEnabled = true)
        e.food.add(MealKind.LUNCH, "Soup", proteinG = 12.5)
        e.food.add(MealKind.SNACK, "Bar", kcal = 210.0, source = FoodSource.AI_ESTIMATE)
        e.bloodPressure.add(121.5, 79.0)
        e.bloodPressure.add(118.0, 76.0, pulse = 58, source = BloodPressureSource.HEALTH_CONNECT, id = "hc:1")
        e.breathe.add(h.now, 300, 240, "box")
        val t = e.coachChats.createThread("Sleep", CoachTopic.SLEEP)
        e.coachChats.appendUserMessage(t, "Why tired?")
        e.coachChats.appendCoachMessage(t, "Short sleep.", fromModel = true, unverifiedNumerals = listOf("7.5"))
    }

    private suspend fun snapshot(db: ApexDatabase): List<Any> = listOf(
        db.behaviourDao().defs(), db.behaviourDao().allEntries(), db.quickLogDao().all(), db.goalDao().all(), db.foodLogDao().all(),
        db.bloodPressureDao().all(), db.breatheSessionDao().all(), db.coachChatDao().allThreads(), db.coachChatDao().allMessages(),
    )

    private suspend fun total(db: ApexDatabase): Int = db.behaviourDao().defCount() + db.behaviourDao().entryCount() + db.quickLogDao().count() +
        db.goalDao().count() + db.foodLogDao().count() + db.bloodPressureDao().count() + db.breatheSessionDao().count() +
        db.coachChatDao().threadCount() + db.coachChatDao().messageCount()

    private fun exportJson(h: ExtrasHarness): Pair<ByteArray, ExportReport> {
        val out = ByteArrayOutputStream()
        val report = runBlocking { DataExporter({ RoomExportDataSource(h.store) }, "test", nowMillis = { h.now }).exportJson(out) }
        return out.toByteArray() to report
    }

    private fun importInto(h: ExtrasHarness, bytes: ByteArray) =
        runBlocking { DataImporter({ StoreImportTarget(h.store, h.writeMutex, {}) }, batchRows = 4).import(ByteArrayInputStream(bytes)) }

    @Test fun everyTableRoundTripsThroughExportAndImportAndImportingTwiceChangesNothing() = runBlocking {
        val source = harness(); val fresh = harness()
        fill(source)
        val (bytes, exported) = exportJson(source)
        for (t in ExtrasTable.entries) assertTrue(exported.counts.extras.getValue(t.jsonKey) > 0L, "${t.jsonKey} was exported")

        val first = importInto(fresh, bytes)
        assertEquals(ImportStatus.COMPLETED, first.status)
        assertEquals(0L, first.quarantinedTotal)
        assertEquals(exported.counts.extraRows, first.extrasWritten)
        assertEquals(snapshot(source.db), snapshot(fresh.db), "every row of all nine tables is identical after the round trip")

        importInto(fresh, bytes)
        assertEquals(snapshot(source.db), snapshot(fresh.db), "a second import upserts the same keys and adds nothing")
        assertEquals(total(source.db), total(fresh.db))
    }

    @Test fun anEmptyStoreStillExportsEveryTableAndCsvHasAFilePerTable() = runBlocking {
        val h = harness()
        val (_, report) = exportJson(h)
        assertEquals(ExtrasTable.entries.map { it.jsonKey }.toSet(), report.counts.extras.keys)
        assertEquals(0L, report.counts.extraRows)

        fill(h)
        val out = ByteArrayOutputStream()
        runBlocking { DataExporter({ RoomExportDataSource(h.store) }, "test").exportCsvZip(out) }
        val names = HashSet<String>()
        ZipInputStream(ByteArrayInputStream(out.toByteArray())).use { z -> while (true) { names += (z.nextEntry ?: break).name } }
        assertTrue(ExtrasTable.entries.all { it.csvFile in names })
    }

    @Test fun theDemoStoreIsNeverExportedOrImportedInto() {
        val demo = harness(isDemo = true)
        assertFailsWith<DemoStoreRefusedException> { exportJson(demo) }
        val real = harness()
        runBlocking { fill(real) }
        assertFailsWith<DemoStoreRefusedException> { importInto(demo, exportJson(real).first) }
        assertEquals(0, runBlocking { total(demo.db) })
    }

    @Test fun deletingTheDatabaseFileEmptiesAllNineTables() = runBlocking {
        // `ApexStores.resetRealStore` closes the real database and `ApexDatabaseFactory.destroy` deletes this file; the passphrase step
        // needs the Android Keystore, so this test runs the file deletion itself. Everything lives in one file, so every table goes.
        val context = ApplicationProvider.getApplicationContext<Context>()
        context.deleteDatabase(ApexDatabaseFactory.DATABASE_NAME)
        fun open() = Room.databaseBuilder(context, ApexDatabase::class.java, ApexDatabaseFactory.DATABASE_NAME).allowMainThreadQueries().build()

        val written = ExtrasHarness(database = open())
        try {
            fill(written)
            assertTrue(total(written.db) > 0, "the file-backed database holds the rows before deletion")
        } finally {
            written.close()
        }
        assertTrue(context.deleteDatabase(ApexDatabaseFactory.DATABASE_NAME))

        val reopened = open()
        try {
            assertEquals(0, total(reopened))
            assertEquals(0, reopened.dailyBiometricSummaryDao().count())
        } finally {
            reopened.close()
            context.deleteDatabase(ApexDatabaseFactory.DATABASE_NAME)
        }
    }
}
