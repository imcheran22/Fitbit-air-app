package com.apex.athlete.core.data.takeout.parsers

import com.apex.athlete.core.data.model.SampleObservation
import com.apex.athlete.core.data.takeout.TakeoutClock
import com.apex.athlete.core.data.takeout.TakeoutTimestamps
import com.apex.athlete.core.domain.MetricType
import java.io.Reader
import java.util.TreeMap

/**
 * Steps arrive as many small counts (one per minute in the classic layout). They are folded into
 * fixed 15-minute buckets aligned to UTC and emitted as interval samples once the whole file has
 * been read:
 *
 * - 15 minutes divides every UTC offset in use, so any civil day is a whole number of buckets and
 *   a day total can later be summed for whichever zone the day is defined in;
 * - a bucket is written once, complete, so re-importing a file overwrites it with the same value
 *   (an upsert) instead of adding to it, and row order inside the file does not matter;
 * - memory is bounded by the number of buckets (96 per day), not by the number of rows.
 *
 * The importer never treats these samples as a day total by themselves; see
 * `TakeoutZipImporter` for how and when the daily value is written (only for civil days whose
 * every bucket is present).
 */
abstract class BucketedStepsParser : TakeoutEntryParser {
    final override val stats = TakeoutParseStats()
    private val buckets = TreeMap<Long, Double>()
    private var draining: Iterator<Map.Entry<Long, Double>>? = null

    /** Consumes up to [maxSourceRows] rows, calling [add] for each. True while rows remain. */
    protected abstract fun parseSome(maxSourceRows: Int): Boolean

    protected fun add(epochMillis: Long, steps: Double) {
        val bucket = epochMillis - Math.floorMod(epochMillis, BUCKET_MS)
        val current = buckets[bucket]
        if (current == null && buckets.size >= MAX_BUCKETS) {
            stats.quarantined++
            return
        }
        buckets[bucket] = (current ?: 0.0) + steps
    }

    final override fun readInto(out: TakeoutRowBuffer, maxRows: Int): Boolean {
        var iterator = draining
        if (iterator == null) {
            if (parseSome(TakeoutParsers.SOURCE_ROWS_PER_CALL)) return true
            iterator = buckets.entries.iterator()
            draining = iterator
        }
        while (out.size < maxRows && iterator.hasNext()) {
            val (start, steps) = iterator.next()
            out.samples += SampleObservation(MetricType.STEPS, start, steps, start + BUCKET_MS)
            stats.rowsEmitted++
            stats.span(start)
        }
        return iterator.hasNext()
    }

    companion object {
        const val BUCKET_MS = 15L * 60 * 1000

        /** About 625 days of buckets (a few MB at most); a file claiming more is not one steps file. */
        const val MAX_BUCKETS = 60_000
    }
}

/** Classic layout `steps-YYYY-MM-DD.json`: `[{"dateTime": "MM/dd/yy HH:mm:ss", "value": "12"}, ...]` (UNVERIFIED). */
class StepsJsonParser(reader: Reader, private val clock: TakeoutClock) : BucketedStepsParser() {
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
                name.equals("value", true) || name.equals("steps", true) -> value = json.nextDoubleOrNull()
                else -> json.skipValue()
            }
        }
        json.endObject()
        val stamp = TakeoutTimestamps.parse(time)
        val steps = value
        if (stamp == null || steps == null || steps < 0.0 || steps > MAX_STEPS_PER_ROW) {
            stats.quarantined++
            return
        }
        add(clock.toEpochMillis(stamp), steps)
    }
}

/** Google layout `steps_YYYY-MM-DD.csv` with `timestamp` and `steps` columns (UNVERIFIED). */
class StepsCsvParser(reader: Reader, private val clock: TakeoutClock) : BucketedStepsParser() {
    private val csv = CsvStreamParser(reader)
    private val timeColumn = csv.column("timestamp", "date_time", "datetime", "time")
    private val valueColumn = csv.column("steps", "value", "count")

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
            val stamp = if (csv.oversized || csv.unterminatedQuote) null else TakeoutTimestamps.parse(csv.get(timeColumn))
            val steps = com.apex.athlete.core.data.takeout.TakeoutNumbers.parse(csv.get(valueColumn), csv.decimalComma)
            if (stamp == null || steps == null || steps < 0.0 || steps > MAX_STEPS_PER_ROW) {
                stats.quarantined++
                continue
            }
            add(clock.toEpochMillis(stamp), steps)
        }
        return true
    }
}

/** More steps than anyone takes in a day; a single row above this is a parsing fault. */
private const val MAX_STEPS_PER_ROW = 200_000.0
