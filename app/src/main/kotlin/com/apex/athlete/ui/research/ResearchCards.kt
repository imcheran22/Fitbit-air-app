package com.apex.athlete.ui.research

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.apex.athlete.R
import com.apex.athlete.core.analytics.research.ConfidenceLevel
import com.apex.athlete.core.analytics.research.Deviation
import com.apex.athlete.core.analytics.research.SwcStatus
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.ChipTone
import com.apex.athlete.core.ui.components.KeyStatRow
import com.apex.athlete.core.ui.components.ProvenanceLabel
import com.apex.athlete.core.ui.components.Tag
import com.apex.athlete.core.ui.components.hideFromTalkBack
import com.apex.athlete.core.ui.components.spoken
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.state.MetricStateView
import com.apex.athlete.core.ui.theme.ApexShapes
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.core.ui.theme.ThemePreference
import com.apex.athlete.ui.health.metricTitleRes

/** Cards for the research metrics (Recovery, Activity, Overview). Every number goes through [MetricState]. */

/** An Unavailable state without its own reason gets [res] as the reason text; other states are unchanged. */
@Composable
fun MetricState.withReason(@StringRes res: Int): MetricState =
    if (this is MetricState.Unavailable && detail == null) copy(detail = stringResource(res)) else this

@Composable
fun ResearchNote(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        style = ApexTheme.type.caption,
        color = ApexTheme.colors.mutedForeground,
        modifier = modifier.padding(vertical = ApexSpacing.xs),
    )
}

private val CardPadding = PaddingValues(horizontal = ApexSpacing.cardPadding, vertical = ApexSpacing.sm)

// --- Usual vs average -------------------------------------------------------------------------------

/** Per metric: your usual (median), the average (mean) and, in words, how far today is from the usual. */
@Composable
fun UsualVsAverageCard(rows: List<UsualRowUi>) {
    ApexCard(contentPadding = CardPadding) {
        rows.forEach { row ->
            val name = stringResource(metricTitleRes(row.metric))
            KeyStatRow(stringResource(R.string.research_usual_label, name), row.usual.withReason(R.string.research_usual_missing))
            KeyStatRow(stringResource(R.string.research_average_label, name), row.average.withReason(R.string.research_usual_missing))
            ResearchNote(stringResource(row.today?.let(::vsUsualWordRes) ?: R.string.research_vs_none))
        }
        ResearchNote(stringResource(R.string.research_usual_note), Modifier.padding(top = ApexSpacing.xs))
    }
}

// --- HRV stability ----------------------------------------------------------------------------------

@Composable
fun HrvStabilityCard(hrv: HrvStabilityUi) {
    ApexCard(contentPadding = CardPadding) {
        KeyStatRow(
            stringResource(R.string.research_hrv_cv),
            hrv.cv.withReason(R.string.research_hrv_cv_missing),
            icon = ApexIcons.Pulse,
        )
        ResearchNote(stringResource(R.string.research_hrv_cv_note))
        SwcRow(hrv.swc)
        KeyStatRow(
            stringResource(R.string.research_hrv_pct),
            hrv.percentFromBaseline.withReason(R.string.research_hrv_pct_missing),
        )
        ResearchNote(stringResource(R.string.research_swc_note))
    }
}

private fun swcTone(status: SwcStatus): ChipTone = when (status) {
    SwcStatus.WITHIN_BAND -> ChipTone.OPTIMAL
    SwcStatus.ABOVE_BAND -> ChipTone.INFO
    SwcStatus.BELOW_BAND -> ChipTone.WARNING
}

@Composable
private fun SwcRow(status: SwcStatus?) {
    val label = stringResource(R.string.research_swc_label)
    val statusText = status?.let { stringResource(swcRes(it)) }
    val derived = stringResource(com.apex.athlete.core.ui.components.provenanceLabelRes(DataProvenance.MATHEMATICALLY_DERIVED))
    val spoken = if (statusText != null) {
        "$label: $statusText, $derived"
    } else {
        stringResource(com.apex.athlete.core.ui.R.string.cd_metric_unavailable, label, stringResource(R.string.research_swc_missing))
    }
    Column(
        Modifier
            .fillMaxWidth()
            .heightIn(min = ApexSpacing.rowHeight)
            .spoken(spoken)
            .padding(vertical = ApexSpacing.sm),
        verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs),
    ) {
        Text(label.uppercase(), style = ApexTheme.type.statLabel, color = ApexTheme.colors.foreground)
        if (status == null) {
            MetricStateView(MetricState.Unavailable(MetricReason.NO_DATA, stringResource(R.string.research_swc_missing)), label = label) {}
        } else {
            Tag(statusText.orEmpty(), tone = swcTone(status))
            ProvenanceLabel(DataProvenance.MATHEMATICALLY_DERIVED)
        }
    }
}

