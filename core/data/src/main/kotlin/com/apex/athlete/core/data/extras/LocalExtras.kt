package com.apex.athlete.core.data.extras

import com.apex.athlete.core.data.store.ActiveStore
import com.apex.athlete.core.data.store.ApexStores
import com.apex.athlete.core.data.store.StoreStatus
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

/** Thrown by every write of [LocalExtras] while the Demo store is active: demo mode shows data, it never records the owner's entries. */
class DemoWriteRefusedException : IllegalStateException("Demo mode does not save entries.")

/**
 * The local-only features added in schema v4, as thin repositories over the active store.
 *
 * - [behaviours]: the five built-in journal factors (kept as daily metrics) and the owner's custom behaviours, merged per day.
 * - [quickLog]: water, mood, symptom and note entries. [goals]: goal definitions (CRUD only). [food], [bloodPressure],
 *   [breathe], [coachChats].
 *
 * Rules shared by all of them:
 * - **Reads** follow the active store (real or Demo) and work in Demo mode: the demo store simply has no rows.
 *   While the store is opening they emit the empty value.
 * - **Writes** take the store's write mutex (a sync, an import and a recompute never interleave with them), refuse the
 *   Demo store with [DemoWriteRefusedException], and throw [IllegalStateException] when no store is ready, so a caller
 *   never reports a save that did not happen. Invalid input throws [IllegalArgumentException] before anything is written.
 * - **Provenance**: behaviour entries, quick-log entries, goals, breathing sessions and the user's chat messages are
 *   [com.apex.athlete.core.domain.DataProvenance.USER_REPORTED]; food and blood pressure carry the provenance of their source.
 * - Nothing here touches the network, Health Connect or Google, and nothing is logged.
 */
class LocalExtras internal constructor(
    access: ExtrasStoreAccess,
    zone: () -> ZoneId,
    nowMillis: () -> Long,
    newId: () -> String,
) {
    /** The app's instance, built from the same [ApexStores] as `AthleteRepository`. */
    constructor(
        stores: ApexStores,
        zone: () -> ZoneId = ZoneId::systemDefault,
        nowMillis: () -> Long = System::currentTimeMillis,
        io: CoroutineDispatcher = Dispatchers.IO,
        newId: () -> String = { UUID.randomUUID().toString() },
    ) : this(ExtrasStoreAccess(stores, io), zone, nowMillis, newId)

    private val clock = ExtrasClock(zone, nowMillis)

    val behaviours = BehaviourRepository(access, nowMillis, newId)
    val quickLog = QuickLogRepository(access, clock, newId)
    val goals = GoalRepository(access, clock, newId)
    val food = FoodRepository(access, clock, newId)
    val bloodPressure = BloodPressureRepository(access, clock, newId)
    val breathe = BreatheRepository(access, clock, newId)
    val coachChats = CoachChatRepository(access, clock, newId)
}

internal class ExtrasClock(private val zone: () -> ZoneId, private val nowMillis: () -> Long) {
    fun now(): Long = nowMillis()

    /** Start of the civil [epochDay] and of the next one, in the phone's current time zone. */
    fun dayBounds(epochDay: Long): Pair<Long, Long> {
        val z = zone()
        val date = LocalDate.ofEpochDay(epochDay)
        return date.atStartOfDay(z).toInstant().toEpochMilli() to date.plusDays(1).atStartOfDay(z).toInstant().toEpochMilli()
    }

    fun today(): Long = Instant.ofEpochMilli(nowMillis()).atZone(zone()).toLocalDate().toEpochDay()
}

/** Reads and writes against whichever store is active, mirroring `AthleteRepository`'s observe and write helpers. */
@OptIn(ExperimentalCoroutinesApi::class)
internal class ExtrasStoreAccess(
    private val status: StateFlow<StoreStatus>,
    private val writeMutex: Mutex,
    private val notifyChanged: () -> Unit,
    private val io: CoroutineDispatcher,
) {
    constructor(stores: ApexStores, io: CoroutineDispatcher) : this(stores.status, stores.writeMutex, stores::notifyChanged, io)

    /** Re-subscribes when the active store changes (real, demo, reset); emits [empty] while no store is ready. */
    fun <T> observe(empty: T, block: (ActiveStore) -> Flow<T>): Flow<T> =
        status
            .flatMapLatest { s -> (s as? StoreStatus.Ready)?.let { block(it.store) } ?: flowOf(empty) }
            .flowOn(io)

    /** One-off read of the active store; [empty] while none is ready. */
    suspend fun <T> read(empty: T, block: suspend (ActiveStore) -> T): T = withContext(io) {
        val store = (status.value as? StoreStatus.Ready)?.store ?: return@withContext empty
        block(store)
    }

    /**
     * Runs [block] under the write mutex on the real store. [notify] bumps the data version, which makes every dashboard
     * recompute; only writes that feed the analytics (the built-in journal factors) need it, the Room flows of the
     * other tables update their own observers.
     */
    suspend fun <T> write(notify: Boolean = false, block: suspend (ActiveStore) -> T): T = withContext(io) {
        val store = (status.value as? StoreStatus.Ready)?.store ?: throw IllegalStateException("The data store is not ready")
        if (store.isDemo) throw DemoWriteRefusedException()
        val result = writeMutex.withLock { block(store) }
        if (notify) notifyChanged()
        result
    }
}
