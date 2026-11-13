package com.apex.athlete.core.data.takeout.parsers

import com.apex.athlete.core.data.takeout.TakeoutClock
import com.apex.athlete.core.domain.MetricType
import java.io.Reader

/*
 * Steps are a summed series like calories or distance (see SumSeriesParsers.kt): many small counts
 * folded into 15-minute buckets, written once, complete. What is specific to steps:
 *
 * - the classic file is assumed to list every minute, but the export may leave out minutes with zero
 *   steps (OPEN_POINTS T3). A silent stretch of up to 16 hours between two readings of the same
 *   file is therefore written as zero-step buckets, so a day's total does not depend on those
 *   minutes being present. A stretch of a day or more is not filled: that is a band that was off.
 *   The first and the last day of a file are never completed this way, because the file may have
 *   started after, or ended before, midnight.
 */

/** Classic layout `steps-YYYY-MM-DD.json`: `[{"dateTime": "MM/dd/yy HH:mm:ss", "value": "12"}, ...]` (UNVERIFIED). */
class StepsJsonParser(reader: Reader, clock: TakeoutClock) : SumSeriesJsonParser(reader, clock, SumSeries.STEPS)

/** Google layout `steps_YYYY-MM-DD.csv` with `timestamp` and `steps` columns (UNVERIFIED). */
class StepsCsvParser(reader: Reader, clock: TakeoutClock) : SumSeriesCsvParser(
    reader, clock, MetricType.STEPS, SumSeries.STEPS.maxPerRow, BucketedSumParser.NIGHT_GAP_BUCKETS,
    listOf(SumColumn("steps"), SumColumn("value"), SumColumn("count")), emptyIsNoValue = false,
)
