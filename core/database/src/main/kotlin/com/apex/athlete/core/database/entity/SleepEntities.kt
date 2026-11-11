package com.apex.athlete.core.database.entity

import androidx.room.Embedded
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.Relation
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.SleepStage

/** One sleep session (a night's main sleep or a nap) as reported by a source. */
@Entity(
    tableName = "sleep_session",
    indices = [Index("epochDay"), Index("startEpochMillis")],
)
data class SleepSessionEntity(
    /** Source-scoped identifier, e.g. "ghealth:<data point name>" or "hc:<record id>". */
    @PrimaryKey val id: String,
    val startEpochMillis: Long,
    val endEpochMillis: Long,
    /** Local UTC offset at the start and end, so clock times survive travel and DST changes. */
    val startZoneOffsetSeconds: Int,
    val endZoneOffsetSeconds: Int,
    /** Local calendar day on which the session ended: the day the sleep "belongs" to. */
    val epochDay: Long,
    val isMainSleep: Boolean,
    val isNap: Boolean,
    /** True when the source scored sleep stages; false for movement-only ("classic") sessions. */
    val hasStages: Boolean,
    val minutesAsleep: Int,
    val minutesAwake: Int,
    val minutesInBed: Int,
    val minutesToFallAsleep: Int? = null,
    val minutesDeep: Int? = null,
    val minutesRem: Int? = null,
    val minutesLight: Int? = null,
    /** Awakenings longer than three minutes, counted from the hypnogram on ingestion. */
    val wakeBoutsOverThreeMinutes: Int? = null,
    val provenance: DataProvenance,
    val updatedAtEpochMillis: Long,
)

/** One contiguous block of a single sleep stage inside a session (a hypnogram segment). */
@Entity(
    tableName = "sleep_stage_segment",
    primaryKeys = ["sessionId", "startEpochMillis"],
    foreignKeys = [
        ForeignKey(
            entity = SleepSessionEntity::class,
            parentColumns = ["id"],
            childColumns = ["sessionId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
)
data class SleepStageSegmentEntity(
    val sessionId: String,
    val startEpochMillis: Long,
    val endEpochMillis: Long,
    val stage: SleepStage,
)

data class SleepSessionWithStages(
    @Embedded val session: SleepSessionEntity,
    @Relation(parentColumn = "id", entityColumn = "sessionId")
    val stages: List<SleepStageSegmentEntity>,
)
