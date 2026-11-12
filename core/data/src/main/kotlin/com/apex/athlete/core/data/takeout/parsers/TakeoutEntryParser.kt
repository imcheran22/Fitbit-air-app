package com.apex.athlete.core.data.takeout.parsers

import com.apex.athlete.core.data.model.DailyObservation
import com.apex.athlete.core.data.model.HealthBatch
import com.apex.athlete.core.data.model.HeartRatePoint
import com.apex.athlete.core.data.model.SampleObservation
import com.apex.athlete.core.data.model.SleepObservation
import com.apex.athlete.core.data.model.WorkoutObservation
import com.apex.athlete.core.data.takeout.TakeoutCategory
import com.apex.athlete.core.data.takeout.TakeoutClock
import com.apex.athlete.core.data.takeout.TakeoutFormat
import com.apex.athlete.core.data.takeout.TakeoutRoute
import com.apex.athlete.core.data.takeout.TakeoutTimeConfig
import com.apex.athlete.core.domain.DataProvenance
import java.io.InputStream
import java.io.InputStreamReader
import java.io.Reader

/** Rows waiting to be written. The importer flushes it whenever it holds a full batch. */
class TakeoutRowBuffer {
    val heartRate = ArrayList<HeartRatePoint>()
    val samples = ArrayList<SampleObservation>()
    val daily = ArrayList<DailyObservation>()
    val sleeps = ArrayList<SleepObservation>()
    val workouts = ArrayList<WorkoutObservation>()

    val size: Int get() = heartRate.size + samples.size + daily.size + sleeps.size + workouts.size

    fun clear() {
        heartRate.clear()
        samples.clear()
        daily.clear()
        sleeps.clear()
        workouts.clear()
    }

    /** Removes and returns the first [maxRows] rows (heart rate first, then samples, daily values, sleeps, workouts). */
    fun drain(maxRows: Int = Int.MAX_VALUE): HealthBatch {
        var room = maxRows
        fun <T> take(list: ArrayList<T>): List<T> {
            val n = minOf(room, list.size)
            if (n == 0) return emptyList()
            room -= n
            val head = ArrayList(list.subList(0, n))
            list.subList(0, n).clear()
            return head
        }
        return HealthBatch(
            provenance = DataProvenance.IMPORTED_FILE_ARCHIVE,
            heartRate = take(heartRate),
            samples = take(samples),
            daily = take(daily),
            sleeps = take(sleeps),
            workouts = take(workouts),
        )
    }

    /**
     * Like [drain], but when the batch would end inside a minute of heart rate, the points of that
     * last minute stay in the buffer for the next batch. A minute is then never split across two
     * batches as long as the file is in time order. This matters because the ingestor compares a
     * minute's sample count with what is already stored: half a minute would lose that comparison
     * to an equally fine copy from another source.
     */
    fun drainKeepingOpenMinute(maxRows: Int): HealthBatch {
        if (heartRate.size != size || heartRate.size < 2) return drain(maxRows)
        val end = minOf(maxRows, heartRate.size)
        val lastMinute = Math.floorDiv(heartRate[end - 1].epochMillis, MINUTE_MS)
        var keepFrom = end - 1
        while (keepFrom > 0 && Math.floorDiv(heartRate[keepFrom - 1].epochMillis, MINUTE_MS) == lastMinute) keepFrom--
        return drain(if (keepFrom == 0) end else keepFrom)
    }

    private companion object {
        const val MINUTE_MS = 60_000L
    }
}

/** What a parser did with one file. Counts and a time span only, never values. */
class TakeoutParseStats {
    /** Rows or array elements met in the file. */
    var rowsRead = 0L

    /** Observations handed to the importer. Several rows may fold into one (step buckets). */
    var rowsEmitted = 0L

    /** Heart-rate points with `confidence <= 0`, HRV windows with no coverage. */
    var droppedLowConfidence = 0L

    /** Rows that carry no value (the source's placeholder for "nothing measured"). */
    var droppedEmpty = 0L

    /** Rows that could not be understood: bad timestamp, bad number, wrong shape. */
    var quarantined = 0L

    /** The file stopped being valid part-way; rows before that point were kept. */
    var abortedMidStream = false

    /** The file's header or root does not have the expected shape; nothing was read from it. */
    var schemaMismatch = false

    /** Earliest and latest instant among the emitted rows that have one. */
    var firstEpochMillis: Long? = null
    var lastEpochMillis: Long? = null

    internal var clock: TakeoutClock? = null

    /** Rows whose timestamp carried no offset, i.e. that depended on the configured zone rule. */
    val zoneRuleRows: Long get() = clock?.ruleApplied ?: 0L