// --- Activity ---------------------------------------------------------------------------------------

/** Sedentary time, prolonged bouts, longest bout, breaks and peak cadence; with a missing reason, no numbers at all. */
@Composable
fun ActivityResearchCard(ui: ActivityResearchUi) {
    val reason = ui.missingRes ?: R.string.research_row_missing
    ApexCard(contentPadding = CardPadding) {
        KeyStatRow(stringResource(R.string.research_sedentary_row), ui.sedentary.withReason(reason), icon = ApexIcons.Hourglass)
        KeyStatRow(stringResource(R.string.research_bouts_row), ui.prolongedBouts.withReason(reason))
        KeyStatRow(stringResource(R.string.research_longest_row), ui.longestBout.withReason(reason))
        KeyStatRow(stringResource(R.string.research_breaks_row), ui.breaksPerHour.withReason(reason))
        KeyStatRow(stringResource(R.string.research_cadence_row), ui.peakCadence.withReason(reason), icon = ApexIcons.Bolt)
        val threshold = ui.boutThresholdMinutes
        ResearchNote(
            if (threshold != null) {
                stringResource(R.string.research_activity_note, threshold)
            } else {
                stringResource(R.string.research_activity_note_plain)
            },
            Modifier.padding(top = ApexSpacing.xs),
        )
    }
}

// --- Patterns ---------------------------------------------------------------------------------------

/** One detected pattern: hedged message, the signals that moved together, confidence and provenance. Not clickable. */
@Composable
fun PatternCard(pattern: PatternUi) {
    val colors = ApexTheme.colors
    val title = stringResource(R.string.research_pattern_title)
    val signalsTitle = stringResource(R.string.research_pattern_signals)
    val derived = stringResource(com.apex.athlete.core.ui.components.provenanceLabelRes(DataProvenance.MATHEMATICALLY_DERIVED))
    val confidenceText = pattern.confidence?.let { stringResource(confidenceRes(it)) }
    val quietText = if (pattern.quiet) stringResource(R.string.research_pattern_quiet) else null
    val lines = ArrayList<String>(pattern.signals.size)
    for (s in pattern.signals) {
        lines.add(stringResource(R.string.research_pattern_signal_line, s.label, stringResource(deviationRes(s.deviation))))
    }
    val spoken = stringResource(
        R.string.research_pattern_description,
        pattern.title,
        pattern.message,
        signalsTitle,
        lines.joinToString("; "),
        confidenceText.orEmpty(),
        quietText?.let { "$it " }.orEmpty() + derived,
    )
    Column(
        Modifier
            .fillMaxWidth()
            .clip(ApexShapes.card)
            .background(colors.card)
            .border(1.dp, colors.border, ApexShapes.card)
            .padding(ApexSpacing.cardPadding)
            .spoken(spoken),
        verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(ApexSpacing.md), verticalAlignment = Alignment.CenterVertically) {
            Icon(ApexIcons.Info, null, Modifier.size(20.dp).hideFromTalkBack(), tint = colors.mutedForeground)
            Column(Modifier.weight(1f).hideFromTalkBack()) {
                Text(title.uppercase(), style = ApexTheme.type.statLabel, color = colors.mutedForeground)
                Text(pattern.title, style = ApexTheme.type.bodyStrong, color = colors.foreground)
            }
        }
        Text(pattern.message, style = ApexTheme.type.body, color = colors.foregroundSecondary, modifier = Modifier.hideFromTalkBack())
        if (lines.isNotEmpty()) {
            Column(Modifier.hideFromTalkBack(), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(signalsTitle.uppercase(), style = ApexTheme.type.statLabel, color = colors.foreground)
                for (line in lines) Text(line, style = ApexTheme.type.caption, color = colors.mutedForeground)
            }
        }
        if (confidenceText != null) {
            Box(Modifier.hideFromTalkBack()) { Tag(confidenceText, tone = confidenceTone(pattern.confidence)) }
        }
        if (quietText != null) {
            Text(quietText, style = ApexTheme.type.caption, color = colors.mutedForeground, modifier = Modifier.hideFromTalkBack())
        }
        Box(Modifier.hideFromTalkBack()) { ProvenanceLabel(DataProvenance.MATHEMATICALLY_DERIVED) }
    }
}

