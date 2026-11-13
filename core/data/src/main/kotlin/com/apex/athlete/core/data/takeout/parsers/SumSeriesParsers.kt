package com.apex.athlete.core.data.takeout.parsers

import com.apex.athlete.core.data.model.SampleObservation
import com.apex.athlete.core.data.takeout.TakeoutClock
import com.apex.athlete.core.data.takeout.TakeoutNumbers
import com.apex.athlete.core.data.takeout.TakeoutTimestamps
import com.apex.athlete.core.domain.MetricType
import java.io.Reader
import java.util.TreeMap

/**
 * Series whose rows are amounts that add up over a day: steps, calories, distance, active zone
 * minutes, minutes per activity level. They arrive as many small rows (usually one per minute).
 * Rows are folded into fixed 15-minute buckets aligned to UTC and emitted as interval samples once
 * the whole file has been read:
 *
 * - 15 minutes divides every UTC offset in use, so any civil day is a whole number of buckets and a
 *   day total can later be summed for whichever zone the day is defined in;
 * - a bucket is written once, complete, so re-importing a file overwrites it with the same value
 *   (an upsert) instead of adding to it, and row order inside the file does not matter;
 * - memory is bounded by the number of buckets (96 per day), not by the number of rows.
 *
 * The importer never treats these samples as a day total by themselves; see `TakeoutZipImporter`
 * and [com.apex.athlete.core.data.takeout.TakeoutDayTotals] for when a daily value is written.
 *
 * [fillGapBuckets] is for series where silence means "nothing happened" and the export may leave
 * those rows out (steps): a stretch of at most that many empty buckets between two buckets of the
 * same file is emitted as zeros. A longer stretch is a band that was off, and stays missing.
 */
abstract class BucketedSumParser(private val fillGapBuckets: Int) : TakeoutEntryParser {
    final override val stats = TakeoutParseStats()
    private val buckets = LinkedHashMap<MetricType, TreeMap<Long, Double>>()
    private var bucketCount = 0
    private var drain: Drain? = null

    /** Consumes up to [maxSourceRows] rows, calling [add] for each. True while rows remain. */
    protected abstract fun parseSome(maxSourceRows: Int): Boolean

    protected fun add(metric: MetricType, epochMillis: Long, amount: Double) {
        val bucket = epochMillis - Math.floorMod(epochMillis, BUCKET_MS)
        val series = buckets.getOrPut(metric) { TreeMap() }
        val current = series[bucket]
        if (current == null && bucketCount >= MAX_BUCKETS) {
            stats.quarantined++
            return
        }
        if (current == null) bucketCount++
        series[bucket] = (current ?: 0.0) + amount
    }

    final override fun readInto(out: TakeoutRowBuffer, maxRows: Int): Boolean {
        var d = drain
        if (d == null) {
            if (parseSome(TakeoutParsers.SOURCE_ROWS_PER_CALL)) return true
            d = Drain()
            drain = d
        }
        while (out.size < maxRows) {
            val sample = d.next() ?: break
            out.samples += sample
            stats.rowsEmitted++
            stats.span(sample.epochMillis)
        }
        return d.hasNext()
    }

    /** Walks the buckets metric by metric, oldest first, inserting the zero buckets of short silent stretches. */
    private inner class Drain {
        private val metrics = buckets.keys.sortedBy { it.ordinal }.iterator()
        private var current: MetricType? = null
        private var entries: Iterator<Map.Entry<Long, Double>> = emptyList<Map.Entry<Long, Double>>().iterator()
        private var pending: Map.Entry<Long, Double>? = null
        private var last: Long? = null

        init {
            nextMetric()
        }

        private fun nextMetric() {
            while (pending == null && metrics.hasNext()) {
                val metric = metrics.next()
                current = metric
                entries = buckets.getValue(metric).entries.iterator()
                last = null
                pending = if (entries.hasNext()) entries.next() else null
            }
        }

        fun hasNext(): Boolean = pending != null

        fun next(): SampleObservation? {
            val p = pending ?: return null
            val metric = current!!
            val previous = last
            if (fillGapBuckets > 0 && previous != null) {
                val expected = previous + BUCKET_MS
                if (expected < p.key && (p.key - expected) / BUCKET_MS <= fillGapBuckets) {
                    last = expected
                    return SampleObservation(metric, expected, 0.0, expected + BUCKET_MS)
                }
            }
            last = p.key
            val sample = SampleObservation(metric, p.key, p.value, p.key + BUCKET_MS)
            pending = if (entries.hasNext()) entries.next() else null
            if (pending == null) nextMetric()
            return sample
        }
    }

