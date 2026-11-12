package com.apex.athlete.core.data.takeout.parsers

import com.apex.athlete.core.data.model.DailyObservation
import com.apex.athlete.core.data.takeout.TakeoutTimestamps
import com.apex.athlete.core.domain.MetricType
import java.io.Reader

/**
 * Classic layout `resting_heart_rate-YYYY-MM-DD.json`:
 * `[{"dateTime": "MM/dd/yy 00:00:00", "value": {"date": "MM/dd/yy", "value": 58.2, "error": 6.9}}]`
 * (UNVERIFIED). One value per civil day.
 *
 * The date is a calendar label and is used exactly as written (`value.date` first, else the date
 * part of `dateTime`); it is never moved through a time zone. A value of zero or a missing value
 * is the source's "not computed for this day" and is counted as empty, not stored.
 */
class RestingHeartRateJsonParser(reader: Reader) : TakeoutEntryParser {
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
        var outerTime: String? = null
        var innerDate: String? = null
        var value: Double? = null
        json.beginObject()
        while (json.hasNext()) {
            val name = json.nextName()
            when {
                name.equals("dateTime", true) || name.equals("timestamp", true) -> outerTime = json.nextStringOrNull()
                name.equals("value", true) -> {
                    if (json.peek() == JsonTokenReader.Token.BEGIN_OBJECT) {
                        json.beginObject()
                        while (json.hasNext()) {
                            val inner = json.nextName()
                            when {
                                inner.equals("date", true) -> innerDate = json.nextStringOrNull()
                                inner.equals("value", true) -> value = json.nextDoubleOrNull()
                                else -> json.skipValue()
                            }
                        }
                        json.endObject()
                    } else {
                        value = json.nextDoubleOrNull()
                    }
                }
                else -> json.skipValue()
            }
        }
        json.endObject()

        val v = value
        if (v == null || v <= 0.0) {
            stats.droppedEmpty++
            return
        }
        val date = (TakeoutTimestamps.parse(innerDate) ?: TakeoutTimestamps.parse(outerTime))?.literalDate
        if (date == null) {
            stats.quarantined++
            return
        }
        out.daily += DailyObservation(MetricType.RESTING_HEART_RATE, date.toEpochDay(), v)
        stats.rowsEmitted++
    }
}
