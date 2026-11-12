package com.apex.athlete.core.data.takeout.parsers

import com.apex.athlete.core.data.model.DailyObservation
import com.apex.athlete.core.data.takeout.TakeoutTimestamps
import com.apex.athlete.core.domain.MetricType
import java.io.Reader

/** One value column of a daily summary file: the metric it feeds and the header names it may have. */
class DailyColumn(val metric: MetricType, vararg val aliases: String)

/** Shape of a one-row-per-day CSV: where the date is and which columns carry values. */
class DailyCsvSpec(val dateAliases: List<String>, val columns: List<DailyColumn>)

/**
 * Column names of the daily summary files. First alias: classic layout. Later aliases: Google
 * layout. All UNVERIFIED against a real archive; a file whose header has none of the names is
 * reported as a schema mismatch and nothing is read from it.
 */
object DailyCsvSpecs {
    private val DATE = listOf("timestamp", "date", "day")

    val HRV_DAILY = DailyCsvSpec(
        DATE,
        listOf(
            DailyColumn(MetricType.HRV_RMSSD, "rmssd", "daily_rmssd", "average_heart_rate_variability_milliseconds"),
            DailyColumn(
                MetricType.HRV_DEEP_SLEEP_RMSSD,
                "deep_rmssd",
                "deep_sleep_root_mean_square_of_successive_differences_milliseconds",
            ),
        ),
    )

    val RESPIRATORY_RATE = DailyCsvSpec(
        DATE,
        listOf(DailyColumn(MetricType.RESPIRATORY_RATE, "daily_respiratory_rate", "breaths_per_minute", "full_sleep_breathing_rate")),
    )

    val SPO2_DAILY = DailyCsvSpec(
        DATE,
        listOf(
            DailyColumn(MetricType.SPO2_AVG, "average_value", "average_percentage"),
            DailyColumn(MetricType.SPO2_LOWER_BOUND, "lower_bound", "lower_bound_percentage"),
            DailyColumn(MetricType.SPO2_UPPER_BOUND, "upper_bound", "upper_bound_percentage"),
        ),
    )

    val RESTING_HEART_RATE = DailyCsvSpec(
        DATE,
        listOf(DailyColumn(MetricType.RESTING_HEART_RATE, "beats_per_minute", "resting_heart_rate", "value")),
    )
}

/**
 * One-row-per-day summaries (nightly HRV, breathing rate, SpO2, resting heart rate).
 *
 * The timestamp of these files is a calendar-date label (often written `T00:00:00` or
 * `T00:00:00Z`), so only its date part is used, exactly as written. Passing it through a time zone
 * would move every value by a day for owners west or east of UTC.
 *
 * An empty cell or a zero means the source has no value for that day: nothing is stored. A cell
 * that is not a number quarantines the whole row.
 */
class DailyCsvParser(reader: Reader, private val spec: DailyCsvSpec) : CsvRowParser(reader) {
    private var dateColumn = -1
    private var valueColumns = IntArray(0)
    private val pending = ArrayList<DailyObservation>(4)

    override fun bind(): Boolean {
        dateColumn = csv.column(*spec.dateAliases.toTypedArray())
        valueColumns = IntArray(spec.columns.size) { csv.column(*spec.columns[it].aliases) }
        return dateColumn >= 0 && valueColumns.any { it >= 0 }
    }

    override fun row(out: TakeoutRowBuffer) {
        val day = TakeoutTimestamps.parse(csv.get(dateColumn))?.literalDate?.toEpochDay()
        if (day == null) {
            stats.quarantined++
            return
        }
        pending.clear()
        for (i in valueColumns.indices) {
            val cell = csv.get(valueColumns[i]) ?: continue
            val value = com.apex.athlete.core.data.takeout.TakeoutNumbers.parse(cell, csv.decimalComma)
            if (value == null) {
                stats.quarantined++
                return
            }
            if (value != 0.0) pending += DailyObservation(spec.columns[i].metric, day, value)
        }
        if (pending.isEmpty()) {
            stats.droppedEmpty++
            return
        }
        out.daily += pending
        stats.rowsEmitted += pending.size
    }
}

/**
 * Nightly skin temperature.
 *
 * Classic `Computed Temperature - YYYY-MM-DD.csv` has `sleep_end` and `nightly_temperature`;
 * the Google layout's `daily_sleep_temperature_derivations.csv` has `timestamp`,
 * `nightly temperature celsius` and `baseline temperature celsius` (all UNVERIFIED).
 *
 * The night belongs to the date written in the row (the wake-up date). Reports disagree on
 * whether the classic `nightly_temperature` is an absolute temperature or already the variation
 * from the personal baseline, and the two ranges cannot be confused, so the value decides:
 * 20 to 45 is an absolute skin temperature in °C, -10 to +10 is a deviation, anything else is
 * quarantined. A deviation is also stored when the row gives an absolute nightly value and an
 * absolute baseline; it is their difference, which is the definition of the metric, and it is
 * never estimated from anything else.
 */
class ComputedTemperatureCsvParser(reader: Reader) : CsvRowParser(reader) {
    private var dateColumn = -1
    private var nightlyColumn = -1
    private var baselineColumn = -1

    override fun bind(): Boolean {
        dateColumn = csv.column("sleep_end", "timestamp", "date")
        nightlyColumn = csv.column("nightly_temperature", "nightly_temperature_celsius")
        baselineColumn = csv.column("baseline_temperature_celsius", "baseline_temperature")
        return dateColumn >= 0 && nightlyColumn >= 0
    }

    override fun row(out: TakeoutRowBuffer) {
        val day = TakeoutTimestamps.parse(csv.get(dateColumn))?.literalDate?.toEpochDay()
        if (day == null) {
            stats.quarantined++
            return
        }
        if (csv.get(nightlyColumn) == null) {
            stats.droppedEmpty++
            return
        }
        val nightly = number(nightlyColumn)
        val baselineCell = csv.get(baselineColumn)
        val baseline = number(baselineColumn)
        if (nightly == null || (baselineCell != null && baseline == null)) {
            stats.quarantined++
            return
        }
        when {
            nightly in ABSOLUTE -> {
                out.daily += DailyObservation(MetricType.SKIN_TEMP_NIGHTLY, day, nightly)
                stats.rowsEmitted++
                if (baseline != null && baseline in ABSOLUTE) {
                    out.daily += DailyObservation(MetricType.SKIN_TEMP_DEVIATION, day, nightly - baseline)
                    stats.rowsEmitted++
                }
            }
            nightly in DEVIATION -> {
                out.daily += DailyObservation(MetricType.SKIN_TEMP_DEVIATION, day, nightly)
                stats.rowsEmitted++
            }
            else -> stats.quarantined++
        }
    }

    private companion object {
        val ABSOLUTE = 20.0..45.0
        val DEVIATION = -10.0..10.0
    }
}
