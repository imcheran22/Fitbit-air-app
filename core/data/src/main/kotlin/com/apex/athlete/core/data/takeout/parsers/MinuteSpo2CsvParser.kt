package com.apex.athlete.core.data.takeout.parsers

import com.apex.athlete.core.data.model.SampleObservation
import com.apex.athlete.core.data.takeout.TakeoutClock
import com.apex.athlete.core.data.takeout.TakeoutTimestamps
import com.apex.athlete.core.domain.MetricType
import java.io.Reader

/**
 * `Minute SpO2 - YYYY-MM-DD.csv` (`timestamp`, `value`) and the Google layout's
 * `oxygen_saturation_YYYY-MM-DD.csv` (`timestamp`, `oxygen saturation percentage`); both
 * UNVERIFIED. One percentage per minute during sleep, stored as a one-minute sample. An empty or
 * zero cell is "no reading" and is not stored.
 */
class MinuteSpo2CsvParser(reader: Reader, private val clock: TakeoutClock) : CsvRowParser(reader) {
    private var timeColumn = -1
    private var valueColumn = -1

    override fun bind(): Boolean {
        timeColumn = csv.column("timestamp", "date_time", "time")
        valueColumn = csv.column("value", "oxygen_saturation_percentage", "spo2")
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
        if (value == null || value == 0.0) {
            stats.droppedEmpty++
            return
        }
        val millis = clock.toEpochMillis(stamp)
        out.samples += SampleObservation(MetricType.SPO2_AVG, millis, value, millis + MINUTE_MS)
        stats.rowsEmitted++
        stats.span(millis)
    }

    private companion object {
        const val MINUTE_MS = 60_000L
    }
}
