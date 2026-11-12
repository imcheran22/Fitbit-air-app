package com.apex.athlete.core.data.takeout.parsers

import com.apex.athlete.core.data.model.SampleObservation
import com.apex.athlete.core.data.takeout.TakeoutClock
import com.apex.athlete.core.data.takeout.TakeoutTimestamps
import com.apex.athlete.core.domain.MetricType
import java.io.Reader

/**
 * `Device Temperature - YYYY-MM-DD.csv`: minute skin temperature with `recorded_time`,
 * `temperature`, `sensor_type` (UNVERIFIED).
 *
 * It is not known whether the column holds an absolute skin temperature or a deviation from the
 * personal baseline, so the value decides, and the two ranges cannot be confused: a number between
 * -10 and +10 is a deviation in degrees Celsius, a number between 20 and 45 is an absolute skin
 * temperature. Anything else fits neither and is quarantined. The file is never used to compute a
 * nightly figure; that comes from the computed-temperature file or another source.
 */
class DeviceTemperatureCsvParser(reader: Reader, private val clock: TakeoutClock) : CsvRowParser(reader) {
    private var timeColumn = -1
    private var valueColumn = -1

    override fun bind(): Boolean {
        timeColumn = csv.column("recorded_time", "timestamp", "date_time", "time")
        valueColumn = csv.column("temperature", "temperature_celsius", "value")
        return timeColumn >= 0 && valueColumn >= 0
    }

    override fun row(out: TakeoutRowBuffer) {
        val stamp = TakeoutTimestamps.parse(csv.get(timeColumn))
        val cell = csv.get(valueColumn)
        val value = number(valueColumn)
        if (stamp == null || (cell != null && value == null)) {
            stats.quarantined++
            return
        }
        if (value == null) {
            stats.droppedEmpty++
            return
        }
        val metric = when (value) {
            in -10.0..10.0 -> MetricType.SKIN_TEMP_DEVIATION
            in 20.0..45.0 -> MetricType.SKIN_TEMP_NIGHTLY
            else -> null
        }
        if (metric == null) {
            stats.quarantined++
            return
        }
        val millis = clock.toEpochMillis(stamp)
        out.samples += SampleObservation(metric, millis, value, millis + MINUTE_MS)
        stats.rowsEmitted++
        stats.span(millis)
    }

    private companion object {
        const val MINUTE_MS = 60_000L
    }
}
