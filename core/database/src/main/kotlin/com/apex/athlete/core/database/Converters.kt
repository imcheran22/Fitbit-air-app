package com.apex.athlete.core.database

import androidx.room.TypeConverter
import com.apex.athlete.core.database.entity.BehaviourKind
import com.apex.athlete.core.database.entity.BloodPressureSource
import com.apex.athlete.core.database.entity.CoachRole
import com.apex.athlete.core.database.entity.CoachTopic
import com.apex.athlete.core.database.entity.FoodSource
import com.apex.athlete.core.database.entity.GoalKind
import com.apex.athlete.core.database.entity.MealKind
import com.apex.athlete.core.database.entity.QuickLogKind
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.domain.SleepStage
import com.apex.athlete.core.domain.SyncSource
import com.apex.athlete.core.domain.SyncStatus

/**
 * Enums are stored by their stable storage key rather than by name or ordinal, so renaming or
 * reordering an enum constant in code can never corrupt existing rows.
 */
class Converters {
    @TypeConverter fun metricTypeToKey(value: MetricType): String = value.storageKey
    @TypeConverter fun keyToMetricType(key: String): MetricType = MetricType.fromStorageKey(key)

    @TypeConverter fun provenanceToKey(value: DataProvenance): String = value.storageKey
    @TypeConverter fun keyToProvenance(key: String): DataProvenance = DataProvenance.fromStorageKey(key)

    @TypeConverter fun sleepStageToKey(value: SleepStage): String = value.storageKey
    @TypeConverter fun keyToSleepStage(key: String): SleepStage = SleepStage.fromStorageKey(key)

    @TypeConverter fun syncSourceToKey(value: SyncSource): String = value.storageKey
    @TypeConverter fun keyToSyncSource(key: String): SyncSource = SyncSource.fromStorageKey(key)

    @TypeConverter fun syncStatusToKey(value: SyncStatus): String = value.storageKey
    @TypeConverter fun keyToSyncStatus(key: String): SyncStatus = SyncStatus.fromStorageKey(key)

    // Schema v4 (local logging tables).
    @TypeConverter fun behaviourKindToKey(value: BehaviourKind): String = value.storageKey
    @TypeConverter fun keyToBehaviourKind(key: String): BehaviourKind = BehaviourKind.fromStorageKey(key)

    @TypeConverter fun quickLogKindToKey(value: QuickLogKind): String = value.storageKey
    @TypeConverter fun keyToQuickLogKind(key: String): QuickLogKind = QuickLogKind.fromStorageKey(key)

    @TypeConverter fun goalKindToKey(value: GoalKind): String = value.storageKey
    @TypeConverter fun keyToGoalKind(key: String): GoalKind = GoalKind.fromStorageKey(key)

    @TypeConverter fun mealKindToKey(value: MealKind): String = value.storageKey
    @TypeConverter fun keyToMealKind(key: String): MealKind = MealKind.fromStorageKey(key)

    @TypeConverter fun foodSourceToKey(value: FoodSource): String = value.storageKey
    @TypeConverter fun keyToFoodSource(key: String): FoodSource = FoodSource.fromStorageKey(key)

    @TypeConverter fun bloodPressureSourceToKey(value: BloodPressureSource): String = value.storageKey
    @TypeConverter fun keyToBloodPressureSource(key: String): BloodPressureSource = BloodPressureSource.fromStorageKey(key)

    @TypeConverter fun coachTopicToKey(value: CoachTopic): String = value.storageKey
    @TypeConverter fun keyToCoachTopic(key: String): CoachTopic = CoachTopic.fromStorageKey(key)

    @TypeConverter fun coachRoleToKey(value: CoachRole): String = value.storageKey
    @TypeConverter fun keyToCoachRole(key: String): CoachRole = CoachRole.fromStorageKey(key)
}
