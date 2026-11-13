package com.apex.athlete.core.data.extras

import com.apex.athlete.core.data.model.DailyObservation
import com.apex.athlete.core.data.model.HealthBatch
import com.apex.athlete.core.database.entity.BehaviourDefEntity
import com.apex.athlete.core.database.entity.BehaviourEntryEntity
import com.apex.athlete.core.database.entity.BehaviourKind
import com.apex.athlete.core.domain.DataProvenance
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map

/**
 * Behaviours: the built-in journal factors and custom ones, merged per day. Every value is self-reported
 * ([PROVENANCE]) and has no free text. Built-ins can be renamed, reordered and archived like custom ones; their values
 * stay in the daily metrics, so the journal-effect analysis keeps working.
 */
class BehaviourRepository internal constructor(
    private val access: ExtrasStoreAccess,
    private val nowMillis: () -> Long,
    private val newId: () -> String,
) {
    /** Behaviours (built-in and custom) in the owner's order. */
    fun observeBehaviours(includeArchived: Boolean = false): Flow<List<Behaviour>> =
        access.observe<List<Behaviour>>(emptyList()) { store -> store.db.behaviourDao().observeDefs().map { BehaviourCatalog.merge(it) } }
            .map { list -> if (includeArchived) list else list.filter { !it.archived } }

    /** Every behaviour with its value on [epochDay] (null = not logged). */
    fun observeDay(epochDay: Long, includeArchived: Boolean = false): Flow<List<BehaviourValue>> =
        combine(observeBehaviours(includeArchived = true), observeEntries(epochDay, epochDay)) { behaviours, entries ->
            BehaviourCatalog.dayValues(behaviours, entries, includeArchived)
        }

    /** Logged values of built-in and custom behaviours for a day range, by day then behaviour id. */
    fun observeEntries(fromDay: Long, toDay: Long): Flow<List<BehaviourDayEntry>> =
        access.observe<List<BehaviourDayEntry>>(emptyList()) { store ->
            val dao = store.db.behaviourDao()
            combine(dao.observeBuiltInValues(BehaviourCatalog.builtInIds, fromDay, toDay), dao.observeEntriesBetween(fromDay, toDay)) { b, c ->
                BehaviourCatalog.entries(b, c)
            }
        }

    /**
     * Sets the value of [behaviourId] on [epochDay]; null removes it (not logged). Yes/no takes 0.0 or 1.0, the scale a
     * whole number 0.0 to 4.0. Throws [IllegalArgumentException] for an unknown behaviour or an invalid value.
     */
    suspend fun setValue(epochDay: Long, behaviourId: String, value: Double?) {
        require(epochDay in 0..MAX_EPOCH_DAY) { "The day is out of range." }
        val builtIn = BehaviourCatalog.builtInMetric(behaviourId)
        access.write(notify = builtIn != null) { store ->
            if (builtIn != null) {
                if (value == null) {
                    store.db.dailyBiometricSummaryDao().delete(builtIn, epochDay)
                } else {
                    BehaviourCatalog.requireValid(BehaviourKind.YES_NO, value)
                    store.ingestor.ingest(
                        HealthBatch(DataProvenance.USER_REPORTED, daily = listOf(DailyObservation(builtIn, epochDay, value))),
                        store.ingestor.newSession(),
                    )
                }
            } else {
                val dao = store.db.behaviourDao()
                val def = dao.defById(behaviourId) ?: throw IllegalArgumentException("Unknown behaviour.")
                if (value == null) {
                    dao.deleteEntry(epochDay, behaviourId)
                } else {
                    BehaviourCatalog.requireValid(def.kind, value)
                    dao.upsertEntry(BehaviourEntryEntity(epochDay, behaviourId, value, nowMillis()))
                }
            }
            Unit
        }
    }

    /** Adds a custom behaviour at the end of the list and returns its id. */
    suspend fun add(name: String, kind: BehaviourKind, iconKey: String): String {
        val clean = requireName(name)
        require(iconKey.isNotBlank() && iconKey.length <= ExtrasLimits.MAX_ICON_KEY_CHARS) { "The icon key is invalid." }
        val id = BehaviourCatalog.CUSTOM_PREFIX + newId()
        access.write { store ->
            val dao = store.db.behaviourDao()
            val last = BehaviourCatalog.merge(dao.defs()).maxOf { it.sortOrder }
            dao.upsertDef(BehaviourDefEntity(id, clean, kind, iconKey, last + 1, archived = false))
        }
        return id
    }

    suspend fun rename(id: String, name: String) {
        val clean = requireName(name)
        changeDef(id) { it.copy(name = clean) }
    }

    /** Hides ([archived] = true) or shows a behaviour. Its logged values are kept. */
    suspend fun setArchived(id: String, archived: Boolean) = changeDef(id) { it.copy(archived = archived) }

    /** Applies the owner's order: [orderedIds] get sort orders 0, 1, 2 ... Pass every behaviour id, built-ins included. */
    suspend fun reorder(orderedIds: List<String>) {
        require(orderedIds.toSet().size == orderedIds.size) { "An id appears twice." }
        access.write { store ->
            val dao = store.db.behaviourDao()
            val current = BehaviourCatalog.merge(dao.defs()).associateBy { it.id }
            val changed = orderedIds.mapIndexedNotNull { index, id ->
                val b = current[id] ?: throw IllegalArgumentException("Unknown behaviour.")
                if (b.sortOrder == index) null else b.toDef().copy(sortOrder = index)
            }
            if (changed.isNotEmpty()) dao.upsertDefs(changed)
        }
    }

    private suspend fun changeDef(id: String, change: (BehaviourDefEntity) -> BehaviourDefEntity) {
        access.write { store ->
            val dao = store.db.behaviourDao()
            val current = BehaviourCatalog.merge(dao.defs()).firstOrNull { it.id == id } ?: throw IllegalArgumentException("Unknown behaviour.")
            dao.upsertDef(change(current.toDef()))
        }
    }

    private fun Behaviour.toDef() = BehaviourDefEntity(id, name, kind, iconKey, sortOrder, archived)

    private fun requireName(name: String): String {
        val clean = name.trim()
        require(clean.isNotEmpty() && clean.length <= ExtrasLimits.MAX_NAME_CHARS) { "The name must be 1 to ${ExtrasLimits.MAX_NAME_CHARS} characters." }
        return clean
    }

    companion object {
        /** Every behaviour value is typed in by the owner. */
        val PROVENANCE = DataProvenance.USER_REPORTED
        private const val MAX_EPOCH_DAY = 3_000_000L
    }
}
