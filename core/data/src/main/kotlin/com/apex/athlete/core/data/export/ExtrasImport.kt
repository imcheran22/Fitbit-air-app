package com.apex.athlete.core.data.export

import com.apex.athlete.core.data.extras.ExtrasLimits
import com.apex.athlete.core.database.entity.BehaviourDefEntity
import com.apex.athlete.core.database.entity.BehaviourEntryEntity
import com.apex.athlete.core.database.entity.BehaviourKind
import com.apex.athlete.core.database.entity.BloodPressureReadingEntity
import com.apex.athlete.core.database.entity.BloodPressureSource
import com.apex.athlete.core.database.entity.BreatheSessionEntity
import com.apex.athlete.core.database.entity.CoachMessageEntity
import com.apex.athlete.core.database.entity.CoachRole
import com.apex.athlete.core.database.entity.CoachThreadEntity
import com.apex.athlete.core.database.entity.CoachTopic
import com.apex.athlete.core.database.entity.FoodLogEntity
import com.apex.athlete.core.database.entity.FoodSource
import com.apex.athlete.core.database.entity.GoalEntity
import com.apex.athlete.core.database.entity.GoalKind
import com.apex.athlete.core.database.entity.MealKind
import com.apex.athlete.core.database.entity.QuickLogEntity
import com.apex.athlete.core.database.entity.QuickLogKind
import com.apex.athlete.core.domain.DataProvenance
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

/** Validated rows of the local logging tables, ready to be written. Tables are written in this order (threads before messages). */
data class ExtrasBatch(
    val behaviourDefs: List<BehaviourDefEntity> = emptyList(),
    val behaviourEntries: List<BehaviourEntryEntity> = emptyList(),
    val quickLogs: List<QuickLogEntity> = emptyList(),
    val goals: List<GoalEntity> = emptyList(),
    val foodLogs: List<FoodLogEntity> = emptyList(),
    val bloodPressure: List<BloodPressureReadingEntity> = emptyList(),
    val breatheSessions: List<BreatheSessionEntity> = emptyList(),
    val coachThreads: List<CoachThreadEntity> = emptyList(),
    val coachMessages: List<CoachMessageEntity> = emptyList(),
) {
    val size: Int
        get() = behaviourDefs.size + behaviourEntries.size + quickLogs.size + goals.size + foodLogs.size +
            bloodPressure.size + breatheSessions.size + coachThreads.size + coachMessages.size
}

/** [written] rows are in the store; [dropped] rows could not be written (a message whose thread is not there). */
data class ExtrasImportResult(val written: Long, val dropped: Long)

internal class ExtrasAccumulator {
    private val defs = ArrayList<BehaviourDefEntity>()
    private val entries = ArrayList<BehaviourEntryEntity>()
    private val quick = ArrayList<QuickLogEntity>()
    private val goals = ArrayList<GoalEntity>()
    private val food = ArrayList<FoodLogEntity>()
    private val bp = ArrayList<BloodPressureReadingEntity>()
    private val breathe = ArrayList<BreatheSessionEntity>()
    private val threads = ArrayList<CoachThreadEntity>()
    private val messages = ArrayList<CoachMessageEntity>()

    val size: Int get() = defs.size + entries.size + quick.size + goals.size + food.size + bp.size + breathe.size + threads.size + messages.size

    fun add(entity: Any) {
        when (entity) {
            is BehaviourDefEntity -> defs += entity
            is BehaviourEntryEntity -> entries += entity
            is QuickLogEntity -> quick += entity
            is GoalEntity -> goals += entity
            is FoodLogEntity -> food += entity
            is BloodPressureReadingEntity -> bp += entity
            is BreatheSessionEntity -> breathe += entity
            is CoachThreadEntity -> threads += entity
            is CoachMessageEntity -> messages += entity
            else -> error("Not an extras entity")
        }
    }

