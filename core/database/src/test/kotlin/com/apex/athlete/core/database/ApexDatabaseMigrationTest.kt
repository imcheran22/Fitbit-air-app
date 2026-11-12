package com.apex.athlete.core.database

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.apex.athlete.core.database.entity.TakeoutFileMarkEntity
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.domain.SyncSource
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

/**
 * Upgrades real database files written exactly as the committed schema exports describe them
 * (`schemas/.../1.json`, `2.json`) to the current version through Room's own migration path, then
 * checks that existing rows survive and the new table works. Room validates the migrated schema
 * against the current entities when it opens the file, so a migration that produced a different
 * table shape fails here.
 *
 * Built without `MigrationTestHelper` on purpose: that helper reads the schemas from instrumentation
 * assets, which local Robolectric tests do not have without extra source-set wiring.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class ApexDatabaseMigrationTest {

    private val context: Context = ApplicationProvider.getApplicationContext()
    private val name = "apex-migration-test.db"

    @After
    fun cleanUp() {
        context.deleteDatabase(name)
    }

    @Test
    fun version1UpgradesToCurrentAndKeepsRows() = runBlocking {
        createAt(1)
        assertUpgradedKeepsRows()
    }

    @Test
    fun version2UpgradesToCurrentAndKeepsRows() = runBlocking {
        createAt(2)
        assertUpgradedKeepsRows()
    }

    private suspend fun assertUpgradedKeepsRows() {
        val db = Room.databaseBuilder(context, ApexDatabase::class.java, name).allowMainThreadQueries().build()
        try {
            val daily = db.dailyBiometricSummaryDao().get(MetricType.RESTING_HEART_RATE, 19_000)
            assertNotNull(daily)
            assertEquals(52.0, daily.value, 0.0)
            assertEquals(DataProvenance.IMPORTED_HEALTH_CONNECT, daily.provenance)
            assertNotNull(db.syncWatermarkDao().get(SyncSource.HEALTH_CONNECT, "heart-rate"))

            val marks = db.takeoutFileMarkDao()
            assertEquals(0, marks.count())
            assertNull(marks.pendingReplayFromDay())
            marks.upsert(
                TakeoutFileMarkEntity(
                    category = "heart_rate", fileKey = "heart_rate-2024-03-31.json", fileEpochDay = 19_813,
                    sizeBytes = 1234, crc32 = 0xCAFEL, complete = false, committedRows = 2_500, rowsDropped = 3,
                    rowsQuarantined = 1, earliestAffectedEpochDay = 19_812, replayPending = true, importedAtEpochMillis = 1L,
                ),
            )
            assertEquals(19_812L, marks.pendingReplayFromDay())
            assertEquals(1, marks.clearPendingReplay())
            assertNull(marks.pendingReplayFromDay())
            assertEquals(2_500L, marks.get("heart_rate", "heart_rate-2024-03-31.json")?.committedRows)
        } finally {
            db.close()
        }
    }

    private fun schemaFile(version: Int): File {
        val relative = "schemas/com.apex.athlete.core.database.ApexDatabase/$version.json"
        return listOf(File(relative), File("core/database/$relative")).firstOrNull { it.exists() }
            ?: error("exported schema $version.json not found")
    }

    /** Writes an empty database file of [version] from its exported schema, plus two rows. */
    private fun createAt(version: Int) {
        val schema = JSONObject(schemaFile(version).readText()).getJSONObject("database")
        assertEquals(version, schema.getInt("version"))
        context.deleteDatabase(name)
        val file = context.getDatabasePath(name)
        file.parentFile?.mkdirs()
        val db = SQLiteDatabase.openOrCreateDatabase(file, null)
        try {
            val entities = schema.getJSONArray("entities")
            for (i in 0 until entities.length()) {
                val entity = entities.getJSONObject(i)
                val table = entity.getString("tableName")
                db.execSQL(entity.getString("createSql").replace("\${TABLE_NAME}", table))
                val indices = entity.optJSONArray("indices") ?: continue
                for (j in 0 until indices.length()) {
                    db.execSQL(indices.getJSONObject(j).getString("createSql").replace("\${TABLE_NAME}", table))
                }
            }
            val setup = schema.getJSONArray("setupQueries")
            for (i in 0 until setup.length()) db.execSQL(setup.getString(i))
            db.execSQL(
                "INSERT INTO daily_biometric_summary (metricType, epochDay, value, provenance, updatedAtEpochMillis) " +
                    "VALUES ('${MetricType.RESTING_HEART_RATE.storageKey}', 19000, 52.0, '${DataProvenance.IMPORTED_HEALTH_CONNECT.storageKey}', 1)",
            )
            db.execSQL(
                "INSERT INTO sync_watermark (source, stream, lastSyncedEpochMillis, status, consecutiveFailures) " +
                    "VALUES ('${SyncSource.HEALTH_CONNECT.storageKey}', 'heart-rate', 5, 'success', 0)",
            )
            db.version = version
        } finally {
            db.close()
        }
    }
}
