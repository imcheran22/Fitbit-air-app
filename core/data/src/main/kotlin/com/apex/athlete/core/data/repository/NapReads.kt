package com.apex.athlete.core.data.repository

import com.apex.athlete.core.data.store.ActiveStore
import com.apex.athlete.core.data.store.ApexStores
import com.apex.athlete.core.data.store.StoreStatus
import com.apex.athlete.core.database.entity.SleepSessionEntity
import com.apex.athlete.core.database.entity.SleepStageSegmentEntity
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.mapLatest

/**
 * The naps that ended on [epochDay], earliest first. A nap is any sleep session that is not the main sleep (the same rule the
 * pipeline uses for nap minutes). An empty list means "no nap recorded that day", which is different from null (store not ready).
 */
data class NapsState(val isDemo: Boolean, val epochDay: Long, val naps: List<SleepSessionEntity>)

/**
 * One nap with its hypnogram. [stages] is empty when the source delivered no stage scoring ([SleepSessionEntity.hasStages] false);
 * a missing minute count on [nap] stays null, never 0.
 */
data class NapDetailState(val isDemo: Boolean, val nap: SleepSessionEntity, val stages: List<SleepStageSegmentEntity>)

/** The result of looking one nap up: [detail] is null when no session has that id (the store itself is ready). */
data class NapDetailResult(val detail: NapDetailState?)

/** Snapshot reads behind [NapReads]; they take the store so a test can drive them on an in-memory database. */
internal object NapQueries {

    suspend fun naps(store: ActiveStore, day: Long): NapsState =
        NapsState(
            isDemo = store.isDemo,
            epochDay = day,
            naps = store.db.sleepDao().sessionsBetween(day, day).filter { !it.isMainSleep }.sortedBy { it.startEpochMillis },
        )

    /** The session with [id] (any session, so an old link never shows the wrong nap), or null when it no longer exists. */
    suspend fun nap(store: ActiveStore, id: String): NapDetailState? {
        val session = store.db.sleepDao().allSessions().firstOrNull { it.id == id } ?: return null
        return NapDetailState(store.isDemo, session, store.db.sleepDao().stagesFor(id))
    }
}

/**
 * Nap reads for the Sleep screen and the nap detail screen. Like the repository's flows, every read re-emits when the active
 * store changes or a write bumps the data version, and emits null while no store is ready.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class NapReads(
    private val stores: ApexStores,
    private val io: CoroutineDispatcher = Dispatchers.IO,
) {
    private fun <T> observe(block: suspend (ActiveStore) -> T): Flow<T?> =
        combine(stores.status, stores.dataVersion) { status, _ -> status }
            .mapLatest { status -> (status as? StoreStatus.Ready)?.let { block(it.store) } }
            .flowOn(io)

    /** The naps of [day] (the day they ended on). */
    fun naps(day: Long): Flow<NapsState?> = observe { NapQueries.naps(it, day) }

    /** One nap by session id. The flow emits null while no store is ready; a result with a null detail means the session does not exist. */
    fun nap(id: String): Flow<NapDetailResult?> = observe { NapDetailResult(NapQueries.nap(it, id)) }
}
