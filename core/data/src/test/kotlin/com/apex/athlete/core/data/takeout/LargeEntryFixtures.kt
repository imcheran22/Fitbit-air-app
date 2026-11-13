package com.apex.athlete.core.data.takeout

import com.apex.athlete.core.data.model.HealthBatch
import com.apex.athlete.core.data.model.IngestCounts
import java.io.InputStream
import java.io.PipedInputStream
import java.io.PipedOutputStream
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/**
 * A ZIP generated on the fly: the archive is never held in memory (a writer thread feeds a pipe),
 * so the importer under test is the only thing that could accumulate it. Every call of `open`
 * produces a fresh, identical stream, like re-opening a file.
 */
internal fun generatedHeartRateZip(rows: Int, padChars: Int, name: String = "Takeout/Fitbit/Global Export Data/heart_rate-2024-06-10.json"): TakeoutArchivePart {
    val pad = "x".repeat(padChars)
    return TakeoutArchivePart("generated.zip") {
        val input = PipedInputStream(64 * 1024)
        val output = PipedOutputStream(input)
        Thread {
            try {
                ZipOutputStream(output).use { zip ->
                    zip.putNextEntry(ZipEntry(name))
                    val w = zip.bufferedWriter(Charsets.UTF_8)
                    w.write("[")
                    val base = LocalDateTime.of(2024, 6, 10, 0, 0, 0).toEpochSecond(ZoneOffset.UTC)
                    for (i in 0 until rows) {
                        val t = LocalDateTime.ofEpochSecond(base + i, 0, ZoneOffset.UTC)
                        if (i > 0) w.write(",")
                        w.write(
                            "{\"dateTime\":\"%02d/%02d/%02d %02d:%02d:%02d\",\"value\":{\"bpm\":%d,\"confidence\":2},\"note\":\"%s\"}".format(
                                t.monthValue, t.dayOfMonth, t.year % 100, t.hour, t.minute, t.second, 55 + (i * 31) % 90, pad,
                            ),
                        )
                    }
                    w.write("]")
                    w.flush()
                    zip.closeEntry()
                }
            } catch (_: java.io.IOException) {
                // The reader went away (closed early or finished); nothing to do.
            }
        }.apply { isDaemon = true }.start()
        input as InputStream
    }
}

/** Keeps nothing: counts rows and the largest batch, so the only memory in play is the engine's own. */
internal class CountingSink : TakeoutSink {
    var rows = 0L
    var batches = 0
    var largestBatch = 0
    var outOfOrder = 0L
    private var lastMillis = Long.MIN_VALUE

    override var earliestAffectedDay: Long? = null
        private set

    override suspend fun write(batch: HealthBatch): IngestCounts {
        batches++
        rows += batch.rowCount()
        largestBatch = maxOf(largestBatch, batch.rowCount())
        for (p in batch.heartRate) {
            if (p.epochMillis <= lastMillis) outOfOrder++
            lastMillis = p.epochMillis
        }
        earliestAffectedDay = earliestAffectedDay ?: 19_000L
        return IngestCounts(heartRateMinutesWritten = batch.heartRate.size.toLong())
    }

    override suspend fun archiveBucketStats(metric: com.apex.athlete.core.domain.MetricType, fromMillis: Long, toMillis: Long) = TakeoutBucketStats(0, 0.0)
}

/** A ZIP with [files] small daily heart-rate files (one per civil day), generated on the fly like [generatedHeartRateZip]. */
internal fun generatedManyFilesZip(files: Int, rowsPerFile: Int): TakeoutArchivePart = TakeoutArchivePart("many.zip") {
    val input = PipedInputStream(64 * 1024)
    val output = PipedOutputStream(input)
    Thread {
        try {
            ZipOutputStream(output).use { zip ->
                for (f in 0 until files) {
                    val date = java.time.LocalDate.ofEpochDay(15_000L + f)
                    zip.putNextEntry(ZipEntry("Takeout/Fitbit/Global Export Data/heart_rate-$date.json"))
                    val w = zip.bufferedWriter(Charsets.UTF_8)
                    w.write("[")
                    for (i in 0 until rowsPerFile) {
                        if (i > 0) w.write(",")
                        w.write(
                            "{\"dateTime\":\"%02d/%02d/%02d 12:%02d:00\",\"value\":{\"bpm\":%d,\"confidence\":2}}".format(
                                date.monthValue, date.dayOfMonth, date.year % 100, i % 60, 55 + (i * 7) % 40,
                            ),
                        )
                    }
                    w.write("]")
                    w.flush()
                    zip.closeEntry()
                }
            }
        } catch (_: java.io.IOException) {
        }
    }.apply { isDaemon = true }.start()
    input as InputStream
}

/** One calories file of [rows] minute rows (UTC offset written, one row a minute from 2024-01-01), generated on the fly. */
internal fun generatedCaloriesZip(rows: Int): TakeoutArchivePart = TakeoutArchivePart("calories.zip") {
    val input = PipedInputStream(64 * 1024)
    val output = PipedOutputStream(input)
    Thread {
        try {
            ZipOutputStream(output).use { zip ->
                zip.putNextEntry(ZipEntry("Takeout/Fitbit/Global Export Data/calories-2024-01-01.json"))
                val w = zip.bufferedWriter(Charsets.UTF_8)
                w.write("[")
                val base = LocalDateTime.of(2024, 1, 1, 0, 0, 0).toEpochSecond(ZoneOffset.UTC)
                for (i in 0 until rows) {
                    val t = LocalDateTime.ofEpochSecond(base + i * 60L, 0, ZoneOffset.UTC)
                    if (i > 0) w.write(",")
                    w.write("{\"dateTime\":\"%02d/%02d/%02d %02d:%02d:00\",\"value\":\"1.5\"}".format(t.monthValue, t.dayOfMonth, t.year % 100, t.hour, t.minute))
                }
                w.write("]")
                w.flush()
                zip.closeEntry()
            }
        } catch (_: java.io.IOException) {
        }
    }.apply { isDaemon = true }.start()
    input as InputStream
}
