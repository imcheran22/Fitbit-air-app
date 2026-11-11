package app.fitdash.metrics

// BELOW_USUAL is the lowest band for a single night of sleep: a comparison, never an alarm.
enum class Status { OPTIMAL, GOOD, FAIR, ATTENTION, BELOW_USUAL }

val TYPICAL_DEEP = 0.13..0.23
val TYPICAL_LIGHT = 0.45..0.60
val TYPICAL_REM = 0.20..0.25
val TYPICAL_AWAKE = 0.0..0.05

fun scoreStatus(score: Int): Status = when {
    score >= 85 -> Status.OPTIMAL
    score >= 70 -> Status.GOOD
    score >= 50 -> Status.FAIR
    else -> Status.ATTENTION
}

fun sleepScoreStatus(score: Int): Status = scoreStatus(score).let { if (it == Status.ATTENTION) Status.BELOW_USUAL else it }

fun rangeWord(status: RangeStatus): Status = when (status) {
    RangeStatus.GOOD_SIDE -> Status.OPTIMAL
    RangeStatus.IN -> Status.GOOD
    RangeStatus.BAD_SIDE -> Status.ATTENTION
}

fun shareStatus(share: Double, typical: ClosedFloatingPointRange<Double>): Status =
    if (share in typical) Status.OPTIMAL else Status.FAIR

fun efficiencyStatus(efficiency: Double): Status = when {
    efficiency >= 0.90 -> Status.OPTIMAL
    efficiency >= 0.85 -> Status.GOOD
    efficiency >= 0.75 -> Status.FAIR
    else -> Status.BELOW_USUAL
}

fun awakeningsStatus(count: Int): Status = when {
    count <= 2 -> Status.OPTIMAL
    count <= 4 -> Status.GOOD
    count <= 6 -> Status.FAIR
    else -> Status.BELOW_USUAL
}
