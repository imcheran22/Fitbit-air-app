package com.apex.athlete.ui.journal

import androidx.annotation.StringRes
import androidx.compose.runtime.Immutable
import com.apex.athlete.R
import com.apex.athlete.core.data.pipeline.JournalDay
import com.apex.athlete.core.domain.MetricType

/*
 * The five yes/no journal factors (AthleteRepository.saveJournalFactors): pure model, no Compose runtime.
 * true = yes, false = no, null = not logged (choosing "Not logged" removes the stored value).
 */

/** The factors the repository accepts, in display order. */
val JOURNAL_FACTORS: List<MetricType> = JournalDay.FACTORS

/** One option of a factor's three-way choice. [value] is what `saveJournalFactors` takes. */
enum class FactorChoice(val value: Boolean?) {
    YES(true),
    NO(false),
    NOT_LOGGED(null),
}

fun choiceOf(value: Boolean?): FactorChoice = when (value) {
    true -> FactorChoice.YES
    false -> FactorChoice.NO
    null -> FactorChoice.NOT_LOGGED
}

@StringRes
fun factorTitleRes(factor: MetricType): Int = when (factor) {
    MetricType.JOURNAL_ALCOHOL -> R.string.journal_factor_alcohol
    MetricType.JOURNAL_LATE_CAFFEINE -> R.string.journal_factor_late_caffeine
    MetricType.JOURNAL_LATE_MEAL -> R.string.journal_factor_late_meal
    MetricType.JOURNAL_STRESSFUL_DAY -> R.string.journal_factor_stressful_day
    MetricType.JOURNAL_TRAVEL -> R.string.journal_factor_travel
    else -> R.string.journal_factor_other
}

@StringRes
fun choiceLabelRes(choice: FactorChoice): Int = when (choice) {
    FactorChoice.YES -> R.string.journal_choice_yes
    FactorChoice.NO -> R.string.journal_choice_no
    FactorChoice.NOT_LOGGED -> R.string.journal_choice_not_logged
}

/**
 * What the screen shows: the stored value, except where a tap is still being saved. A pending entry (even one
 * whose value is null, meaning "clear") wins over the stored value until the store catches up.
 */
fun effectiveFactors(stored: Map<MetricType, Boolean?>, pending: Map<MetricType, Boolean?>): Map<MetricType, Boolean?> =
    JOURNAL_FACTORS.associateWith { factor -> if (pending.containsKey(factor)) pending[factor] else stored[factor] }

/** The five factors as the screen draws them; [loaded] false shows skeleton rows and disabled choices. */
@Immutable
data class FactorsPanel(
    val loaded: Boolean,
    val choices: Map<MetricType, FactorChoice>,
    val status: SaveStatus,
) {
    companion object {
        val LOADING = FactorsPanel(false, JOURNAL_FACTORS.associateWith { FactorChoice.NOT_LOGGED }, SaveStatus.IDLE)

        fun of(stored: Map<MetricType, Boolean?>?, pending: Map<MetricType, Boolean?>, status: SaveStatus): FactorsPanel =
            if (stored == null) {
                LOADING.copy(status = status)
            } else {
                FactorsPanel(true, effectiveFactors(stored, pending).mapValues { choiceOf(it.value) }, status)
            }
    }
}