    /** The collected rows as one batch; the accumulator is empty afterwards. */
    fun drain(): ExtrasBatch {
        val batch = ExtrasBatch(defs.toList(), entries.toList(), quick.toList(), goals.toList(), food.toList(), bp.toList(), breathe.toList(), threads.toList(), messages.toList())
        defs.clear(); entries.clear(); quick.clear(); goals.clear(); food.clear(); bp.clear(); breathe.clear(); threads.clear(); messages.clear()
        return batch
    }
}

internal sealed interface ExtrasMapped {
    data class Ok(val entity: Any) : ExtrasMapped
    data class Rejected(val reason: QuarantineReason) : ExtrasMapped
}

/**
 * Validates one decoded row of the local logging tables and converts it to its entity.
 *
 * Same stance as [ImportMapping]: a bad row is dropped and counted, never repaired. Differences that follow from
 * what these tables are: they hold what the owner typed or what a model replied (not recomputable from readings), so
 * AI and rule-derived provenance is accepted where it belongs (coach replies), while demo and unavailable markers and
 * device-sensor provenance are refused; a row's source and provenance must agree.
 */
internal object ExtrasImportMapping {
    private const val MAX_EPOCH_DAY = 3_000_000L
    private val provenances = DataProvenance.entries.associateBy { it.storageKey }

    private fun validTime(ms: Long) = ms in 1..(MAX_EPOCH_DAY * 86_400_000L)
    private fun validId(id: String) = id.isNotBlank() && id.length <= ExtrasLimits.MAX_ID_CHARS

    private fun reject(r: QuarantineReason) = ExtrasMapped.Rejected(r)

    fun map(table: ExtrasTable, raw: String, json: Json): ExtrasMapped = try {
        when (table) {
            ExtrasTable.BEHAVIOUR_DEFS -> behaviourDef(decode(json, BehaviourDefRow.serializer(), raw))
            ExtrasTable.BEHAVIOUR_ENTRIES -> behaviourEntry(decode(json, BehaviourEntryRow.serializer(), raw))
            ExtrasTable.QUICK_LOGS -> quickLog(decode(json, QuickLogRow.serializer(), raw))
            ExtrasTable.GOALS -> goal(decode(json, GoalRow.serializer(), raw))
            ExtrasTable.FOOD_LOGS -> food(decode(json, FoodLogRow.serializer(), raw))
            ExtrasTable.BLOOD_PRESSURE -> bloodPressure(decode(json, BloodPressureRow.serializer(), raw))
            ExtrasTable.BREATHE_SESSIONS -> breathe(decode(json, BreatheSessionRow.serializer(), raw))
            ExtrasTable.COACH_THREADS -> thread(decode(json, CoachThreadRow.serializer(), raw))
            ExtrasTable.COACH_MESSAGES -> message(decode(json, CoachMessageRow.serializer(), raw))
        }
    } catch (_: SerializationException) {
        reject(QuarantineReason.MALFORMED_ROW)
    } catch (_: IllegalArgumentException) {
        reject(QuarantineReason.MALFORMED_ROW)
    }

    private fun <R> decode(json: Json, ser: KSerializer<R>, raw: String): R = json.decodeFromString(ser, raw)

    private fun behaviourDef(r: BehaviourDefRow): ExtrasMapped {
        val kind = BehaviourKind.fromStorageKeyOrNull(r.kind) ?: return reject(QuarantineReason.UNKNOWN_KIND)
        val name = r.name.trim()
        if (!validId(r.id) || name.isEmpty() || name.length > ExtrasLimits.MAX_NAME_CHARS || r.iconKey.length > ExtrasLimits.MAX_ICON_KEY_CHARS) {
            return reject(QuarantineReason.INVALID_VALUE)
        }
        return ExtrasMapped.Ok(BehaviourDefEntity(r.id, name, kind, r.iconKey, r.sortOrder, r.archived))
    }

