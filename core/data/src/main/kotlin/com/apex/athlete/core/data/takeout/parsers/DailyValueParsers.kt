package com.apex.athlete.core.data.takeout.parsers

import com.apex.athlete.core.data.model.DailyObservation
import com.apex.athlete.core.data.takeout.TakeoutClock
import com.apex.athlete.core.data.takeout.TakeoutNumbers
import com.apex.athlete.core.data.takeout.TakeoutTimestamps
import com.apex.athlete.core.domain.MetricType
import java.io.Reader
import java.time.Instant
import java.util.TreeMap

/**
 * Parsers whose rows fold into one value per civil day and are emitted once the whole file has been
 * read. The days held are a few hundred at most ([MAX_DAYS] is the hard cap), never the rows.
 */
abstract class DeferredDailyParser : TakeoutEntryParser {
    final override val stats = TakeoutParseStats()
    private var drain: Iterator<DailyObservation>? = null

    /** Consumes up to [maxSourceRows] rows. True while rows remain. */
    protected abstract fun parseSome(maxSourceRows: Int): Boolean

    /** Called once, after the last row: the observations to hand over, with the counters in [stats] updated. */
    protected abstract fun finish(): List<DailyObservation>

    final override fun readInto(out: TakeoutRowBuffer, maxRows: Int): Boolean {
        var it = drain
        if (it == null) {
            if (parseSome(TakeoutParsers.SOURCE_ROWS_PER_CALL)) return true
            it = finish().iterator()
            drain = it
        }
        while (out.size < maxRows && it.hasNext()) {
            out.daily += it.next()
            stats.rowsEmitted++
        }
        return it.hasNext()
    }

    companion object {
        /** About 55 years of days; a file with more distinct days is not one of these files. */
        const val MAX_DAYS = 20_000
    }
}

/**
 * Classic `sedentary_minutes-`, `lightly_active_minutes-`, `moderately_active_minutes-` and
 * `very_active_minutes-YYYY-MM-DD.json`: `[{"dateTime": "MM/dd/yy HH:mm:ss", "value": "20"}, ...]`
 * (UNVERIFIED). One entry per day carries that day's minutes; if the export writes one entry per
 * minute instead (0 or 1), summing per day gives the same answer, so both are read the same way.
 *
 * The day is the date as written (a calendar-date label, never shifted through a zone). A day whose
 * total is zero has no value: nothing is stored, like the other daily files. When any day has more
 * than one entry the file is taken to be intraday, and then its first and last day are not stored,
 * because the file may begin after, or end before, midnight and a partial sum must not stand for the day.
 */
class ActiveMinutesJsonParser(reader: Reader, private val metric: MetricType) : DeferredDailyParser() {
    private val json = JsonTokenReader(reader)
    private var started = false

    /** day to (sum of the day's entries, number of entries) */
    private val days = TreeMap<Long, DoubleArray>()

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
            when (json.nextName().lowercase()) {
                "datetime", "timestamp" -> time = json.nextStringOrNull()
                "value" -> value = json.nextDoubleOrNull()
                else -> json.skipValue()
            }
        }
        json.endObject()
        val day = TakeoutTimestamps.parse(time)?.literalDate?.toEpochDay()
        val minutes = value
        if (day == null || minutes == null || minutes < 0.0 || minutes > MINUTES_PER_DAY) {
            stats.quarantined++
            return
        }
        val entry = days[day]
        if (entry == null && days.size >= MAX_DAYS) {
            stats.quarantined++
            return
        }
        val acc = entry ?: DoubleArray(2).also { days[day] = it }
        acc[0] += minutes
        acc[1] += 1.0
    }

    override fun finish(): List<DailyObservation> {
        val intraday = days.values.any { it[1] > 1.0 }
        if (intraday && days.isNotEmpty()) {
            days.remove(days.firstKey())?.let { stats.droppedEmpty++ }
            if (days.isNotEmpty()) days.remove(days.lastKey())?.let { stats.droppedEmpty++ }
        }
        val out = ArrayList<DailyObservation>(days.size)
        for ((day, acc) in days) {
            when {
                acc[0] <= 0.0 -> stats.droppedEmpty++
                acc[0] > MINUTES_PER_DAY -> stats.quarantined++
                else -> {
                    out += DailyObservation(metric, day, acc[0])
                    stats.span(day * DAY_MS)
                }
            }
        }
        return out
    }

    private companion object {
        const val MINUTES_PER_DAY = 1_440.0
        const val DAY_MS = 24L * 60 * 60 * 1000
    }
}

