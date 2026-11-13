package com.apex.athlete.core.data.extras

import com.apex.athlete.core.data.pipeline.JournalDay
import com.apex.athlete.core.database.entity.BehaviourDefEntity
import com.apex.athlete.core.database.entity.BehaviourEntryEntity
import com.apex.athlete.core.database.entity.BehaviourKind
import com.apex.athlete.core.database.entity.DailyBiometricSummaryEntity
import com.apex.athlete.core.domain.MetricType

/** One behaviour as the screens see it: a built-in journal factor or a custom one. */
data class Behaviour(
    /** The built-in factor's metric storage key (for example `journal_alcohol`), or `custom:<uuid>`. */
    val id: String,
    val name: String,
    val kind: BehaviourKind,
    val iconKey: String,
    val sortOrder: Int,
    val archived: Boolean,
    val builtIn: Boolean,
)

/** A behaviour with its value on one day; [value] null means not logged that day (never shown as zero). Provenance is [BehaviourRepository.PROVENANCE]. */
data class BehaviourValue(val behaviour: Behaviour, val value: Double?)

/** One logged value of one behaviour on one day (built-in or custom). */
data class BehaviourDayEntry(val epochDay: Long, val behaviourId: String, val value: Double)

/**
 * The built-in behaviours and the rule that merges them with the rows of `behaviour_def`.
 *
 * The five journal factors keep their values in `daily_biometric_summary` (the analytics read them there). A
 * `behaviour_def` row whose id is a built-in id is an override: it can rename, reorder or archive the built-in one
 * but never changes where its values live.
 */
object BehaviourCatalog {
    /** Display names and icon keys of the built-in factors, in the order of [JournalDay.FACTORS]. */
    private fun defaults(metric: MetricType): Pair<String, String> = when (metric) {
        MetricType.JOURNAL_ALCOHOL -> "Alcohol" to "alcohol"
        MetricType.JOURNAL_LATE_CAFFEINE -> "Late caffeine" to "caffeine"
        MetricType.JOURNAL_LATE_MEAL -> "Late meal" to "late_meal"
        MetricType.JOURNAL_STRESSFUL_DAY -> "Stressful day" to "stress"
        MetricType.JOURNAL_TRAVEL -> "Travel" to "travel"
        else -> metric.storageKey to "behaviour"
    }

    const val CUSTOM_PREFIX = "custom:"

    /** The metric holding a built-in behaviour's values, or null for a custom behaviour id. */
    fun builtInMetric(id: String): MetricType? = JournalDay.FACTORS.firstOrNull { it.storageKey == id }

    fun builtInId(metric: MetricType): String = metric.storageKey

    val builtInIds: List<String> get() = JournalDay.FACTORS.map { it.storageKey }

    /** Built-ins with their overrides applied, plus every custom row, ordered by sort order (built-ins first on a tie, then by id). */
    fun merge(rows: List<BehaviourDefEntity>): List<Behaviour> {
        val byId = rows.associateBy { it.id }
        val builtIns = JournalDay.FACTORS.mapIndexed { index, metric ->
            val (name, icon) = defaults(metric)
            val o = byId[metric.storageKey]
            Behaviour(
                id = metric.storageKey,
                name = o?.name ?: name,
                kind = BehaviourKind.YES_NO,
                iconKey = o?.iconKey ?: icon,
                sortOrder = o?.sortOrder ?: index,
                archived = o?.archived ?: false,
                builtIn = true,
            )
        }
        val builtInIds = builtIns.map { it.id }.toSet()
        val custom = rows.filter { it.id !in builtInIds }.map {
            Behaviour(it.id, it.name, it.kind, it.iconKey, it.sortOrder, it.archived, builtIn = false)
        }
        return (builtIns + custom).sortedWith(compareBy<Behaviour>({ it.sortOrder }, { !it.builtIn }, { it.id }))
    }

    /** The day's values of [behaviours], in their order. Archived ones are left out unless [includeArchived]. */
    fun dayValues(
        behaviours: List<Behaviour>,
        entries: List<BehaviourDayEntry>,
        includeArchived: Boolean,
    ): List<BehaviourValue> {
        val byId = entries.associate { it.behaviourId to it.value }
        return behaviours.filter { includeArchived || !it.archived }.map { BehaviourValue(it, byId[it.id]) }
    }

    /** Built-in rows of `daily_biometric_summary` and custom entries as one list of [BehaviourDayEntry], by day then id. */
    fun entries(builtIn: List<DailyBiometricSummaryEntity>, custom: List<BehaviourEntryEntity>): List<BehaviourDayEntry> {
        val out = ArrayList<BehaviourDayEntry>(builtIn.size + custom.size)
        for (r in builtIn) if (r.metricType in JournalDay.FACTORS) out += BehaviourDayEntry(r.epochDay, builtInId(r.metricType), r.value)
        for (e in custom) out += BehaviourDayEntry(e.epochDay, e.behaviourId, e.value)
        return out.sortedWith(compareBy<BehaviourDayEntry>({ it.epochDay }, { it.behaviourId }))
    }

    /** Throws [IllegalArgumentException] unless [value] is allowed for [kind]: 0 or 1 for yes/no, a whole number 0 to 4 for the scale. */
    fun requireValid(kind: BehaviourKind, value: Double) {
        require(value.isFinite()) { "The value must be a number." }
        when (kind) {
            BehaviourKind.YES_NO -> require(value == 0.0 || value == 1.0) { "A yes/no behaviour takes 0 or 1." }
            BehaviourKind.SCALE_0_4 -> require(value in ExtrasLimits.SCALE_MIN..ExtrasLimits.SCALE_MAX && value == Math.rint(value)) {
                "A 0-4 behaviour takes a whole number from 0 to 4."
            }
        }
    }
}