    internal fun span(epochMillis: Long) {
        val first = firstEpochMillis
        if (first == null || epochMillis < first) firstEpochMillis = epochMillis
        val last = lastEpochMillis
        if (last == null || epochMillis > last) lastEpochMillis = epochMillis
    }
}

/**
 * Reads one archive entry incrementally. The importer calls [readInto] until it returns false and
 * writes the buffer between calls, so no parser ever holds more than one batch of rows.
 *
 * A parser never throws for bad content: it counts, quarantines and carries on, or sets
 * [TakeoutParseStats.abortedMidStream] when the rest of the file cannot be trusted. I/O errors
 * from the underlying stream (a truncated archive) are not content errors and do propagate.
 */
interface TakeoutEntryParser {
    val stats: TakeoutParseStats

    /**
     * Parses until [out] holds [maxRows] rows or the entry ends. Returns false once the entry is
     * exhausted. May return true without adding rows (for example while dropping a long run of
     * low-confidence points) so the caller can check for cancellation.
     */
    fun readInto(out: TakeoutRowBuffer, maxRows: Int): Boolean
}

/** Chooses the parser for a routed entry. */
object TakeoutParsers {

    fun open(route: TakeoutRoute, input: InputStream, time: TakeoutTimeConfig): TakeoutEntryParser {
        val reader: Reader = InputStreamReader(input, Charsets.UTF_8)
        val clock = TakeoutClock(time.ruleFor(route), time.localZone)
        val parser: TakeoutEntryParser = when (route.category) {
            TakeoutCategory.HEART_RATE ->
                if (route.format == TakeoutFormat.JSON) HeartRateJsonStreamParser(reader, clock) else HeartRateCsvParser(reader, clock)
            TakeoutCategory.STEPS ->
                if (route.format == TakeoutFormat.JSON) StepsJsonParser(reader, clock) else StepsCsvParser(reader, clock)
            TakeoutCategory.RESTING_HEART_RATE ->
                if (route.format == TakeoutFormat.JSON) RestingHeartRateJsonParser(reader) else DailyCsvParser(reader, DailyCsvSpecs.RESTING_HEART_RATE)
            TakeoutCategory.SLEEP -> SleepJsonParser(reader, clock)
            TakeoutCategory.EXERCISE -> ExerciseJsonParser(reader, clock)
            TakeoutCategory.HRV_DETAILS -> HrvDetailsCsvParser(reader, clock)
            TakeoutCategory.HRV_DAILY -> DailyCsvParser(reader, DailyCsvSpecs.HRV_DAILY)
            TakeoutCategory.SPO2_MINUTE -> MinuteSpo2CsvParser(reader, clock)
            TakeoutCategory.SPO2_DAILY -> DailyCsvParser(reader, DailyCsvSpecs.SPO2_DAILY)
            TakeoutCategory.RESPIRATORY_RATE -> DailyCsvParser(reader, DailyCsvSpecs.RESPIRATORY_RATE)
            TakeoutCategory.DEVICE_TEMPERATURE -> DeviceTemperatureCsvParser(reader, clock)
            TakeoutCategory.COMPUTED_TEMPERATURE -> ComputedTemperatureCsvParser(reader)
        }
        parser.stats.clock = clock
        return parser
    }

    /** Source rows a parser may consume in one [TakeoutEntryParser.readInto] call before handing control back. */
    internal const val SOURCE_ROWS_PER_CALL = 20_000
}

/**
 * Shared loop for CSV files with one observation (or a few) per row. Subclasses bind their columns
 * once and then turn each record into rows.
 */
abstract class CsvRowParser(reader: Reader) : TakeoutEntryParser {
    override val stats = TakeoutParseStats()
    protected val csv = CsvStreamParser(reader)
    private var bound = false
    private var done = false

    /** Looks up the columns this parser needs. False when a required column is missing. */
    protected abstract fun bind(): Boolean

    /** Handles the current record of [csv]. */
    protected abstract fun row(out: TakeoutRowBuffer)

    final override fun readInto(out: TakeoutRowBuffer, maxRows: Int): Boolean {
        if (done) return false
        if (!bound) {
            bound = true
            if (csv.header.isEmpty()) {
                done = true
                return false
            }
            if (!bind()) {
                stats.schemaMismatch = true
                done = true
                return false
            }
        }
        var budget = TakeoutParsers.SOURCE_ROWS_PER_CALL
        while (out.size < maxRows && budget-- > 0) {
            if (!csv.next()) {
                done = true
                return false
            }
            stats.rowsRead++
            if (csv.oversized || csv.unterminatedQuote) {
                stats.quarantined++
                continue
            }
            row(out)
        }
        return true
    }

    protected fun number(column: Int): Double? = com.apex.athlete.core.data.takeout.TakeoutNumbers.parse(csv.get(column), csv.decimalComma)
}
