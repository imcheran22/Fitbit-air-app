package com.apex.athlete.core.database

import androidx.room.AutoMigration
import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import com.apex.athlete.core.database.dao.DailyBiometricSummaryDao
import com.apex.athlete.core.database.dao.IntradayHeartRateDao
import com.apex.athlete.core.database.dao.MetricSampleDao
import com.apex.athlete.core.database.dao.SleepDao
import com.apex.athlete.core.database.dao.SyncWatermarkDao
import com.apex.athlete.core.database.dao.WorkoutDao
import com.apex.athlete.core.database.entity.DailyBiometricSummaryEntity
import com.apex.athlete.core.database.entity.IntradayHeartRateEntity
import com.apex.athlete.core.database.entity.MetricSampleEntity
import com.apex.athlete.core.database.entity.SleepSessionEntity
import com.apex.athlete.core.database.entity.SleepStageSegmentEntity
import com.apex.athlete.core.database.entity.SyncWatermarkEntity
import com.apex.athlete.core.database.entity.WorkoutEntity

@Database(
    entities = [
        DailyBiometricSummaryEntity::class,
        IntradayHeartRateEntity::class,
        MetricSampleEntity::class,
        SleepSessionEntity::class,
        SleepStageSegmentEntity::class,
        WorkoutEntity::class,
        SyncWatermarkEntity::class,
    ],
    version = 2,
    exportSchema = true,
    // v2: workout.perceivedExertion (nullable). Additive, so Room generates the migration.
    autoMigrations = [AutoMigration(from = 1, to = 2)],
)
@TypeConverters(Converters::class)
abstract class ApexDatabase : RoomDatabase() {
    abstract fun dailyBiometricSummaryDao(): DailyBiometricSummaryDao
    abstract fun intradayHeartRateDao(): IntradayHeartRateDao
    abstract fun metricSampleDao(): MetricSampleDao
    abstract fun sleepDao(): SleepDao
    abstract fun workoutDao(): WorkoutDao
    abstract fun syncWatermarkDao(): SyncWatermarkDao
}
