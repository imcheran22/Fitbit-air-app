package com.apex.athlete.core.data.extras

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.apex.athlete.core.data.ingest.HealthIngestor
import com.apex.athlete.core.data.pipeline.DailyIntelligencePipeline
import com.apex.athlete.core.data.settings.UserProfile
import com.apex.athlete.core.data.store.ActiveStore
import com.apex.athlete.core.data.store.StoreStatus
import com.apex.athlete.core.database.ApexDatabase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.sync.Mutex
import java.time.Instant
import java.time.ZoneId

/** An in-memory store and a [LocalExtras] over it, without the settings DataStore (one per process) that `ApexStores` needs. */
internal class ExtrasHarness(isDemo: Boolean = false, ready: Boolean = true, database: ApexDatabase? = null) {
    val zone: ZoneId = ZoneId.of("UTC")
    var now: Long = Instant.parse("2026-11-10T14:00:00Z").toEpochMilli()
    val today: Long get() = Instant.ofEpochMilli(now).atZone(zone).toLocalDate().toEpochDay()

    val db: ApexDatabase = database
        ?: Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), ApexDatabase::class.java).allowMainThreadQueries().build()
    val store = ActiveStore(
        db, isDemo, HealthIngestor(db, { now }, { zone }),
        DailyIntelligencePipeline(db, { UserProfile(birthYear = 1990) }, { zone }, { now }),
    )
    val status = MutableStateFlow<StoreStatus>(if (ready) StoreStatus.Ready(store) else StoreStatus.Opening)
    val writeMutex = Mutex()
    var changedNotifications = 0
    private var nextId = 0

    val extras = LocalExtras(
        ExtrasStoreAccess(status, writeMutex, { changedNotifications++ }, Dispatchers.IO),
        zone = { zone }, nowMillis = { now }, newId = { "id-${++nextId}" },
    )

    fun close() = db.close()
}