    private fun behaviourEntry(r: BehaviourEntryRow): ExtrasMapped {
        if (!validId(r.behaviourId) || !r.value.isFinite() || r.value !in ExtrasLimits.SCALE_MIN..ExtrasLimits.SCALE_MAX) {
            return reject(QuarantineReason.INVALID_VALUE)
        }
        if (r.epochDay !in -1L..MAX_EPOCH_DAY) return reject(QuarantineReason.INVALID_TIME)
        return ExtrasMapped.Ok(BehaviourEntryEntity(r.epochDay, r.behaviourId, r.value, r.updatedAtEpochMillis))
    }

    private fun quickLog(r: QuickLogRow): ExtrasMapped {
        val kind = QuickLogKind.fromStorageKeyOrNull(r.kind) ?: return reject(QuarantineReason.UNKNOWN_KIND)
        if (!validId(r.id)) return reject(QuarantineReason.INVALID_VALUE)
        if (!validTime(r.epochMillis)) return reject(QuarantineReason.INVALID_TIME)
        if (r.numericValue != null && (!r.numericValue.isFinite() || r.numericValue < 0.0)) return reject(QuarantineReason.INVALID_VALUE)
        if ((r.text?.length ?: 0) > ExtrasLimits.MAX_NOTE_CHARS || (r.label?.length ?: 0) > ExtrasLimits.MAX_LABEL_CHARS) {
            return reject(QuarantineReason.INVALID_VALUE)
        }
        return ExtrasMapped.Ok(QuickLogEntity(r.id, r.epochMillis, kind, r.numericValue, r.label, r.text))
    }

    private fun goal(r: GoalRow): ExtrasMapped {
        val kind = GoalKind.fromStorageKeyOrNull(r.kind) ?: return reject(QuarantineReason.UNKNOWN_KIND)
        if (!validId(r.id) || !r.target.isFinite() || r.target <= 0.0) return reject(QuarantineReason.INVALID_VALUE)
        return ExtrasMapped.Ok(GoalEntity(r.id, kind, r.target, r.enabled, r.reminderEnabled, r.createdAtEpochMillis))
    }

    private val foodProvenances = setOf(
        DataProvenance.USER_REPORTED, DataProvenance.AI_INTERPRETED, DataProvenance.ESTIMATED,
        DataProvenance.IMPORTED_HEALTH_CONNECT, DataProvenance.IMPORTED_FILE_ARCHIVE,
    )

    private fun food(r: FoodLogRow): ExtrasMapped {
        val meal = MealKind.fromStorageKeyOrNull(r.mealKind) ?: return reject(QuarantineReason.UNKNOWN_KIND)
        val source = FoodSource.fromStorageKeyOrNull(r.source) ?: return reject(QuarantineReason.UNKNOWN_KIND)
        val p = provenances[r.provenance] ?: return reject(QuarantineReason.UNKNOWN_PROVENANCE)
        if (p !in foodProvenances) return reject(QuarantineReason.PROVENANCE_NOT_IMPORTABLE)
        val name = r.name.trim()
        if (!validId(r.id) || name.isEmpty() || name.length > ExtrasLimits.MAX_LABEL_CHARS) return reject(QuarantineReason.INVALID_VALUE)
        if (!validTime(r.epochMillis)) return reject(QuarantineReason.INVALID_TIME)
        // A missing nutrient stays missing; a present one must be a finite, non-negative number.
        if (listOfNotNull(r.kcal, r.proteinG, r.carbsG, r.fatG, r.fibreG).any { !it.isFinite() || it < 0.0 }) return reject(QuarantineReason.INVALID_VALUE)
        return ExtrasMapped.Ok(FoodLogEntity(r.id, r.epochMillis, meal, name, r.kcal, r.proteinG, r.carbsG, r.fatG, r.fibreG, source, p))
    }

    private val bpProvenances = setOf(
        DataProvenance.USER_REPORTED, DataProvenance.IMPORTED_HEALTH_CONNECT, DataProvenance.IMPORTED_FILE_ARCHIVE,
    )

