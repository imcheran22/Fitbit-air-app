package com.apex.athlete.core.database.entity

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import com.apex.athlete.core.domain.DataProvenance

/*
 * Local-only tables added in schema v4 for the logging and coaching features. None of them is ever sent to a
 * network service (the optional Ask Apex request is built elsewhere, from a previewed payload); they are part of the
 * encrypted database file, of the owner's export, and are removed with it by "Delete all my data".
 *
 * Conventions: string ids (a UUID, so an import is idempotent), times as UTC epoch milliseconds or civil
 * epoch days, nutrition and vital values nullable (missing stays missing, never a default of zero).
 */

/**
 * A custom behaviour the owner tracks daily (and the optional override of a built-in one: the five built-in journal
 * factors keep their values in `daily_biometric_summary`; a row here with the built-in id, for example
 * `JOURNAL_ALCOHOL`, only carries a changed name, order or archived flag).
 */
@Entity(tableName = "behaviour_def", indices = [Index("sortOrder")])
data class BehaviourDefEntity(
    @PrimaryKey val id: String,
    val name: String,
    val kind: BehaviourKind,
    /** Key of an icon in the app's own icon set; the data layer does not interpret it. */
    val iconKey: String,
    val sortOrder: Int,
    val archived: Boolean,
)

/** One value of one custom behaviour for one civil day. Always self-reported ([DataProvenance.USER_REPORTED]), no free text. */
@Entity(
    tableName = "behaviour_entry",
    primaryKeys = ["epochDay", "behaviourId"],
    indices = [Index("epochDay"), Index("behaviourId")],
)
data class BehaviourEntryEntity(
    val epochDay: Long,
    val behaviourId: String,
    /** [BehaviourKind.YES_NO]: 0.0 or 1.0. [BehaviourKind.SCALE_0_4]: 0.0 to 4.0. */
    val value: Double,
    val updatedAtEpochMillis: Long,
)

/** A quick log entry: water, mood, a symptom or a short note. Always self-reported. */
@Entity(tableName = "quick_log", indices = [Index("epochMillis")])
data class QuickLogEntity(
    @PrimaryKey val id: String,
    val epochMillis: Long,
    val kind: QuickLogKind,
    /** Millilitres for [QuickLogKind.WATER_ML], a scale value for [QuickLogKind.MOOD]; null otherwise. */
    val numericValue: Double? = null,
    val label: String? = null,
    /** Free text, at most [MAX_TEXT_LENGTH] characters (enforced by the repository and the importer). */
    val text: String? = null,
) {
    companion object {
        const val MAX_TEXT_LENGTH = 500
    }
}

/** A target the owner set. Progress is computed from the readings elsewhere; nothing about progress is stored. */
@Entity(tableName = "goal", indices = [Index("createdAtEpochMillis")])
data class GoalEntity(
    @PrimaryKey val id: String,
    val kind: GoalKind,
    val target: Double,
    val enabled: Boolean,
    val reminderEnabled: Boolean,
    val createdAtEpochMillis: Long,
)

/** One logged meal or snack. Every nutrient is nullable: an unknown value is stored as missing, not as zero. */
@Entity(tableName = "food_log", indices = [Index("epochMillis")])
data class FoodLogEntity(
    @PrimaryKey val id: String,
    val epochMillis: Long,
    val mealKind: MealKind,
    val name: String,
    val kcal: Double? = null,
    val proteinG: Double? = null,
    val carbsG: Double? = null,
    val fatG: Double? = null,
    val fibreG: Double? = null,
    val source: FoodSource,
    /** [DataProvenance.USER_REPORTED] for MANUAL, [DataProvenance.AI_INTERPRETED] for AI_ESTIMATE, [DataProvenance.IMPORTED_HEALTH_CONNECT] for HEALTH_CONNECT. */
    val provenance: DataProvenance,
)

/** One blood pressure reading in mmHg. */
@Entity(tableName = "blood_pressure_reading", indices = [Index("epochMillis")])
data class BloodPressureReadingEntity(
    @PrimaryKey val id: String,
    val epochMillis: Long,
    val systolic: Double,
    val diastolic: Double,
    /** Beats per minute at the time of the reading, when it was recorded with one. */
    val pulse: Int? = null,
    val source: BloodPressureSource,
    val provenance: DataProvenance,
)

/** One guided breathing session. */
@Entity(tableName = "breathe_session", indices = [Index("startMillis")])
data class BreatheSessionEntity(
    @PrimaryKey val id: String,
    val startMillis: Long,
    val plannedSeconds: Int,
    val completedSeconds: Int,
    /** Key of the breathing pattern in the app (for example box or 4-7-8); the data layer does not interpret it. */
    val patternKey: String,
    val avgHeartRate: Int? = null,
)

/** One conversation with the coach. */
@Entity(tableName = "coach_thread", indices = [Index("updatedAtEpochMillis")])
data class CoachThreadEntity(
    @PrimaryKey val id: String,
    val title: String,
    val topic: CoachTopic,
    val createdAtEpochMillis: Long,
    val updatedAtEpochMillis: Long,
)

/** One message of a [CoachThreadEntity]; deleting the thread deletes its messages. */
@Entity(
    tableName = "coach_message",
    foreignKeys = [
        ForeignKey(
            entity = CoachThreadEntity::class,
            parentColumns = ["id"],
            childColumns = ["threadId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [Index("threadId"), Index("createdAtMillis")],
)
data class CoachMessageEntity(
    @PrimaryKey val id: String,
    val threadId: String,
    val role: CoachRole,
    val text: String,
    val createdAtMillis: Long,
    /** USER messages: [DataProvenance.USER_REPORTED]. COACH: [DataProvenance.AI_INTERPRETED] from a model, [DataProvenance.MATHEMATICALLY_DERIVED] from the rules. */
    val provenance: DataProvenance,
    /** Comma-separated numerals of a model reply that the numeral check could not match to the supplied facts; null when none. */
    val unverifiedNumerals: String? = null,
)
