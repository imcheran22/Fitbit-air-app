package com.apex.athlete.core.data.extras

import com.apex.athlete.core.database.entity.BloodPressureReadingEntity
import com.apex.athlete.core.database.entity.BloodPressureSource
import com.apex.athlete.core.database.entity.BreatheSessionEntity
import com.apex.athlete.core.database.entity.FoodLogEntity
import com.apex.athlete.core.database.entity.FoodSource
import com.apex.athlete.core.database.entity.GoalEntity
import com.apex.athlete.core.database.entity.GoalKind
import com.apex.athlete.core.database.entity.MealKind
import com.apex.athlete.core.database.entity.QuickLogEntity
import com.apex.athlete.core.database.entity.QuickLogKind
import com.apex.athlete.core.domain.DataProvenance
import kotlinx.coroutines.flow.Flow

/*
 * Thin repositories of the local logging tables. Reads are Flows of the Room entities of the active store; writes
 * validate, then go through ExtrasStoreAccess (write mutex, no Demo store). Ids are UUID strings.
 */

private const val MAX_EPOCH_MILLIS = 3_000_000L * 86_400_000L

private fun requireTime(millis: Long) = require(millis in 1..MAX_EPOCH_MILLIS) { "The time is out of range." }

private fun requireNutrient(v: Double?) = require(v == null || (v.isFinite() && v >= 0.0)) { "A nutrient must be a number of zero or more, or left out." }

/** Quick log: water, mood, symptom and note entries. Always self-reported. */
class QuickLogRepository internal constructor(
    private val access: ExtrasStoreAccess,
    private val clock: ExtrasClock,
    private val newId: () -> String,
) {
    /** Entries of one civil day, newest first. */
    fun observeDay(epochDay: Long): Flow<List<QuickLogEntity>> {
        val (from, to) = clock.dayBounds(epochDay)
        return access.observe<List<QuickLogEntity>>(emptyList()) { it.db.quickLogDao().observeBetween(from, to) }
    }

    fun observeRecent(limit: Int = 50): Flow<List<QuickLogEntity>> =
        access.observe<List<QuickLogEntity>>(emptyList()) { it.db.quickLogDao().observeRecent(limit) }

    /** Millilitres of water logged on a civil day; null when none was logged. */
    fun observeWaterMl(epochDay: Long): Flow<Double?> {
        val (from, to) = clock.dayBounds(epochDay)
        return access.observe<Double?>(null) { it.db.quickLogDao().observeSum(QuickLogKind.WATER_ML, from, to) }
    }

    /**
     * Adds an entry and returns its id. WATER_ML needs [numericValue] above 0 (at most 10 000 ml); MOOD needs 0 to 10;
     * SYMPTOM needs a [label]; NOTE needs [text]. [text] is at most [ExtrasLimits.MAX_NOTE_CHARS] characters: longer text
     * is rejected with [IllegalArgumentException], never cut.
     */
    suspend fun add(
        kind: QuickLogKind,
        epochMillis: Long = clock.now(),
        numericValue: Double? = null,
        label: String? = null,
        text: String? = null,
    ): String {
        val entry = validated(QuickLogEntity(newId(), epochMillis, kind, numericValue, label?.trim()?.ifEmpty { null }, text?.trim()?.ifEmpty { null }))
        access.write { it.db.quickLogDao().upsert(entry) }
        return entry.id
    }

    suspend fun addWater(millilitres: Double, epochMillis: Long = clock.now()): String =
        add(QuickLogKind.WATER_ML, epochMillis, numericValue = millilitres)

    /** Replaces the entry with the same id (an edit). */
    suspend fun update(entry: QuickLogEntity) {
        val valid = validated(entry)
        access.write { it.db.quickLogDao().upsert(valid) }
    }

    suspend fun delete(id: String) {
        access.write { it.db.quickLogDao().deleteById(id) }
    }

    private fun validated(e: QuickLogEntity): QuickLogEntity {
        requireTime(e.epochMillis)
        val v = e.numericValue
        require(v == null || v.isFinite()) { "The value must be a number." }
        require((e.text?.length ?: 0) <= ExtrasLimits.MAX_NOTE_CHARS) { "The text is longer than ${ExtrasLimits.MAX_NOTE_CHARS} characters." }
        require((e.label?.length ?: 0) <= ExtrasLimits.MAX_LABEL_CHARS) { "The label is too long." }
        when (e.kind) {
            QuickLogKind.WATER_ML -> require(v != null && v > 0.0 && v <= 10_000.0) { "Water must be above 0 and at most 10 000 ml." }
            QuickLogKind.MOOD -> require(v != null && v in 0.0..10.0) { "Mood must be 0 to 10." }
            QuickLogKind.SYMPTOM -> require(!e.label.isNullOrBlank()) { "A symptom needs a label." }
            QuickLogKind.NOTE -> require(!e.text.isNullOrBlank()) { "A note needs text." }
        }
        return e
    }
}

