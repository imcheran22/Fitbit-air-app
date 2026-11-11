package com.apex.athlete.core.database.entity

import androidx.room.Entity
import com.apex.athlete.core.domain.SyncSource
import com.apex.athlete.core.domain.SyncStatus

/**
 * How far one data stream of one source has been ingested.
 *
 * The app may go hours or days without a sync (phone Bluetooth off, tracker out of range). The
 * next sync does not ask "what happened today?"; it asks each stream for everything after
 * [lastSyncedEpochMillis], in bounded windows, and moves the watermark forward only after a
 * window has been written to the database. An interrupted sync therefore resumes where it
 * stopped instead of starting over or leaving a hole.
 */
@Entity(tableName = "sync_watermark", primaryKeys = ["source", "stream"])
data class SyncWatermarkEntity(
    val source: SyncSource,
    /** Stream identifier within the source, e.g. the API data type "heart-rate". */
    val stream: String,
    /** Everything up to this instant has been ingested. 0 means the stream has never synced. */
    val lastSyncedEpochMillis: Long = 0L,
    /** Oldest instant covered by historical backfill; null until a backfill has run. */
    val backfillFloorEpochMillis: Long? = null,
    /** Opaque continuation token for sources that provide one (Health Connect change tokens). */
    val cursorToken: String? = null,
    val lastAttemptEpochMillis: Long? = null,
    val lastSuccessEpochMillis: Long? = null,
    val status: SyncStatus = SyncStatus.NEVER_SYNCED,
    val lastError: String? = null,
    val consecutiveFailures: Int = 0,
)
