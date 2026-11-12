package com.apex.athlete.core.data.takeout.parsers

import com.apex.athlete.core.data.model.HeartRatePoint
import com.apex.athlete.core.data.takeout.TakeoutClock
import com.apex.athlete.core.data.takeout.TakeoutTimestamps
import java.io.Reader
import kotlin.math.roundToInt

/**
 * Classic layout `heart_rate-YYYY-MM-DD.json`: one array of
 * `{"dateTime": "MM/dd/yy HH:mm:ss", "value": {"bpm": 62, "confidence": 2}}`, a point every few
 * seconds (UNVERIFIED shape; see docs/OPEN_POINTS.md).
 *
 * Read with the streaming tokenizer, one element at a time, so a day of ticks or a 2 GB file costs
 * the same memory. Tolerances: `bpm` and `confidence` may also sit beside `dateTime`, `value` may
 * be the bare rate, numbers may be quoted, unknown fields are skipped.
 *
 * Points with `confidence <= 0` are the sensor saying it has no reading; they are dropped and
 * counted, never stored. A point without a confidence field is kept. Whether the rate is plausible
 * is decided once, in the ingestor.
 */
class HeartRateJsonStreamParser(reader: Reader, private val clock: TakeoutClock) : TakeoutEntryParser {
    override val stats = TakeoutParseStats()
    private val json = JsonTokenReader(reader)
    private var started = false
    private var done = false

    override fun readInto(out: TakeoutRowBuffer, maxRows: Int): Boolean {
        if (done) return false
        try {
            if (!started) {
                started = true
                if (json.peek() != JsonTokenReader.Token.BEGIN_ARRAY) {
                    stats.schemaMismatch = true
                    done = true
                    return false
                }
                json.beginArray()
            }
            var budget = TakeoutParsers.SOURCE_ROWS_PER_CALL
            while (out.size < maxRows && budget-- > 0) {
                if (!json.hasNext()) {
                    done = true
                    return false
                }
                element(out)
            }
            return true
        } catch (e: MalformedJsonException) {
            stats.abortedMidStream = true
            done = true
            return false
        }
    }

    private fun element(out: TakeoutRowBuffer) {
        stats.rowsRead++
        if (json.peek() != JsonTokenReader.Token.BEGIN_OBJECT) {
            json.skipValue()
            stats.quarantined++
            return
        }
        var time: String? = null
        var bpm: Double? = null
        var confidence: Double? = null
        json.beginObject()
        while (json.hasNext()) {
            val name = json.nextName()
            when {
                name.equals("dateTime", true) || name.equals("timestamp", true) -> time = json.nextStringOrNull()
                name.equals("bpm", true) -> bpm = json.nextDoubleOrNull()
                name.equals("confidence", true) -> confidence = json.nextDoubleOrNull()
                name.equals("value", true) -> {
                    if (json.peek() == JsonTokenReader.Token.BEGIN_OBJECT) {
                        json.beginObject()
                        while (json.hasNext()) {
                            val inner = json.nextName()
                            when {
                                inner.equals("bpm", true) -> bpm = json.nextDoubleOrNull()
                                inner.equals("confidence", true) -> confidence = json.nextDoubleOrNull()
                                else -> json.skipValue()
                            }
                        }
                        json.endObject()
                    } else {
                        bpm = json.nextDoubleOrNull()
                    }
                }
                else -> json.skipValue()
            }
        }
        json.endObject()

        val stamp = TakeoutTimestamps.parse(time)
        val rate = bpm
        if (stamp == null || rate == null) {
            stats.quarantined++
            return
        }
        val c = confidence
        if (c != null && c <= 0.0) {
            stats.droppedLowConfidence++
            return
        }
        val millis = clock.toEpochMillis(stamp)
        out.heartRate += HeartRatePoint(millis, rate.coerceIn(-1.0, 100_000.0).roundToInt())
        stats.rowsEmitted++
        stats.span(millis)
    }
}

/**
 * Google layout `heart_rate_YYYY-MM-DD.csv` with a `timestamp` column and a rate column
 * (`beats per minute`; UNVERIFIED). The same confidence rule applies if the file has a
 * `confidence` column; without one every parsable row is kept.
 */
class HeartRateCsvParser(reader: Reader, private val clock: TakeoutClock) : CsvRowParser(reader) {
    private var timeColumn = -1
    private var bpmColumn = -1
    private var confidenceColumn = -1

    override fun bind(): Boolean {
        timeColumn = csv.column("timestamp", "date_time", "datetime", "time")
        bpmColumn = csv.column("beats_per_minute", "bpm", "heart_rate", "value")
        confidenceColumn = csv.column("confidence")
        return timeColumn >= 0 && bpmColumn >= 0
    }

    override fun row(out: TakeoutRowBuffer) {
        val stamp = TakeoutTimestamps.parse(csv.get(timeColumn))
        val rate = number(bpmColumn)
        if (stamp == null || rate == null) {
            stats.quarantined++
            return
        }
        val confidence = number(confidenceColumn)
        if (confidence != null && confidence <= 0.0) {
            stats.droppedLowConfidence++
            return
        }
        val millis = clock.toEpochMillis(stamp)
        out.heartRate += HeartRatePoint(millis, rate.coerceIn(-1.0, 100_000.0).roundToInt())
        stats.rowsEmitted++
        stats.span(millis)
    }
}