/** Goal definitions. Create, read, update and delete only: progress is computed elsewhere from the readings. */
class GoalRepository internal constructor(
    private val access: ExtrasStoreAccess,
    private val clock: ExtrasClock,
    private val newId: () -> String,
) {
    fun observeAll(): Flow<List<GoalEntity>> = access.observe<List<GoalEntity>>(emptyList()) { it.db.goalDao().observeAll() }

    suspend fun get(id: String): GoalEntity? = access.read<GoalEntity?>(null) { it.db.goalDao().byId(id) }

    suspend fun add(kind: GoalKind, target: Double, enabled: Boolean = true, reminderEnabled: Boolean = false): String {
        requireTarget(target)
        val goal = GoalEntity(newId(), kind, target, enabled, reminderEnabled, clock.now())
        access.write { it.db.goalDao().upsert(goal) }
        return goal.id
    }

    /** Changes the given fields of a goal; throws [IllegalArgumentException] for an unknown id. */
    suspend fun update(id: String, target: Double? = null, enabled: Boolean? = null, reminderEnabled: Boolean? = null) {
        if (target != null) requireTarget(target)
        access.write { store ->
            val dao = store.db.goalDao()
            val current = dao.byId(id) ?: throw IllegalArgumentException("Unknown goal.")
            dao.upsert(
                current.copy(
                    target = target ?: current.target,
                    enabled = enabled ?: current.enabled,
                    reminderEnabled = reminderEnabled ?: current.reminderEnabled,
                ),
            )
        }
    }

    suspend fun delete(id: String) {
        access.write { it.db.goalDao().deleteById(id) }
    }

    private fun requireTarget(target: Double) = require(target.isFinite() && target > 0.0) { "The target must be above 0." }
}

/** Food log. Nutrients are optional and stay missing when not given. */
class FoodRepository internal constructor(
    private val access: ExtrasStoreAccess,
    private val clock: ExtrasClock,
    private val newId: () -> String,
) {
    fun observeDay(epochDay: Long): Flow<List<FoodLogEntity>> {
        val (from, to) = clock.dayBounds(epochDay)
        return access.observe<List<FoodLogEntity>>(emptyList()) { it.db.foodLogDao().observeBetween(from, to) }
    }

    fun observeRecent(limit: Int = 50): Flow<List<FoodLogEntity>> =
        access.observe<List<FoodLogEntity>>(emptyList()) { it.db.foodLogDao().observeRecent(limit) }

    /**
     * Adds a meal and returns its id. The provenance follows [source]: MANUAL is self-reported, AI_ESTIMATE is
     * AI-interpreted (an estimate, shown as such), HEALTH_CONNECT is imported. A synchroniser passes a stable [id]
     * (for example `hc:<record id>`) so writing the same record again replaces it instead of adding a second one.
     */
    suspend fun add(
        mealKind: MealKind,
        name: String,
        epochMillis: Long = clock.now(),
        kcal: Double? = null,
        proteinG: Double? = null,
        carbsG: Double? = null,
        fatG: Double? = null,
        fibreG: Double? = null,
        source: FoodSource = FoodSource.MANUAL,
        id: String? = null,
    ): String {
        val entry = validated(FoodLogEntity(id ?: newId(), epochMillis, mealKind, name, kcal, proteinG, carbsG, fatG, fibreG, source, provenanceOf(source)))
        access.write { it.db.foodLogDao().upsert(entry) }
        return entry.id
    }

    /** Replaces the entry with the same id (an edit); the provenance is set again from the source. */
    suspend fun update(entry: FoodLogEntity) {
        val valid = validated(entry.copy(provenance = provenanceOf(entry.source)))
        access.write { it.db.foodLogDao().upsert(valid) }
    }

    suspend fun delete(id: String) {
        access.write { it.db.foodLogDao().deleteById(id) }
    }

    private fun validated(e: FoodLogEntity): FoodLogEntity {
        requireTime(e.epochMillis)
        val name = e.name.trim()
        require(name.isNotEmpty() && name.length <= ExtrasLimits.MAX_LABEL_CHARS) { "The name must be 1 to ${ExtrasLimits.MAX_LABEL_CHARS} characters." }
        require(e.id.isNotBlank() && e.id.length <= ExtrasLimits.MAX_ID_CHARS) { "The id is invalid." }
        listOf(e.kcal, e.proteinG, e.carbsG, e.fatG, e.fibreG).forEach(::requireNutrient)
        return e.copy(name = name)
    }

    companion object {
        fun provenanceOf(source: FoodSource): DataProvenance = when (source) {
            FoodSource.MANUAL -> DataProvenance.USER_REPORTED
            FoodSource.AI_ESTIMATE -> DataProvenance.AI_INTERPRETED
            FoodSource.HEALTH_CONNECT -> DataProvenance.IMPORTED_HEALTH_CONNECT
        }
    }
}

