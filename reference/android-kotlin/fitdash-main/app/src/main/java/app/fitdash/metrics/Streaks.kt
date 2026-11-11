package app.fitdash.metrics

data class Streak(val kind: MetricKind, val days: Int) {
    val milestone: Boolean get() = days in MILESTONES
}

val MILESTONES = setOf(3, 7, 14, 21, 30, 60, 100, 180)

// Days in a row that met the goal, counting back from the last day in `days`.
// The last day is still running, so missing its goal does not break the streak yet; a day with no data does.
fun streakDays(days: List<DayValue>, goal: Double): Int {
    val met = days.map { it.value != null && it.value >= goal }
    val counted = if (met.lastOrNull() == false) met.dropLast(1) else met
    return counted.takeLastWhile { it }.size
}

// Steps, sleep and water streaks of two days or more, longest first.
fun streaks(series: Map<MetricKind, List<DayValue>>, goals: Goals): List<Streak> =
    listOf(MetricKind.STEPS to goals.steps.toDouble(), MetricKind.SLEEP_HOURS to goals.sleepHours, MetricKind.WATER to goals.waterLiters)
        .map { (kind, goal) -> Streak(kind, streakDays(series[kind].orEmpty(), goal)) }
        .filter { it.days >= 2 }
        .sortedByDescending { it.days }
