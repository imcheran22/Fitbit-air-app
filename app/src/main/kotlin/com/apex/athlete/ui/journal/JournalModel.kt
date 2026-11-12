package com.apex.athlete.ui.journal

import androidx.annotation.StringRes
import com.apex.athlete.R
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState

/** The check-in scale the repository stores: 1 to 10 (see AthleteRepository.saveCheckIn). */
const val CHECK_IN_MIN = 1
const val CHECK_IN_MAX = 10

/** A check-in already stored for the selected day. A null side was not rated. */
data class StoredCheckIn(val fatigue: Int?, val soreness: Int?) {
    val isEmpty: Boolean get() = fatigue == null && soreness == null
}

/** What the person has picked on screen; 0 means "not rated". */
data class CheckInDraft(val fatigue: Int = 0, val soreness: Int = 0) {
    fun toStored(): StoredCheckIn = StoredCheckIn(fatigue.takeIf { it > 0 }, soreness.takeIf { it > 0 })
}

enum class CheckInScale { FATIGUE, SORENESS }

enum class SaveStatus { IDLE, SAVING, SAVED, ERROR }

/** Save is offered only when the draft differs from what is stored (so clearing a rating is possible too). */
fun canSave(draft: CheckInDraft, stored: StoredCheckIn?): Boolean {
    if (stored == null) return false // still loading: do not overwrite blindly
    return draft.toStored() != stored
}

/** Pick or clear: tapping the selected number again clears it. */
fun toggleLevel(current: Int, tapped: Int): Int = if (current == tapped) 0 else tapped.coerceIn(CHECK_IN_MIN, CHECK_IN_MAX)

/** Five anchor words, two levels each: 1-2, 3-4, 5-6, 7-8, 9-10. */
@StringRes
fun anchorRes(scale: CheckInScale, level: Int): Int {
    val band = ((level.coerceIn(CHECK_IN_MIN, CHECK_IN_MAX) - 1) / 2)
    return when (scale) {
        CheckInScale.FATIGUE -> when (band) {
            0 -> R.string.journal_fatigue_1
            1 -> R.string.journal_fatigue_2
            2 -> R.string.journal_fatigue_3
            3 -> R.string.journal_fatigue_4
            else -> R.string.journal_fatigue_5
        }
        CheckInScale.SORENESS -> when (band) {
            0 -> R.string.journal_soreness_1
            1 -> R.string.journal_soreness_2
            2 -> R.string.journal_soreness_3
            3 -> R.string.journal_soreness_4
            else -> R.string.journal_soreness_5
        }
    }
}

/**
 * One stored rating as a [MetricState]: null repository result renders Loading, a missing rating renders
 * Unavailable (never 0), a stored one is a USER_REPORTED value.
 */
fun storedRatingState(loaded: Boolean, value: Int?, unit: String?, asOf: String?): MetricState = when {
    !loaded -> MetricState.Loading
    value == null -> MetricState.Unavailable(MetricReason.NO_DATA)
    else -> MetricState.Value(value.toDouble(), 0, unit, DataProvenance.USER_REPORTED, asOf)
}
