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
import com.apex.athlete.core.database.entity.SleepStageSegmentEntity
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.SleepStage
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
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** The nap reads on an in-memory database: only non-main sleeps of the asked day, earliest first, with stages and provenance. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class NapQueriesRobolectricTest {

    private val zone = ZoneId.of("UTC")
    private val now = Instant.parse("2026-11-10T14:00:00Z").toEpochMilli()
    private val minute = 60_000L
    private val day = 20_400L
    private val dayStart = day * 86_400_000L
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

    private fun session(
        id: String,
        startHour: Int,
        minutes: Int,
        epochDay: Long = day,
        main: Boolean = false,
        stages: Boolean = false,
        provenance: DataProvenance = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API,
        deep: Int? = null,
    ): SleepSessionEntity {
        val start = dayStart + startHour * 60 * minute
        return SleepSessionEntity(
            id = id, startEpochMillis = start, endEpochMillis = start + minutes * minute,
            startZoneOffsetSeconds = 0, endZoneOffsetSeconds = 0, epochDay = epochDay,
            isMainSleep = main, isNap = !main, hasStages = stages,
            minutesAsleep = minutes - 5, minutesAwake = 5, minutesInBed = minutes,
            minutesDeep = deep, provenance = provenance, updatedAtEpochMillis = now,
        )
    }

    @Test
    fun onlyNapsOfTheAskedDayComeBackEarliestFirst(): Unit = runBlocking {
        db.sleepDao().replaceSession(session("main", 0, 420, main = true), emptyList())
        db.sleepDao().replaceSession(session("late", 15, 30), emptyList())
        db.sleepDao().replaceSession(session("early", 13, 45), emptyList())
        db.sleepDao().replaceSession(session("other-day", 14, 20, epochDay = day - 1), emptyList())
        val s = NapQueries.naps(store, day)
        assertEquals(listOf("early", "late"), s.naps.map { it.id })
        assertEquals(day, s.epochDay)
        assertFalse(s.isDemo)
    }

    @Test
    fun aDayWithoutNapsIsAnEmptyListNotNull(): Unit = runBlocking {
        db.sleepDao().replaceSession(session("main", 0, 420, main = true), emptyList())
        assertTrue(NapQueries.naps(store, day).naps.isEmpty())
        assertTrue(NapQueries.naps(store, day + 5).naps.isEmpty())
    }

    @Test
    fun aNapKeepsItsProvenanceAndLeavesUnreportedMinutesNull(): Unit = runBlocking {
        db.sleepDao().replaceSession(session("hc", 14, 25, provenance = DataProvenance.IMPORTED_HEALTH_CONNECT), emptyList())
        val nap = NapQueries.naps(store, day).naps.single()
        assertEquals(DataProvenance.IMPORTED_HEALTH_CONNECT, nap.provenance)
        assertNull(nap.minutesDeep)
        assertNull(nap.minutesRem)
        assertNull(nap.minutesLight)
    }

    @Test
    fun aNapDetailCarriesItsStagesInOrder(): Unit = runBlocking {
        val nap = session("staged", 14, 30, stages = true, deep = 10)
        val stages = listOf(
            SleepStageSegmentEntity("staged", nap.startEpochMillis + 10 * minute, nap.startEpochMillis + 30 * minute, SleepStage.DEEP),
            SleepStageSegmentEntity("staged", nap.startEpochMillis, nap.startEpochMillis + 10 * minute, SleepStage.LIGHT),
        )
        db.sleepDao().replaceSession(nap, stages)
        val detail = NapQueries.nap(store, "staged")!!
        assertEquals(listOf(SleepStage.LIGHT, SleepStage.DEEP), detail.stages.map { it.stage })
        assertEquals(10, detail.nap.minutesDeep)
        assertEquals(30, detail.nap.minutesInBed)
    }

    @Test
    fun anUnknownNapIdIsNull(): Unit = runBlocking {
        assertNull(NapQueries.nap(store, "nope"))
    }
}