    companion object {
        const val BUCKET_MS = 15L * 60 * 1000

        /** About 625 days of buckets (a few MB at most); a file claiming more is not one such file. */
        const val MAX_BUCKETS = 60_000

        /** Silence of up to 16 hours between two readings is a night; a day or more is a band that was off. */
        const val NIGHT_GAP_BUCKETS = 64
    }
}

/** What one summed series is, and what its rows may look like. */
class SumSeries(
    val metric: MetricType,
    /** Largest believable value of one row, in the metric's unit. A larger one is a parsing fault, not a reading. */
    val maxPerRow: Double,
    /** See [BucketedSumParser]; 0 means silence is never read as zero. */
    val zeroFillGapBuckets: Int = 0,
    /** Turns a cell of the file into the metric's unit. */
    val convert: (Double) -> Double = { it },
) {
    companion object {
        val STEPS = SumSeries(MetricType.STEPS, 200_000.0, BucketedSumParser.NIGHT_GAP_BUCKETS)
        val CALORIES_TOTAL = SumSeries(MetricType.CALORIES_TOTAL, 10_000.0)
        val CALORIES_ACTIVE = SumSeries(MetricType.CALORIES_ACTIVE, 10_000.0)
        val ACTIVE_ZONE_MINUTES = SumSeries(MetricType.ACTIVE_ZONE_MINUTES, 1_000.0)

        /** Classic `distance-*.json` is centimetres per minute (the one first-hand description; still UNVERIFIED). */
        val DISTANCE_FROM_CENTIMETRES = SumSeries(MetricType.DISTANCE, 100_000.0) { it / 100.0 }

        fun distance(convert: (Double) -> Double) = SumSeries(MetricType.DISTANCE, 100_000.0, convert = convert)
    }
}

/** Classic layout `[{"dateTime": "MM/dd/yy HH:mm:ss", "value": "12"}, ...]` (UNVERIFIED). */
open class SumSeriesJsonParser(reader: Reader, private val clock: TakeoutClock, private val series: SumSeries) :
    BucketedSumParser(series.zeroFillGapBuckets) {
    private val json = JsonTokenReader(reader)
    private var started = false

    override fun parseSome(maxSourceRows: Int): Boolean {
        try {
            if (!started) {
                started = true
                if (json.peek() != JsonTokenReader.Token.BEGIN_ARRAY) {
                    stats.schemaMismatch = true
                    return false
                }
                json.beginArray()
            }
            var budget = maxSourceRows
            while (budget-- > 0) {
                if (!json.hasNext()) return false
                element()
            }
            return true
        } catch (e: MalformedJsonException) {
            stats.abortedMidStream = true
            return false
        }
    }

    private fun element() {
        stats.rowsRead++
        if (json.peek() != JsonTokenReader.Token.BEGIN_OBJECT) {
            json.skipValue()
            stats.quarantined++
            return
        }
        var time: String? = null
        var value: Double? = null
        json.beginObject()
        while (json.hasNext()) {
            val name = json.nextName()
            when {
                name.equals("dateTime", true) || name.equals("timestamp", true) -> time = json.nextStringOrNull()
                name.equals("value", true) -> value = json.nextDoubleOrNull()
                name.equals("steps", true) && series.metric == MetricType.STEPS -> value = json.nextDoubleOrNull()
                else -> json.skipValue()
            }
        }
        json.endObject()
        val stamp = TakeoutTimestamps.parse(time)
        val amount = value?.let(series.convert)
        if (stamp == null || amount == null || !amount.isFinite() || amount < 0.0 || amount > series.maxPerRow) {
            stats.quarantined++
            return
        }
        add(series.metric, clock.toEpochMillis(stamp), amount)
    }
}

