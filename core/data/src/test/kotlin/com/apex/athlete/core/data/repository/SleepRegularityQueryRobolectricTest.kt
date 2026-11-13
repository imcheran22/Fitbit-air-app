package com.apex.athlete.core.data.repository

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.apex.athlete.core.data.ingest.HealthIngestor
import com.apex.athlete.core.data.pipeline.DailyIntelligencePipeline
import com.apex.athlete.core.data.settings.UserProfile
import com.apex.athlete.core.data.store.ActiveStore
import com.apex.athlete.core.database.ApexDatabase
import com.apex.athlete.core.database.entity.SleepSessionEntity
import com.apex.athlete.core.domain.DataProvenance
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.time.Instant
import java.time.ZoneId
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** The 30-night Sleep Regularity Index read behind the experimental Health age. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class SleepRegularityQueryRobolectricTest {

    private val zone = ZoneId.of("UTC")
    private val now = Instant.parse("2026-11-10T14:00:00Z").toEpochMilli()
    private val minute = 60_000L
    private val dayMs = 86_400_000L
    private val day = 20_400L
    private lateinit var db: ApexDatabase
    private lateinit var store: ActiveStore

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), ApexDatabase::class.java)
            .allowMainThreadQueries().build()
        store = ActiveStore(
            db, false, HealthIngestor(db, { now }, { zone }),
            DailyIntelligencePipeline(db, { UserProfile() }, { zone }, { now }),
        )
    }

    @After
    fun tearDown() = db.close()

    /** 23:00 the evening before [epochDay] to 07:00 on it. */
    private fun night(epochDay: Long): SleepSessionEntity {
        val start = (epochDay - 1) * dayMs + 23 * 60 * minute
        return SleepSessionEntity(
            id = "n$epochDay", startEpochMillis = start, endEpochMillis = start + 8 * 60 * minute,
            startZoneOffsetSeconds = 0, endZoneOffsetSeconds = 0, epochDay = epochDay,
            isMainSleep = true, isNap = false, hasStages = false,
            minutesAsleep = 450, minutesAwake = 30, minutesInBed = 480,
            minutesDeep = null, provenance = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API, updatedAtEpochMillis = now,
        )
    }

    @Test
    fun identicalNightsGiveAPerfectIndexAndCountTheNights(): Unit = runBlocking {
        for (d in (day - 29)..day) db.sleepDao().replaceSession(night(d), emptyList())
        val r = RepositoryQueries.sleepRegularity(store, day, 30)
        assertEquals(30, r.coveredNights)
        assertEquals(100.0, r.index!!, 1e-9)
    }

    @Test
    fun aSingleNightIsNotEnoughForAnIndex(): Unit = runBlocking {
        db.sleepDao().replaceSession(night(day), emptyList())
        val r = RepositoryQueries.sleepRegularity(store, day, 30)
        assertEquals(1, r.coveredNights)
        assertNull(r.index)
    }

    @Test
    fun noSleepIsMissingNotZero(): Unit = runBlocking {
        val r = RepositoryQueries.sleepRegularity(store, day, 30)
        assertEquals(0, r.coveredNights)
        assertNull(r.index)
    }
}
