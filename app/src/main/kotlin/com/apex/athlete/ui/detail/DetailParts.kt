package com.apex.athlete.ui.detail

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import com.apex.athlete.R
import com.apex.athlete.core.ui.components.ApexButton
import com.apex.athlete.core.ui.components.ApexButtonStyle
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.ChipTone
import com.apex.athlete.core.ui.components.ChoiceOption
import com.apex.athlete.core.ui.components.ChoiceRow
import com.apex.athlete.core.ui.components.DatePill
import com.apex.athlete.core.ui.components.MetricProvenance
import com.apex.athlete.core.ui.components.ReasonPlaceholder
import com.apex.athlete.core.ui.components.ReasonSize
import com.apex.athlete.core.ui.components.SkeletonLine
import com.apex.athlete.core.ui.components.SkeletonLineFill
import com.apex.athlete.core.ui.components.Tag
import com.apex.athlete.core.ui.components.apexClickable
import com.apex.athlete.core.ui.components.hideFromTalkBack
import com.apex.athlete.core.ui.components.spoken
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.state.MetricValueText
import com.apex.athlete.core.ui.state.metricSpoken
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme

/*
 * Small composables shared by the Health detail routes. They carry no state of their own and no screen logic.
 * Everything is built from the :core:ui kit and the tokens; copy comes from strings_details.xml and the callers.
 */

/** The date pill that steps the day (centred, a 48 dp target for each control). */
@Composable
fun DayBanner(label: String, canGoNext: Boolean, onPrevious: () -> Unit, onNext: () -> Unit, onToday: () -> Unit) {
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        DatePill(
            label = label,
            onPrevious = onPrevious,
            onNext = onNext,
            onLabelClick = onToday,
            canGoNext = canGoNext,
            previousDescription = stringResource(R.string.detail_prev_day),
            nextDescription = stringResource(R.string.detail_next_day),
            labelClickDescription = stringResource(R.string.detail_go_today),
        )
    }
}

@Composable
fun Caption(text: String, modifier: Modifier = Modifier) {
    Text(text, style = ApexTheme.type.caption, color = ApexTheme.colors.mutedForeground, modifier = modifier)
}

@Composable
fun BodyText(text: String, modifier: Modifier = Modifier) {
    Text(text, style = ApexTheme.type.body, color = ApexTheme.colors.foregroundBody, modifier = modifier)
}

/** The "Estimate" tag that marks a figure Apex calculates itself rather than measures. */
@Composable
fun EstimateTag(modifier: Modifier = Modifier) {
    Tag(stringResource(R.string.detail_estimate_tag), modifier, ChipTone.INFO)
}

/** The number, its provenance and the provisional tag for a state, or a skeleton, or `--` with the reason. */
@Composable
fun StateBody(state: MetricState, valueStyle: TextStyle = ApexTheme.type.statValue) {
    if (state is MetricState.Loading) {
        SkeletonLine(width = 96.dp, height = 28.dp)
        return
    }
    MetricValueText(state, valueStyle = valueStyle)
    when (state) {
        is MetricState.Value -> {
            MetricProvenance(state)
            if (state.isProvisional) Tag(stringResource(com.apex.athlete.core.ui.R.string.tag_provisional))
        }
        is MetricState.Stale -> MetricProvenance(state)
        else -> ReasonPlaceholder(state, size = ReasonSize.Small)
    }
}

/**
 * A caps label over a value with provenance (or `--` and the reason). One TalkBack sentence carries the same information,
 * plus [extras] such as a status word.
 */
@Composable
fun StatBlock(
    label: String,
    state: MetricState,
    modifier: Modifier = Modifier,
    valueStyle: TextStyle = ApexTheme.type.statValue,
    extras: List<String> = emptyList(),
) {
    Column(
        modifier.spoken(metricSpoken(label, state, extras)),
        verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs),
    ) {
        Column(Modifier.hideFromTalkBack(), verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
            Text(label.uppercase(), style = ApexTheme.type.statLabel, color = ApexTheme.colors.foregroundSecondary)
            StateBody(state, valueStyle)
        }
    }
}

/** A full-width link row: caps label and chevron, at least 48 dp tall, spoken with [description]. */
@Composable
fun LinkRow(text: String, description: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier
            .fillMaxWidth()
            .apexClickable(onClick = onClick, role = Role.Button)
            .heightIn(min = ApexSpacing.minTouch)
            .spoken(description),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(ApexSpacing.xs),
    ) {
        Text(text.uppercase(), style = ApexTheme.type.linkAction, color = ApexTheme.colors.foregroundSecondary, modifier = Modifier.weight(1f))
        Icon(ApexIcons.ChevronRight, contentDescription = null, modifier = Modifier.size(16.dp), tint = ApexTheme.colors.foregroundSecondary)
    }
}

@Composable
fun LoadingCard(height: androidx.compose.ui.unit.Dp = 96.dp) {
    ApexCard { SkeletonLineFill(height = height) }
}

@Composable
fun FailedCard() {
    ApexCard { ReasonPlaceholder(stringResource(R.string.detail_error), ApexIcons.Warning, size = ReasonSize.Medium) }
}

/**
 * Under a chart: the selected day and a 48 dp button that opens it, or a hint when no day is selected.
 * [dayLabel] is the formatted selected day (null = none); [onOpen] opens that day.
 */
@Composable
fun SelectedDayRow(dayLabel: String?, onOpen: () -> Unit, modifier: Modifier = Modifier) {
    if (dayLabel == null) {
        Caption(stringResource(R.string.detail_no_selection), modifier)
    } else {
        ApexButton(
            text = stringResource(R.string.detail_open_day, dayLabel),
            onClick = onOpen,
            modifier = modifier.fillMaxWidth().padding(top = ApexSpacing.xs),
            style = ApexButtonStyle.Secondary,
        )
    }
}

/** Range switch over day counts (for example 7, 30, 90), labelled through the shared plurals. */
@Composable
fun RangeChoice(ranges: List<Int>, selected: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier) {
    val options = ranges.map { days ->
        ChoiceOption(
            key = days.toString(),
            label = pluralStringResource(R.plurals.health_range_days, days, days),
            description = pluralStringResource(R.plurals.health_range_option_cd, days, days),
        )
    }
    ChoiceRow(
        options = options,
        selectedKey = selected.toString(),
        onSelect = { key -> key.toIntOrNull()?.let(onSelect) },
        groupDescription = stringResource(R.string.health_trend_range_selector_cd),
        modifier = modifier,
    )
}

/** "07:30" or "7:30 AM" for an instant in the chart clock's zone and 12 or 24 hour style. */
fun clockLabel(millis: Long, clock: com.apex.athlete.core.ui.charts.ChartClock): String =
    com.apex.athlete.core.ui.charts.ChartScales.formatClock(millis, clock.zone, clock.use24Hour, java.util.Locale.getDefault())

/** The first and last clock time under an intraday strip. Decorative: the chart's description carries the same information. */
@Composable
fun WindowLabels(startMillis: Long, endMillis: Long, clock: com.apex.athlete.core.ui.charts.ChartClock) {
    Row(Modifier.fillMaxWidth().hideFromTalkBack(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(clockLabel(startMillis, clock), style = ApexTheme.type.chart, color = ApexTheme.colors.mutedForeground)
        Text(clockLabel(endMillis, clock), style = ApexTheme.type.chart, color = ApexTheme.colors.mutedForeground)
    }
}