private fun confidenceTone(level: ConfidenceLevel?): ChipTone = when (level) {
    ConfidenceLevel.HIGH -> ChipTone.OPTIMAL
    ConfidenceLevel.MODERATE -> ChipTone.INFO
    ConfidenceLevel.LOW -> ChipTone.WARNING
    null -> ChipTone.NEUTRAL
}

// --- Previews ---------------------------------------------------------------------------------------

private val PreviewDerived = DataProvenance.MATHEMATICALLY_DERIVED

private fun previewRows(): List<UsualRowUi> = listOf(
    UsualRowUi(MetricType.HRV_RMSSD, MetricState.Value(58.0, 0, "ms", PreviewDerived), MetricState.Value(61.0, 0, "ms", PreviewDerived), VsUsualWord.SOMEWHAT_LOWER),
    UsualRowUi(MetricType.RESTING_HEART_RATE, MetricState.Value(54.0, 0, "bpm", PreviewDerived), MetricState.Value(55.0, 0, "bpm", PreviewDerived), VsUsualWord.ABOUT_USUAL),
    UsualRowUi(MetricType.SLEEPING_HEART_RATE, MetricState.Calibrating(null), MetricState.Calibrating(null), null),
    UsualRowUi(MetricType.RESPIRATORY_RATE, MetricState.Unavailable(MetricReason.NO_DATA), MetricState.Unavailable(MetricReason.NO_DATA), null),
)

private fun previewPattern() = PatternUi(
    id = "preview",
    title = "Several signals moved together",
    message = "Several signals moved together compared with your usual. This may happen after poor sleep or hard training. This is not a diagnosis.",
    signals = listOf(
        PatternSignalUi("Resting heart rate", Deviation.HIGHER),
        PatternSignalUi("HRV (last night)", Deviation.LOWER),
    ),
    confidence = ConfidenceLevel.MODERATE,
    quiet = false,
)

@Composable
private fun PreviewBody(dark: Boolean) {
    ApexTheme(if (dark) ThemePreference.DARK else ThemePreference.LIGHT) {
        Column(
            Modifier.background(ApexTheme.colors.background).padding(ApexSpacing.gutter),
            verticalArrangement = Arrangement.spacedBy(ApexSpacing.cardGap),
        ) {
            UsualVsAverageCard(previewRows())
            HrvStabilityCard(
                HrvStabilityUi(MetricState.Value(8.2, 1, "%", PreviewDerived), SwcStatus.WITHIN_BAND, MetricState.Value(-3.4, 1, "%", PreviewDerived)),
            )
            HrvStabilityCard(HrvStabilityUi(MetricState.Unavailable(MetricReason.NO_DATA), null, MetricState.Unavailable(MetricReason.NO_DATA)))
            ActivityResearchCard(
                ActivityResearchUi(
                    MetricState.Value(612.0, 0, "min", PreviewDerived), MetricState.Value(4.0, 0, null, PreviewDerived),
                    MetricState.Value(96.0, 0, "min", PreviewDerived), MetricState.Value(2.1, 1, "/h", PreviewDerived),
                    MetricState.Value(104.0, 0, "steps/min", PreviewDerived), 30, null,
                ),
            )
            ActivityResearchCard(
                ActivityResearchUi(
                    MetricState.Unavailable(), MetricState.Unavailable(), MetricState.Unavailable(), MetricState.Unavailable(),
                    MetricState.Unavailable(), null, R.string.research_activity_missing_coarse,
                ),
            )
            PatternCard(previewPattern())
            PatternCard(previewPattern().copy(confidence = ConfidenceLevel.LOW, quiet = true))
        }
    }
}

@Preview(name = "Research dark", heightDp = 2600)
@Composable
private fun ResearchPreviewDark() = PreviewBody(dark = true)

@Preview(name = "Research light", heightDp = 2600)
@Composable
private fun ResearchPreviewLight() = PreviewBody(dark = false)