/**
 * Classic `demographic_vo2_max-YYYY-MM-DD.json`: `[{"dateTime": ..., "value": {"demographicVO2Max": 42.5,
 * "demographicVO2MaxError": 2.0, "filteredDemographicVO2Max": 42.1, ...}}, ...]` (UNVERIFIED; the nested
 * shape is the one first-hand description in the reference repos). The value is `demographicVO2Max`, or the
 * filtered one when that is absent. Fitbit's figure is a model estimate (a "cardio fitness score"), and the
 * file does not say how it was derived, so no label beyond the archive's own provenance is added.
 * Zero means "no estimate" and is not stored.
 */
class Vo2MaxJsonParser(reader: Reader) : TakeoutEntryParser {
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
                stats.rowsRead++
                val record = json.readTree().asObject()
                val day = record?.let { TakeoutTimestamps.parse(it.text("dateTime") ?: it.text("timestamp"))?.literalDate?.toEpochDay() }
                if (record == null || day == null) {
                    stats.quarantined++
                    continue
                }
                val nested = record["value"].asObject()
                val value = nested?.number("demographicVO2Max") ?: nested?.number("filteredDemographicVO2Max") ?: record.number("value")
                if (value == null) {
                    stats.quarantined++
                } else if (value <= 0.0) {
                    stats.droppedEmpty++
                } else {
                    out.daily += DailyObservation(MetricType.VO2_MAX, day, value)
                    stats.rowsEmitted++
                    stats.span(day * 24L * 60 * 60 * 1000)
                }
            }
            return true
        } catch (e: MalformedJsonException) {
            stats.abortedMidStream = true
            done = true
            return false
        }
    }
}

/**
 * Google layout `weight.csv`: one row per weigh-in with an instant (`timestamp`) and the weight in a
 * column whose name states the unit (`weight_grams`, `weight_kilograms`, `weight_kg`, `weight_pounds`;
 * UNVERIFIED). A bare `weight` column could be kilograms or pounds and is not read. The value stored for
 * a civil day (in the local zone) is the last weigh-in of that day, in kilograms.
 */
class WeightCsvParser(reader: Reader, private val clock: TakeoutClock) : DeferredDailyParser() {
    private val csv = CsvStreamParser(reader)
    private val timeColumn = csv.column("timestamp", "date_time", "datetime", "time")
    private val valueColumn: Int
    private val toKilograms: (Double) -> Double

    /** day to (instant of the latest weigh-in, kilograms) */
    private val latest = TreeMap<Long, Pair<Long, Double>>()

    init {
        val options = listOf<Pair<String, (Double) -> Double>>(
            "weight_grams" to { it / 1000.0 },
            "weight_kilograms" to { it },
            "weight_kg" to { it },
            "weight_pounds" to { it * KG_PER_POUND },
            "weight_lbs" to { it * KG_PER_POUND },
        )
        var found = -1
        var how: (Double) -> Double = { it }
        for ((alias, convert) in options) {
            val i = csv.column(alias)
            if (i >= 0) {
                found = i
                how = convert
                break
            }
        }
        valueColumn = found
        toKilograms = how
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
            val stamp = if (csv.oversized || csv.unterminatedQuote) null else TakeoutTimestamps.parse(csv.get(timeColumn))
            val cell = csv.get(valueColumn)
            if (cell == null && stamp != null) {
                stats.droppedEmpty++
                continue
            }
            val kg = TakeoutNumbers.parse(cell, csv.decimalComma)?.let(toKilograms)
            if (stamp == null || kg == null || !kg.isFinite() || kg <= 0.0) {
                stats.quarantined++
                continue
            }
            val instant = clock.toEpochMillis(stamp)
            val day = Instant.ofEpochMilli(instant).atZone(clock.localZone).toLocalDate().toEpochDay()
            val existing = latest[day]
            if (existing == null && latest.size >= MAX_DAYS) {
                stats.quarantined++
                continue
            }
            if (existing == null || instant >= existing.first) latest[day] = instant to kg
        }
        return true
    }

    override fun finish(): List<DailyObservation> {
        val out = ArrayList<DailyObservation>(latest.size)
        for ((day, reading) in latest) {
            out += DailyObservation(MetricType.WEIGHT, day, reading.second)
            stats.span(reading.first)
        }
        return out
    }

    private companion object {
        const val KG_PER_POUND = 0.45359237
    }
}
