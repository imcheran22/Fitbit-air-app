package com.apex.athlete.core.database

import androidx.room.AutoMigration
import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import com.apex.athlete.core.database.dao.BehaviourDao
import com.apex.athlete.core.database.dao.BloodPressureDao
import com.apex.athlete.core.database.dao.BreatheSessionDao
import com.apex.athlete.core.database.dao.CoachChatDao
import com.apex.athlete.core.database.dao.DailyBiometricSummaryDao
import com.apex.athlete.core.database.dao.FoodLogDao
import com.apex.athlete.core.database.dao.GoalDao
import com.apex.athlete.core.database.dao.IntradayHeartRateDao
import com.apex.athlete.core.database.dao.MetricSampleDao
import com.apex.athlete.core.database.dao.QuickLogDao
import com.apex.athlete.core.database.dao.SleepDao
import com.apex.athlete.core.database.dao.SyncWatermarkDao
import com.apex.athlete.core.database.dao.TakeoutFileMarkDao
import com.apex.athlete.core.database.dao.WorkoutDao
import com.apex.athlete.core.database.entity.BehaviourDefEntity
import com.apex.athlete.core.database.entity.BehaviourEntryEntity
import com.apex.athlete.core.database.entity.BloodPressureReadingEntity
import com.apex.athlete.core.database.entity.BreatheSessionEntity
import com.apex.athlete.core.database.entity.CoachMessageEntity
import com.apex.athlete.core.database.entity.CoachThreadEntity
import com.apex.athlete.core.database.entity.DailyBiometricSummaryEntity
import com.apex.athlete.core.database.entity.FoodLogEntity
import com.apex.athlete.core.database.entity.GoalEntity
import com.apex.athlete.core.database.entity.IntradayHeartRateEntity
import com.apex.athlete.core.database.entity.MetricSampleEntity
import com.apex.athlete.core.database.entity.QuickLogEntity
import com.apex.athlete.core.database.entity.SleepSessionEntity
import com.apex.athlete.core.database.entity.SleepStageSegmentEntity
import com.apex.athlete.core.database.entity.SyncWatermarkEntity
import com.apex.athlete.core.database.entity.TakeoutFileMarkEntity
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
        TakeoutFileMarkEntity::class,
        BehaviourDefEntity::class,
        BehaviourEntryEntity::class,
        QuickLogEntity::class,
        GoalEntity::class,
        FoodLogEntity::class,
        BloodPressureReadingEntity::class,
        BreatheSessionEntity::class,
        CoachThreadEntity::class,
        CoachMessageEntity::class,
    ],
    version = 4,
    exportSchema = true,
    // v2: workout.perceivedExertion (nullable). Additive, so Room generates the migration.
    // v3: new table takeout_file_mark (per-file watermarks of the archive import). Additive as well.
    // v4: nine new local-only tables (behaviours, quick log, goals, food, blood pressure, breathing, coach chats). Additive.
    autoMigrations = [
        AutoMigration(from = 1, to = 2),
        AutoMigration(from = 2, to = 3),
        AutoMigration(from = 3, to = 4),
    ],
)
@TypeConverters(Converters::class)
abstract class ApexDatabase : RoomDatabase() {
    abstract fun dailyBiometricSummaryDao(): DailyBiometricSummaryDao
    abstract fun intradayHeartRateDao(): IntradayHeartRateDao
    abstract fun metricSampleDao(): MetricSampleDao
    abstract fun sleepDao(): SleepDao
    abstract fun workoutDao(): WorkoutDao
    abstract fun syncWatermarkDao(): SyncWatermarkDao
    abstract fun takeoutFileMarkDao(): TakeoutFileMarkDao
    abstract fun behaviourDao(): BehaviourDao
    abstract fun quickLogDao(): QuickLogDao
    abstract fun goalDao(): GoalDao
    abstract fun foodLogDao(): FoodLogDao
    abstract fun bloodPressureDao(): BloodPressureDao
    abstract fun breatheSessionDao(): BreatheSessionDao
    abstract fun coachChatDao(): CoachChatDao
}
