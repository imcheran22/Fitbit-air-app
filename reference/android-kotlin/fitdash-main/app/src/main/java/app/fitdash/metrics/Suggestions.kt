package app.fitdash.metrics

enum class SuggestionKind { HARD_WORKOUT, MODERATE, REST, EARLIER_BED, EASY_ON_STIMULANTS, WALK }

data class Suggestion(val kind: SuggestionKind, val stepsLeft: Long = 0)

fun suggestions(
    readiness: ReadinessResult,
    sleep: SleepSummary?,
    heart: HeartSummary?,
    activity: ActivitySummary?,
    hour: Int,
    stepGoal: Int = Tuning.STEP_GOAL,
): List<Suggestion> = buildList {
    if (readiness is ReadinessResult.Ready) {
        add(
            Suggestion(
                when (readiness.band) {
                    Band.PRIMED -> SuggestionKind.HARD_WORKOUT
                    Band.STEADY -> SuggestionKind.MODERATE
                    Band.RECOVER -> SuggestionKind.REST
                },
            ),
        )
    }
    if (sleep != null && sleep.asleep.seconds < Tuning.SUGGEST_MIN_SLEEP_HOURS * 3600) add(Suggestion(SuggestionKind.EARLIER_BED))
    val hrv = heart?.hrv
    val base = heart?.hrvBaseline
    if (hrv != null && base != null && hrv <= base * (1 - Tuning.SUGGEST_HRV_DROP)) add(Suggestion(SuggestionKind.EASY_ON_STIMULANTS))
    if (hour >= Tuning.EVENING_HOUR && activity != null && activity.steps < stepGoal) {
        add(Suggestion(SuggestionKind.WALK, stepGoal - activity.steps))
    }
}.take(3)
