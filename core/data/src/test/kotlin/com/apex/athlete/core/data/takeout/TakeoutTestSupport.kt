package com.apex.athlete.core.data.takeout

import com.apex.athlete.core.data.model.DailyObservation
import com.apex.athlete.core.data.model.HealthBatch
import com.apex.athlete.core.data.model.IngestCounts
import com.apex.athlete.core.data.model.SleepObservation
import com.apex.athlete.core.data.model.WorkoutObservation
import com.apex.athlete.core.domain.MetricType
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.time.Instant
import java.time.ZoneId
import java.util.TreeMap
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/*
 * Test doubles and synthetic archives for the Takeout engine. Everything is generated here; no
 * personal data, no file from a real export. Values are arbitrary numbers.
 */

internal val NEW_YORK: ZoneId = ZoneId.of("America/New_York")

/** A fixed "now" far after every synthetic file, so the ingestor's future check never matters. */
internal const val NOW_MS = 1_900_000_000_000L

/** In-memory ZIP. Entries are DEFLATED without declared sizes, so they carry data descriptors (streamed-archive shape). */
internal fun zipOf(vararg entries: Pair<String, String>): ByteArray {
    val out = ByteArrayOutputStream()
    ZipOutputStream(out).use { zip ->
        for ((name, content) in entries) {
            zip.putNextEntry(ZipEntry(name))
            zip.write(content.toByteArray(Charsets.UTF_8))
            zip.closeEntry()
        }
    }
    return out.toByteArray()
}

internal fun partOf(bytes: ByteArray, name: String = "takeout-001.zip") = TakeoutArchivePart(name) { ByteArrayInputStream(bytes) }

internal fun config(zone: ZoneId = NEW_YORK) = TakeoutTimeConfig(localZone = zone)

/** `heart_rate-YYYY-MM-DD.json` content: [rows] are (local clock text, bpm, confidence). */
internal fun heartRateJson(rows: List<Triple<String, Int, Int?>>): String = buildString {
    append('[')
    rows.forEachIndexed { i, (time, bpm, confidence) ->
        if (i > 0) append(',')
        append("""{"dateTime":"$time","value":{"bpm":$bpm""")
        if (confidence != null) append(""","confidence":$confidence""")
        append("}}")
    }
    append(']')
}

internal const val HR_PATH = "Takeout/Fitbit/Global Export Data/heart_rate-"

/** Minute-spaced local clock texts for one civil day, `MM/dd/yy HH:mm:ss`, [count] rows from [startMinute]. */
internal fun clockTexts(mmddyy: String, count: Int, startMinute: Int = 0, stepSeconds: Int = 60): List<String> =
    (0 until count).map { i ->
        val total = startMinute * 60 + i * stepSeconds
        "%s %02d:%02d:%02d".format(mmddyy, total / 3600, (total / 60) % 60, total % 60)
    }

/**
 * Stand-in for the ingestor with the same idempotent keys: heart rate by instant, samples by
 * (metric, instant), daily values by (metric, day), sleeps and workouts by id. Counts every call.
 */
internal class MemorySink(private val zone: ZoneId = NEW_YORK) : TakeoutSink {
    val heartRate = TreeMap<Long, Int>()
    val samples = TreeMap<Pair<String, Long>, Double>(compareBy({ it.first }, { it.second }))
    val daily = TreeMap<Pair<String, Long>, Double>(compareBy({ it.first }, { it.second }))
    val sleeps = TreeMap<String, SleepObservation>()
    val workouts = TreeMap<String, WorkoutObservation>()

    var writeCalls = 0
        private set
    val batchSizes = ArrayList<Int>()
    var rowsDelivered = 0L
        private set

    /** Runs after a batch has been applied (committed) and before the importer moves the mark. */
    var afterApply: suspend (callIndex: Int) -> Unit = {}

    override var earliestAffectedDay: Long? = null
        private set

    /** The production sink is one ingestor session per run; its earliest-changed-day starts empty each run. */
    fun beginRun() {
        earliestAffectedDay = null
    }

    private fun touch(epochMillis: Long) {
        val day = Instant.ofEpochMilli(epochMillis).atZone(zone).toLocalDate().toEpochDay()
        earliestAffectedDay = minOf(earliestAffectedDay ?: day, day)
    }

