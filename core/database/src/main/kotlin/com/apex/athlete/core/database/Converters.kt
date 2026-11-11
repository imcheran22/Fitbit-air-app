package com.apex.athlete.core.database

import androidx.room.TypeConverter
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
}
