package com.apex.athlete.core.data.takeout.parsers

import com.apex.athlete.core.data.model.SampleObservation
import com.apex.athlete.core.data.takeout.TakeoutClock
import com.apex.athlete.core.data.takeout.TakeoutTimestamps
import com.apex.athlete.core.domain.MetricType
import java.io.Reader

/**
 * `Heart Rate Variability Details - YYYY-MM-DD.csv`: five-minute windows during sleep with
 * `timestamp`, `rmssd`, `coverage`, `low_frequency`, `high_frequency` (UNVERIFIED).
 *
 * Each window becomes one RMSSD sample covering five minutes. `coverage` is the share of the
 * window with usable beats: a window with no coverage is the sensor saying it has no reading, so
 * it is dropped and counted like a zero-confidence heart-rate point. The frequency-domain columns
 * are stored as raw samples of their own metrics when present and positive (unit UNVERIFIED);
 * a missing or unparsable LF/HF cell never affects the RMSSD sample.
 */
class HrvDetailsCsvParser(reader: Reader, private val clock: TakeoutClock) : CsvRowParser(reader) {
    private var timeColumn = -1
    private var rmssdColumn = -1
    private var coverageColumn = -1
    private var lowColumn = -1
    private var highColumn = -1

    override fun bind(): Boolean {
        timeColumn = csv.column("timestamp", "date_time", "time")
        rmssdColumn = csv.column("rmssd", "root_mean_square_of_successive_differences_milliseconds")
        coverageColumn = csv.column("coverage")
        lowColumn = csv.column("low_frequency", "lf")
        highColumn = csv.column("high_frequency", "hf")
        return timeColumn >= 0 && rmssdColumn >= 0
    }

    override fun row(out: TakeoutRowBuffer) {
        val stamp = TakeoutTimestamps.parse(csv.get(timeColumn))
        val cell = csv.get(rmssdColumn)
        val rmssd = number(rmssdColumn)
        if (stamp == null || (cell != null && rmssd == null)) {
            stats.quarantined++
            return
        }
        if (rmssd == null || rmssd <= 0.0) {
            stats.droppedEmpty++
            return
        }
        val coverage = number(coverageColumn)
        if (coverage != null && coverage <= 0.0) {
            stats.droppedLowConfidence++
            return
        }
        val millis = clock.toEpochMillis(stamp)
        out.samples += SampleObservation(MetricType.HRV_RMSSD, millis, rmssd, millis + WINDOW_MS)
        stats.rowsEmitted++
        number(lowColumn)?.takeIf { it > 0.0 }?.let {
            out.samples += SampleObservation(MetricType.HRV_LOW_FREQUENCY, millis, it, millis + WINDOW_MS)
            stats.rowsEmitted++
        }
        number(highColumn)?.takeIf { it > 0.0 }?.let {
            out.samples += SampleObservation(MetricType.HRV_HIGH_FREQUENCY, millis, it, millis + WINDOW_MS)
            stats.rowsEmitted++
        }
        stats.span(millis)
    }

    private companion object {
        const val WINDOW_MS = 5L * 60 * 1000
    }
}