    private fun bloodPressure(r: BloodPressureRow): ExtrasMapped {
        val source = BloodPressureSource.fromStorageKeyOrNull(r.source) ?: return reject(QuarantineReason.UNKNOWN_KIND)
        val p = provenances[r.provenance] ?: return reject(QuarantineReason.UNKNOWN_PROVENANCE)
        if (p !in bpProvenances) return reject(QuarantineReason.PROVENANCE_NOT_IMPORTABLE)
        if (!validId(r.id)) return reject(QuarantineReason.INVALID_VALUE)
        if (!validTime(r.epochMillis)) return reject(QuarantineReason.INVALID_TIME)
        if (!r.systolic.isFinite() || !r.diastolic.isFinite() ||
            r.systolic !in ExtrasLimits.SYSTOLIC_MIN..ExtrasLimits.SYSTOLIC_MAX ||
            r.diastolic !in ExtrasLimits.DIASTOLIC_MIN..ExtrasLimits.DIASTOLIC_MAX ||
            r.diastolic >= r.systolic ||
            (r.pulse != null && r.pulse !in ExtrasLimits.PULSE_MIN..ExtrasLimits.PULSE_MAX)
        ) return reject(QuarantineReason.INVALID_VALUE)
        return ExtrasMapped.Ok(BloodPressureReadingEntity(r.id, r.epochMillis, r.systolic, r.diastolic, r.pulse, source, p))
    }

    private fun breathe(r: BreatheSessionRow): ExtrasMapped {
        if (!validId(r.id) || r.patternKey.isBlank() || r.patternKey.length > ExtrasLimits.MAX_ICON_KEY_CHARS) return reject(QuarantineReason.INVALID_VALUE)
        if (!validTime(r.startMillis)) return reject(QuarantineReason.INVALID_TIME)
        if (r.plannedSeconds !in 1..ExtrasLimits.MAX_SESSION_SECONDS || r.completedSeconds !in 0..ExtrasLimits.MAX_SESSION_SECONDS ||
            (r.avgHeartRate != null && r.avgHeartRate !in ExtrasLimits.PULSE_MIN..ExtrasLimits.PULSE_MAX)
        ) return reject(QuarantineReason.INVALID_VALUE)
        return ExtrasMapped.Ok(BreatheSessionEntity(r.id, r.startMillis, r.plannedSeconds, r.completedSeconds, r.patternKey, r.avgHeartRate))
    }

    private fun thread(r: CoachThreadRow): ExtrasMapped {
        val topic = CoachTopic.fromStorageKeyOrNull(r.topic) ?: return reject(QuarantineReason.UNKNOWN_KIND)
        if (!validId(r.id) || r.title.length > ExtrasLimits.MAX_TITLE_CHARS) return reject(QuarantineReason.INVALID_VALUE)
        if (!validTime(r.createdAtEpochMillis) || !validTime(r.updatedAtEpochMillis)) return reject(QuarantineReason.INVALID_TIME)
        return ExtrasMapped.Ok(CoachThreadEntity(r.id, r.title, topic, r.createdAtEpochMillis, r.updatedAtEpochMillis))
    }

    private fun message(r: CoachMessageRow): ExtrasMapped {
        val role = CoachRole.fromStorageKeyOrNull(r.role) ?: return reject(QuarantineReason.UNKNOWN_KIND)
        val p = provenances[r.provenance] ?: return reject(QuarantineReason.UNKNOWN_PROVENANCE)
        val allowed = when (role) {
            CoachRole.USER -> p == DataProvenance.USER_REPORTED
            CoachRole.COACH -> p == DataProvenance.AI_INTERPRETED || p == DataProvenance.MATHEMATICALLY_DERIVED
        }
        if (!allowed) return reject(QuarantineReason.PROVENANCE_NOT_IMPORTABLE)
        if (!validId(r.id) || !validId(r.threadId) || r.text.length > ExtrasLimits.MAX_MESSAGE_CHARS) return reject(QuarantineReason.INVALID_VALUE)
        if (!validTime(r.createdAtMillis)) return reject(QuarantineReason.INVALID_TIME)
        return ExtrasMapped.Ok(CoachMessageEntity(r.id, r.threadId, role, r.text, r.createdAtMillis, p, r.unverifiedNumerals))
    }
}
