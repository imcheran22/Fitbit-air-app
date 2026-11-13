package com.apex.athlete.core.data.export

import com.apex.athlete.core.database.entity.BehaviourDefEntity
import com.apex.athlete.core.database.entity.BehaviourEntryEntity
import com.apex.athlete.core.database.entity.BloodPressureReadingEntity
import com.apex.athlete.core.database.entity.BreatheSessionEntity
import com.apex.athlete.core.database.entity.CoachMessageEntity
import com.apex.athlete.core.database.entity.CoachThreadEntity
import com.apex.athlete.core.database.entity.FoodLogEntity
import com.apex.athlete.core.database.entity.GoalEntity
import com.apex.athlete.core.database.entity.QuickLogEntity
import kotlinx.serialization.Serializable

/**
 * The local logging tables of schema v4 in the export file: behaviours, quick log, goals, food, blood pressure,
 * breathing sessions and coach chats. Each is a top-level array next to `daily`, `workouts` and so on, written after
 * them and before `counts`; each row carries its provenance where the table has one (behaviour entries are always
 * self-reported and have none). Older readers ignore these arrays (tolerant reader), so adding them is not a
 * schema version change.
 */
enum class ExtrasTable(val jsonKey: String, val csvFile: String) {
    BEHAVIOUR_DEFS("behaviourDefs", "behaviour_defs.csv"),
    BEHAVIOUR_ENTRIES("behaviourEntries", "behaviour_entries.csv"),
    QUICK_LOGS("quickLogs", "quick_logs.csv"),
    GOALS("goals", "goals.csv"),
    FOOD_LOGS("foodLogs", "food_logs.csv"),
    BLOOD_PRESSURE("bloodPressure", "blood_pressure.csv"),
    BREATHE_SESSIONS("breatheSessions", "breathe_sessions.csv"),

    /** Threads come before messages: an imported message needs its thread. */
    COACH_THREADS("coachThreads", "coach_threads.csv"),
    COACH_MESSAGES("coachMessages", "coach_messages.csv"),
    ;

    companion object {
        private val byKey = entries.associateBy { it.jsonKey }
        fun fromJsonKey(key: String): ExtrasTable? = byKey[key]
    }
}

/** One exported row of an [ExtrasTable]. Enum values are written as their stable storage keys. */
sealed interface ExtraRow

@Serializable
data class BehaviourDefRow(
    val id: String,
    val name: String,
    val kind: String,
    val iconKey: String,
    val sortOrder: Int,
    val archived: Boolean = false,
) : ExtraRow

@Serializable
data class BehaviourEntryRow(
    val epochDay: Long,
    val behaviourId: String,
    val value: Double,
    val updatedAtEpochMillis: Long = 0,
) : ExtraRow

@Serializable
data class QuickLogRow(
    val id: String,
    val epochMillis: Long,
    val kind: String,
    val numericValue: Double? = null,
    val label: String? = null,
    val text: String? = null,
) : ExtraRow

@Serializable
data class GoalRow(
    val id: String,
    val kind: String,
    val target: Double,
    val enabled: Boolean = true,
    val reminderEnabled: Boolean = false,
    val createdAtEpochMillis: Long = 0,
) : ExtraRow

@Serializable
data class FoodLogRow(
    val id: String,
    val epochMillis: Long,
    val mealKind: String,
    val name: String,
    val kcal: Double? = null,
    val proteinG: Double? = null,
    val carbsG: Double? = null,
    val fatG: Double? = null,
    val fibreG: Double? = null,
    val source: String,
    val provenance: String,
) : ExtraRow

@Serializable
data class BloodPressureRow(
    val id: String,
    val epochMillis: Long,
    val systolic: Double,
    val diastolic: Double,
    val pulse: Int? = null,
    val source: String,
    val provenance: String,
) : ExtraRow

@Serializable
data class BreatheSessionRow(
    val id: String,
    val startMillis: Long,
    val plannedSeconds: Int,
    val completedSeconds: Int,
    val patternKey: String,
    val avgHeartRate: Int? = null,
) : ExtraRow

@Serializable
data class CoachThreadRow(
    val id: String,
    val title: String,
    val topic: String,
    val createdAtEpochMillis: Long,
    val updatedAtEpochMillis: Long,
) : ExtraRow

@Serializable
data class CoachMessageRow(
    val id: String,
    val threadId: String,
    val role: String,
    val text: String,
    val createdAtMillis: Long,
    val provenance: String,
    val unverifiedNumerals: String? = null,
) : ExtraRow

/** True when a number in the row is NaN or infinite; such a row is left out of an export and counted as skipped. */
internal fun ExtraRow.hasNonFiniteNumber(): Boolean = when (this) {
    is BehaviourEntryRow -> !value.isFinite()
    is QuickLogRow -> numericValue?.isFinite() == false
    is GoalRow -> !target.isFinite()
    is FoodLogRow -> listOfNotNull(kcal, proteinG, carbsG, fatG, fibreG).any { !it.isFinite() }
    is BloodPressureRow -> !systolic.isFinite() || !diastolic.isFinite()
    is BehaviourDefRow, is BreatheSessionRow, is CoachThreadRow, is CoachMessageRow -> false
}

// --- Entities to rows --------------------------------------------------------------------------------------------

internal fun BehaviourDefEntity.toRow() = BehaviourDefRow(id, name, kind.storageKey, iconKey, sortOrder, archived)
internal fun BehaviourEntryEntity.toRow() = BehaviourEntryRow(epochDay, behaviourId, value, updatedAtEpochMillis)
internal fun QuickLogEntity.toRow() = QuickLogRow(id, epochMillis, kind.storageKey, numericValue, label, text)
internal fun GoalEntity.toRow() = GoalRow(id, kind.storageKey, target, enabled, reminderEnabled, createdAtEpochMillis)
internal fun FoodLogEntity.toRow() = FoodLogRow(
    id, epochMillis, mealKind.storageKey, name, kcal, proteinG, carbsG, fatG, fibreG, source.storageKey, provenance.storageKey,
)
internal fun BloodPressureReadingEntity.toRow() = BloodPressureRow(
    id, epochMillis, systolic, diastolic, pulse, source.storageKey, provenance.storageKey,
)
internal fun BreatheSessionEntity.toRow() = BreatheSessionRow(id, startMillis, plannedSeconds, completedSeconds, patternKey, avgHeartRate)
internal fun CoachThreadEntity.toRow() = CoachThreadRow(id, title, topic.storageKey, createdAtEpochMillis, updatedAtEpochMillis)
internal fun CoachMessageEntity.toRow() = CoachMessageRow(
    id, threadId, role.storageKey, text, createdAtMillis, provenance.storageKey, unverifiedNumerals,
)