/** Blood pressure readings in mmHg. */
class BloodPressureRepository internal constructor(
    private val access: ExtrasStoreAccess,
    private val clock: ExtrasClock,
    private val newId: () -> String,
) {
    fun observeRecent(limit: Int = 50): Flow<List<BloodPressureReadingEntity>> =
        access.observe<List<BloodPressureReadingEntity>>(emptyList()) { it.db.bloodPressureDao().observeRecent(limit) }

    /** Readings from the start of [fromDay] to the end of [toDay], oldest first. */
    fun observeDays(fromDay: Long, toDay: Long): Flow<List<BloodPressureReadingEntity>> {
        val from = clock.dayBounds(fromDay).first
        val to = clock.dayBounds(toDay).second
        return access.observe<List<BloodPressureReadingEntity>>(emptyList()) { it.db.bloodPressureDao().observeBetween(from, to) }
    }

    /**
     * Adds a reading and returns its id. Systolic 40 to 300, diastolic 20 to 200 and below systolic, pulse 25 to 240
     * when given; anything else is rejected as a typing error. Provenance: self-reported for MANUAL, imported for
     * HEALTH_CONNECT. A synchroniser passes a stable [id] so the same record is replaced, not duplicated.
     */
    suspend fun add(
        systolic: Double,
        diastolic: Double,
        pulse: Int? = null,
        epochMillis: Long = clock.now(),
        source: BloodPressureSource = BloodPressureSource.MANUAL,
        id: String? = null,
    ): String {
        val entry = validated(BloodPressureReadingEntity(id ?: newId(), epochMillis, systolic, diastolic, pulse, source, provenanceOf(source)))
        access.write { it.db.bloodPressureDao().upsert(entry) }
        return entry.id
    }

    suspend fun update(entry: BloodPressureReadingEntity) {
        val valid = validated(entry.copy(provenance = provenanceOf(entry.source)))
        access.write { it.db.bloodPressureDao().upsert(valid) }
    }

    suspend fun delete(id: String) {
        access.write { it.db.bloodPressureDao().deleteById(id) }
    }

    private fun validated(e: BloodPressureReadingEntity): BloodPressureReadingEntity {
        requireTime(e.epochMillis)
        require(e.id.isNotBlank() && e.id.length <= ExtrasLimits.MAX_ID_CHARS) { "The id is invalid." }
        require(e.systolic.isFinite() && e.systolic in ExtrasLimits.SYSTOLIC_MIN..ExtrasLimits.SYSTOLIC_MAX) { "Systolic pressure is out of range." }
        require(e.diastolic.isFinite() && e.diastolic in ExtrasLimits.DIASTOLIC_MIN..ExtrasLimits.DIASTOLIC_MAX) { "Diastolic pressure is out of range." }
        require(e.diastolic < e.systolic) { "Diastolic pressure must be below systolic." }
        val pulse = e.pulse
        require(pulse == null || pulse in ExtrasLimits.PULSE_MIN..ExtrasLimits.PULSE_MAX) { "The pulse is out of range." }
        return e
    }

    companion object {
        fun provenanceOf(source: BloodPressureSource): DataProvenance = when (source) {
            BloodPressureSource.MANUAL -> DataProvenance.USER_REPORTED
            BloodPressureSource.HEALTH_CONNECT -> DataProvenance.IMPORTED_HEALTH_CONNECT
        }
    }
}

/** Guided breathing sessions. */
class BreatheRepository internal constructor(
    private val access: ExtrasStoreAccess,
    private val clock: ExtrasClock,
    private val newId: () -> String,
) {
    fun observeRecent(limit: Int = 50): Flow<List<BreatheSessionEntity>> =
        access.observe<List<BreatheSessionEntity>>(emptyList()) { it.db.breatheSessionDao().observeRecent(limit) }

    fun observeDay(epochDay: Long): Flow<List<BreatheSessionEntity>> {
        val (from, to) = clock.dayBounds(epochDay)
        return access.observe<List<BreatheSessionEntity>>(emptyList()) { it.db.breatheSessionDao().observeBetween(from, to) }
    }

    /** Records a finished or stopped session and returns its id. [avgHeartRate] is stored only when the caller measured one. */
    suspend fun add(startMillis: Long, plannedSeconds: Int, completedSeconds: Int, patternKey: String, avgHeartRate: Int? = null): String {
        requireTime(startMillis)
        require(plannedSeconds in 1..ExtrasLimits.MAX_SESSION_SECONDS) { "The planned length is out of range." }
        require(completedSeconds in 0..ExtrasLimits.MAX_SESSION_SECONDS) { "The completed length is out of range." }
        require(patternKey.isNotBlank() && patternKey.length <= ExtrasLimits.MAX_ICON_KEY_CHARS) { "The pattern key is invalid." }
        require(avgHeartRate == null || avgHeartRate in ExtrasLimits.PULSE_MIN..ExtrasLimits.PULSE_MAX) { "The heart rate is out of range." }
        val session = BreatheSessionEntity(newId(), startMillis, plannedSeconds, completedSeconds, patternKey, avgHeartRate)
        access.write { it.db.breatheSessionDao().upsert(session) }
        return session.id
    }

    suspend fun delete(id: String) {
        access.write { it.db.breatheSessionDao().deleteById(id) }
    }
}
