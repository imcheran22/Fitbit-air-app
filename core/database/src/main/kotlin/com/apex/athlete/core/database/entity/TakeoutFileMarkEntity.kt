package com.apex.athlete.core.database.entity

import androidx.room.Entity

/**
 * Import state of one file of a Google Takeout archive (schema v3).
 *
 * The change signal of a file is (category, file name, uncompressed size, CRC-32 of the
 * uncompressed bytes), all computed while streaming. A file whose signal matches a [complete] row
 * is not parsed again; a row that is not complete means an import of that file was interrupted
 * and the file is read again from its start (writes are idempotent upserts, so this cannot double
 * count). [committedRows] only moves forward after a batch has been committed.
 *
 * [replayPending] stays true until a chronological recomputation starting at or before
 * [earliestAffectedEpochDay] has finished, so a recomputation interrupted by process death is
 * resumed by the next import run.
 *
 * Holds no health values and no part of the picked file's name or location beyond the whitelisted
 * file name (a data type and a date).
 */
@Entity(tableName = "takeout_file_mark", primaryKeys = ["category", "fileKey"])
data class TakeoutFileMarkEntity(
    /** Stable key of the file family, e.g. `heart_rate`. */
    val category: String,
    /** Lower-cased file name, e.g. `heart_rate-2024-03-31.json`. */
    val fileKey: String,
    val fileEpochDay: Long?,
    val sizeBytes: Long,
    val crc32: Long,
    val complete: Boolean,
    val committedRows: Long,
    val rowsDropped: Long,
    val rowsQuarantined: Long,
    val earliestAffectedEpochDay: Long?,
    val replayPending: Boolean,
    val importedAtEpochMillis: Long,
)
