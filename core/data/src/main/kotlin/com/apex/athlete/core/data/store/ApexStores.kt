package com.apex.athlete.core.data.store

import android.content.Context
import com.apex.athlete.core.data.ingest.HealthIngestor
import com.apex.athlete.core.data.pipeline.DailyIntelligencePipeline
import com.apex.athlete.core.data.settings.SettingsStore
import com.apex.athlete.core.data.source.DemoSource
import com.apex.athlete.core.database.ApexDatabase
import com.apex.athlete.core.database.ApexDatabaseFactory
import com.apex.athlete.core.domain.SyncSource
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.ZoneId

/** One opened database with the writer and the pipeline bound to it. */
class ActiveStore(
    val db: ApexDatabase,
    val isDemo: Boolean,
    val ingestor: HealthIngestor,
    val pipeline: DailyIntelligencePipeline,
)

sealed interface StoreStatus {
    data object Opening : StoreStatus
    data class PreparingDemo(val done: Int, val total: Int) : StoreStatus
    data class Ready(val store: ActiveStore) : StoreStatus

    /**
     * The encrypted database could not be opened (file damaged, or the Keystore key that wraps its
     * passphrase is gone, for example after a device restore). Nothing is deleted automatically;
     * the app explains and offers a clean start.
     */
    data class Failed(val cause: Throwable) : StoreStatus
}

/**
 * Owns the two stores and decides which one the app is looking at.
 *
 * The real store is the SQLCipher file. The demo store is a separate in-memory database filled by
 * [DemoSource] through the same ingestor and pipeline as real data. They never share a file, a
 * connection or a row, so synthetic data cannot reach real history, exports or imports.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ApexStores(
    context: Context,
    private val settings: SettingsStore,
    scope: CoroutineScope,
    private val io: CoroutineDispatcher = Dispatchers.IO,
    private val zone: () -> ZoneId = ZoneId::systemDefault,
    private val nowMillis: () -> Long = System::currentTimeMillis,
    private val openReal: (Context) -> ApexDatabase = ApexDatabaseFactory::create,
    private val openDemo: (Context) -> ApexDatabase = ApexDatabaseFactory::createDemo,
    private val demoDays: Int = 60,
) {
    private val appContext = context.applicationContext
    private val lock = Mutex()
    private var real: ActiveStore? = null
    private var demo: ActiveStore? = null
    private val reopen = MutableStateFlow(0)

    /** Bumped after every write that can change what a screen shows. */
    val dataVersion = MutableStateFlow(0L)

    /** Serialises writers: a sync, an archive import and a recompute never interleave. */
    val writeMutex = Mutex()

    val status: StateFlow<StoreStatus> = settings.settings.map { it.demoMode }.distinctUntilChanged()
        .flatMapLatest { demoMode -> reopen.flatMapLatest { open(demoMode) } }
        .stateIn(scope, SharingStarted.Eagerly, StoreStatus.Opening)

    fun notifyChanged() = dataVersion.update { it + 1 }

    /** The real store, opened if necessary. Used by workers, which never touch demo data. */
    suspend fun realStore(): ActiveStore = lock.withLock {
        real ?: bind(openReal(appContext), isDemo = false).also { store ->
            // Touch the file now so a damaged database or a lost key fails here, not mid-screen.
            store.db.syncWatermarkDao().forSource(SyncSource.HEALTH_CONNECT)
            // A formula change leaves older derived rows behind; recompute them before anyone reads the
            // store. A failure keeps the app usable and is retried at the next start (rows stay stale).
            try {
                store.pipeline.recomputeIfStale()
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (_: Exception) {
            }
            real = store
        }
    }

    /** Deletes the real database file and its passphrase, then reopens an empty one. */
    suspend fun resetRealStore() {
        lock.withLock {
            runCatching { real?.db?.close() }
            real = null
            ApexDatabaseFactory.destroy(appContext)
        }
        reopen.update { it + 1 }
        notifyChanged()
    }

    /** Throws away the demo store so the next switch to Demo mode builds a fresh one. */
    suspend fun discardDemo() = lock.withLock {
        runCatching { demo?.db?.close() }
        demo = null
    }

    private fun open(demoMode: Boolean): Flow<StoreStatus> = flow {
        emit(StoreStatus.Opening)
        try {
            if (!demoMode) {
                emit(StoreStatus.Ready(realStore()))
            } else {
                val existing = lock.withLock { demo }
                if (existing != null) {
                    emit(StoreStatus.Ready(existing))
                } else {
                    val store = bind(openDemo(appContext), isDemo = true)
                    val source = DemoSource(days = demoDays, zone = zone(), nowMillis = nowMillis)
                    val total = demoDays * 2
                    var done = 0
                    emit(StoreStatus.PreparingDemo(0, total))
                    val session = store.ingestor.newSession()
                    for (batch in source.batches()) {
                        store.ingestor.ingest(batch, session)
                        done++
                        if (done % 4 == 0) emit(StoreStatus.PreparingDemo(done, total))
                    }
                    val today = store.pipeline.today()
                    val from = session.earliestAffectedDay ?: today
                    store.pipeline.replay(from, today) { d, t ->
                        if (d % 4 == 0 || d == t) emit(StoreStatus.PreparingDemo(demoDays + d * demoDays / t, total))
                    }
                    lock.withLock { demo = store }
                    emit(StoreStatus.Ready(store))
                }
            }
            notifyChanged()
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            emit(StoreStatus.Failed(e))
        }
    }.flowOn(io)

    private fun bind(db: ApexDatabase, isDemo: Boolean) = ActiveStore(
        db = db,
        isDemo = isDemo,
        ingestor = HealthIngestor(db, nowMillis, zone),
        pipeline = DailyIntelligencePipeline(db, { settings.currentProfile() }, zone, nowMillis),
    )
}
