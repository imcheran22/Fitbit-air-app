package com.apex.athlete.ui.journal

import androidx.compose.runtime.Immutable
import com.apex.athlete.R
import com.apex.athlete.core.analytics.journal.JournalEffect
import com.apex.athlete.core.analytics.journal.JournalEffects
import com.apex.athlete.core.analytics.journal.JournalEffectsReport
import com.apex.athlete.core.analytics.journal.JournalOutcomeKind
import com.apex.athlete.core.analytics.journal.JournalSkip
import com.apex.athlete.core.analytics.journal.JournalSkipReason
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.state.MetricFormat
import com.apex.athlete.ui.common.ApexFormatter
import kotlin.math.abs

/*
 * The "Effects" section of the Journal: next-day associations of each factor with recovery and HRV
 * (JournalEffects). The wording is associative on purpose: observational, confounded, not causal, not medical.
 * Every number here is calculated from self-reported factors; the screen prints that provenance beside it.
 */

/** One association the analysis could compute. */
@Immutable
data class EffectRowUi(
    val factor: MetricType,
    val outcome: JournalOutcomeKind,
    /** "Alcohol". */
    val title: String,
    /** "Associated with next-day recovery 6.2 points lower". */
    val headline: String,
    /** "95 % interval: −11.0 to −1.4 points". */
    val interval: String,
    /** "Based on 12 days with it and 31 days without it". */
    val arms: String,
    /** "The interval includes zero, so this could be chance." or the neutral counterpart. */
    val certainty: String,
    val excludesZero: Boolean,
    /** One sentence for TalkBack carrying everything above. */
    val spoken: String,
)

/** A factor and outcome that does not qualify yet: how many days are still needed in each arm. */
@Immutable
data class EffectNoteUi(
    val factor: MetricType,
    val outcome: JournalOutcomeKind,
    val title: String,
    val lines: List<String>,
    val spoken: String,
)

@Immutable
data class EffectsUi(
    val rows: List<EffectRowUi>,
    val notes: List<EffectNoteUi>,
    /** Why the list is empty ("Nothing qualifies yet. ..."); null when at least one association is shown. */
    val emptySummary: String?,
    /** "12 tests were run ..."; null when nothing has been journalled at all. */
    val testsText: String?,
    val testsPerformed: Int,
)

private fun factorOf(key: String): MetricType? =
    MetricType.entries.firstOrNull { it.storageKey == key }?.takeIf { it in JOURNAL_FACTORS }

/** Display order: factors as the journal lists them, recovery before HRV. */
private fun order(factorKey: String, outcome: JournalOutcomeKind): Int {
    val i = JOURNAL_FACTORS.indexOfFirst { it.storageKey == factorKey }
    return (if (i < 0) JOURNAL_FACTORS.size else i) * 10 + outcome.ordinal
}

fun buildEffectsUi(report: JournalEffectsReport?, f: ApexFormatter): EffectsUi {
    if (report == null) {
        return EffectsUi(emptyList(), emptyList(), f.string(R.string.journal_effects_none_logged, JournalEffects.MIN_PER_ARM), null, 0)
    }
    val rows = report.effects.sortedBy { order(it.factor, it.outcome) }.mapNotNull { effectRow(it, f) }
    val notes = report.skipped.sortedBy { order(it.factor, it.outcome) }.mapNotNull { skipNote(it, f) }
    val summary = when {
        rows.isNotEmpty() -> null
        notes.isNotEmpty() -> f.string(R.string.journal_effects_none_qualify, JournalEffects.MIN_PER_ARM)
        else -> f.string(R.string.journal_effects_no_outcomes)
    }
    val tests = if (report.testsPerformed == 0) {
        f.string(R.string.journal_effects_tests_zero)
    } else {
        f.string(R.string.journal_effects_tests, report.testsPerformed)
    }
    return EffectsUi(rows, notes, summary, tests, report.testsPerformed)
}

private fun outcomeName(kind: JournalOutcomeKind, f: ApexFormatter): String = f.string(
    when (kind) {
        JournalOutcomeKind.RECOVERY_POINTS -> R.string.journal_outcome_recovery
        JournalOutcomeKind.HRV_PERCENT -> R.string.journal_outcome_hrv
    },
)

private fun effectRow(e: JournalEffect, f: ApexFormatter): EffectRowUi? {
    val factor = factorOf(e.factor) ?: return null
    val title = f.string(factorTitleRes(factor))
    val isRecovery = e.outcome == JournalOutcomeKind.RECOVERY_POINTS
    val magnitude = f.number(abs(e.effect), 1)
    val flat = Math.round(abs(e.effect) * 10.0) == 0L
    val headline = when {
        flat -> f.string(if (isRecovery) R.string.journal_effect_flat_recovery else R.string.journal_effect_flat_hrv)
        isRecovery && e.effect < 0 -> f.string(R.string.journal_effect_recovery_lower, magnitude)
        isRecovery -> f.string(R.string.journal_effect_recovery_higher, magnitude)
        e.effect < 0 -> f.string(R.string.journal_effect_hrv_lower, magnitude)
        else -> f.string(R.string.journal_effect_hrv_higher, magnitude)
    }
    val low = MetricFormat.delta(e.ciLow, 1, f.locale)
    val high = MetricFormat.delta(e.ciHigh, 1, f.locale)
    val interval = f.string(if (isRecovery) R.string.journal_effect_interval_points else R.string.journal_effect_interval_percent, low, high)
    val arms = f.string(R.string.journal_effect_arms, e.nWith, e.nWithout)
    val certainty = f.string(if (e.intervalExcludesZero) R.string.journal_effect_excludes_zero else R.string.journal_effect_includes_zero)
    return EffectRowUi(
        factor = factor,
        outcome = e.outcome,
        title = title,
        headline = headline,
        interval = interval,
        arms = arms,
        certainty = certainty,
        excludesZero = e.intervalExcludesZero,
        spoken = f.string(R.string.journal_effect_spoken, title, headline, interval, arms, certainty),
    )
}

private fun skipNote(s: JournalSkip, f: ApexFormatter): EffectNoteUi? {
    val factor = factorOf(s.factor) ?: return null
    val title = f.string(R.string.journal_effect_note_title, f.string(factorTitleRes(factor)), outcomeName(s.outcome, f))
    val lines = when (s.reason) {
        JournalSkipReason.TOO_FEW_PER_ARM -> buildList {
            add(f.string(R.string.journal_need_so_far, s.nWith, s.nWithout))
            val moreWith = (JournalEffects.MIN_PER_ARM - s.nWith).coerceAtLeast(0)
            val moreWithout = (JournalEffects.MIN_PER_ARM - s.nWithout).coerceAtLeast(0)
            if (moreWith > 0) add(f.string(R.string.journal_need_more_with, moreWith))
            if (moreWithout > 0) add(f.string(R.string.journal_need_more_without, moreWithout))
        }
        JournalSkipReason.NO_VARIANCE -> listOf(
            f.string(R.string.journal_need_so_far, s.nWith, s.nWithout),
            f.string(R.string.journal_need_no_variance),
        )
    }
    return EffectNoteUi(factor, s.outcome, title, lines, "$title. ${lines.joinToString(" ")}")
}
