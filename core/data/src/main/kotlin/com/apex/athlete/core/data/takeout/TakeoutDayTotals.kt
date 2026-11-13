package com.apex.athlete.core.data.takeout

import com.apex.athlete.core.domain.MetricType

/**
 * Which summed series get a day total from the archive's 15-minute buckets, and when a day counts as
 * covered. A day total is written only for a day the archive covers completely, because a partial
 * sum presented as the day's value is a wrong number, and a missing one is just missing.
 *
 * - [DENSE] series have a reading in every part of a worn day, so a day is covered when every one
 *   of its buckets (92, 96 or 100 on clock-change days) is stored from the archive. Steps qualify
 *   because the steps parser writes short silent stretches as zeros; total calories because the band
 *   estimates energy for every minute.
 * - [SPARSE] series have rows only when something happened (a minute of distance, an active-zone minute,
 *   a minute at a level), so the absence of a row says nothing about coverage. Such a day is covered
 *   when the steps series covers it completely: the archive then demonstrably holds that whole day, and
 *   a bucket that is not there is a bucket without activity. A sparse series is never totalled for a day
 *   it has no row on (missing stays missing, not zero).
 */
object TakeoutDayTotals {
    val DENSE: Set<MetricType> = setOf(MetricType.STEPS, MetricType.CALORIES_TOTAL)

    val SPARSE: Set<MetricType> = setOf(
        MetricType.DISTANCE, MetricType.CALORIES_ACTIVE, MetricType.ACTIVE_ZONE_MINUTES, MetricType.SEDENTARY_MINUTES,
        MetricType.LIGHTLY_ACTIVE_MINUTES, MetricType.MODERATELY_ACTIVE_MINUTES, MetricType.VERY_ACTIVE_MINUTES,
    )

    /** The series whose complete days establish that the archive covers a day. */
    val COVERAGE_REFERENCE: MetricType = MetricType.STEPS

    val ALL: Set<MetricType> = DENSE + SPARSE
}