    override suspend fun write(batch: HealthBatch): IngestCounts {
        writeCalls++
        batchSizes += batch.rowCount()
        rowsDelivered += batch.rowCount()
        for (p in batch.heartRate) { heartRate[p.epochMillis] = p.bpm; touch(p.epochMillis) }
        for (s in batch.samples) { samples[s.metric.storageKey to s.epochMillis] = s.value; touch(s.epochMillis) }
        for (d in batch.daily) {
            daily[d.metric.storageKey to d.epochDay] = d.value
            earliestAffectedDay = minOf(earliestAffectedDay ?: d.epochDay, d.epochDay)
        }
        for (s in batch.sleeps) { sleeps[s.id] = s; touch(s.endEpochMillis) }
        for (w in batch.workouts) { workouts[w.id] = w; touch(w.startEpochMillis) }
        val counts = IngestCounts(
            heartRateMinutesWritten = batch.heartRate.size.toLong(),
            dailyWritten = batch.daily.size.toLong(),
            samplesWritten = batch.samples.size.toLong(),
            sleepsWritten = batch.sleeps.size.toLong(),
            workoutsWritten = batch.workouts.size.toLong(),
        )
        afterApply(writeCalls)
        return counts
    }

    override suspend fun archiveBucketStats(metric: MetricType, fromMillis: Long, toMillis: Long): TakeoutBucketStats {
        val hits = samples.filterKeys { it.first == metric.storageKey && it.second >= fromMillis && it.second < toMillis }
        return TakeoutBucketStats(hits.size, hits.values.sum())
    }

    /** Everything stored, as comparable text, for "same state" assertions. */
    fun snapshot(): String = buildString {
        append("hr=").append(heartRate.toString()).append('\n')
        append("samples=").append(samples.toString()).append('\n')
        append("daily=").append(daily.toString()).append('\n')
        append("sleeps=").append(sleeps.toString()).append('\n')
        append("workouts=").append(workouts.toString())
    }

    val totalRows: Int get() = heartRate.size + samples.size + daily.size + sleeps.size + workouts.size
}

internal class MemoryMarks : TakeoutWatermarkStore {
    val marks = LinkedHashMap<Pair<TakeoutCategory, String>, TakeoutFileMark>()
    val categoryDays = HashMap<TakeoutCategory, Long>()
    val categorySignals = HashMap<TakeoutCategory, String>()
    var upserts = 0
        private set

    override suspend fun fileMarks(): List<TakeoutFileMark> = marks.values.toList()

    override suspend fun upsert(mark: TakeoutFileMark) {
        upserts++
        marks[mark.category to mark.fileKey] = mark
    }

    override suspend fun advanceCategory(category: TakeoutCategory, fileEpochDay: Long?, signal: String, nowMillis: Long) {
        if (fileEpochDay != null && fileEpochDay >= (categoryDays[category] ?: Long.MIN_VALUE)) {
            categoryDays[category] = fileEpochDay
            categorySignals[category] = signal
        }
    }

    override suspend fun pendingReplayFromDay(): Long? =
        marks.values.filter { it.replayPending }.mapNotNull { it.earliestAffectedEpochDay }.minOrNull()

    override suspend fun clearPendingReplay() {
        for ((key, m) in marks.entries.toList()) if (m.replayPending) marks[key] = m.copy(replayPending = false)
    }
}

internal class RecordingReplayer : TakeoutReplayer {
    val calls = ArrayList<Long>()
    var totalDays = 3

    override suspend fun replay(fromDay: Long, onProgress: suspend (done: Int, total: Int) -> Unit): Int {
        calls += fromDay
        for (i in 1..totalDays) onProgress(i, totalDays)
        return totalDays
    }
}

internal fun importer(
    sink: MemorySink,
    marks: MemoryMarks,
    replayer: RecordingReplayer,
    batchRows: Int = TakeoutZipImporter.BATCH_ROWS,
    time: TakeoutTimeConfig = config(),
) = TakeoutZipImporter(sink, marks, replayer, time, nowMillis = { NOW_MS }, batchRows = batchRows)

internal fun DailyObservation.key() = metric.storageKey to epochDay