/** A column that carries the amount, and how its unit becomes the metric's. The first one present in the header is used. */
class SumColumn(val alias: String, val convert: (Double) -> Double = { it })

/**
 * One CSV row per reading, one amount column found by header name. A header that carries none of
 * the [columns] is a schema mismatch: nothing is read, and nothing is guessed (a bare `distance`
 * column could be any unit).
 */
open class SumSeriesCsvParser(
    reader: Reader,
    private val clock: TakeoutClock,
    private val metric: MetricType,
    private val maxPerRow: Double,
    fillGapBuckets: Int,
    private val columns: List<SumColumn>,
    /** An empty cell is "no value" and is counted as dropped; when false it is a bad row. */
    private val emptyIsNoValue: Boolean = true,
) : BucketedSumParser(fillGapBuckets) {
    private val csv = CsvStreamParser(reader)
    private val timeColumn = csv.column("timestamp", "date_time", "datetime", "time", "start_time")
    private val valueColumn: Int
    private val convert: (Double) -> Double

    init {
        var found = -1
        var how: (Double) -> Double = { it }
        for (c in columns) {
            val i = csv.column(c.alias)
            if (i >= 0) {
                found = i
                how = c.convert
                break
            }
        }
        valueColumn = found
        convert = how
    }

    override fun parseSome(maxSourceRows: Int): Boolean {
        if (csv.header.isEmpty()) return false
        if (timeColumn < 0 || valueColumn < 0) {
            stats.schemaMismatch = true
            return false
        }
        var budget = maxSourceRows
        while (budget-- > 0) {
            if (!csv.next()) return false
            stats.rowsRead++
            if (csv.oversized || csv.unterminatedQuote) {
                stats.quarantined++
                continue
            }
            val stamp = TakeoutTimestamps.parse(csv.get(timeColumn))
            val cell = csv.get(valueColumn)
            if (cell == null && emptyIsNoValue && stamp != null) {
                stats.droppedEmpty++
                continue
            }
            val amount = TakeoutNumbers.parse(cell, csv.decimalComma)?.let(convert)
            if (stamp == null || amount == null || !amount.isFinite() || amount < 0.0 || amount > maxPerRow) {
                stats.quarantined++
                continue
            }
            add(metric, clock.toEpochMillis(stamp), amount)
        }
        return true
    }
}

/**
 * Google layout `activity_level_YYYY-MM-DD.csv`: one row per minute, with the level it was spent
 * in (`timestamp`, `level`; UNVERIFIED). Each row is one minute on that level's metric. A level
 * that is not recognised quarantines the row; the name is never guessed.
 */
class ActivityLevelCsvParser(reader: Reader, private val clock: TakeoutClock) : BucketedSumParser(0) {
    private val csv = CsvStreamParser(reader)
    private val timeColumn = csv.column("timestamp", "date_time", "datetime", "time", "start_time")
    private val levelColumn = csv.column("level", "activity_level", "activity_level_type")

    override fun parseSome(maxSourceRows: Int): Boolean {
        if (csv.header.isEmpty()) return false
        if (timeColumn < 0 || levelColumn < 0) {
            stats.schemaMismatch = true
            return false
        }
        var budget = maxSourceRows
        while (budget-- > 0) {
            if (!csv.next()) return false
            stats.rowsRead++
            val stamp = if (csv.oversized || csv.unterminatedQuote) null else TakeoutTimestamps.parse(csv.get(timeColumn))
            val metric = levelMetric(csv.get(levelColumn))
            if (stamp == null || metric == null) {
                stats.quarantined++
                continue
            }
            add(metric, clock.toEpochMillis(stamp), 1.0)
        }
        return true
    }

    private fun levelMetric(text: String?): MetricType? {
        val level = text?.trim()?.lowercase() ?: return null
        return when {
            level.contains("sedentary") -> MetricType.SEDENTARY_MINUTES
            level.contains("light") -> MetricType.LIGHTLY_ACTIVE_MINUTES
            level.contains("moderate") -> MetricType.MODERATELY_ACTIVE_MINUTES
            level.contains("vigorous") || level.contains("very") -> MetricType.VERY_ACTIVE_MINUTES
            else -> null
        }
    }
}
