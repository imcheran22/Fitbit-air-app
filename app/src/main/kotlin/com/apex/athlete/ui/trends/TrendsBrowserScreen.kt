package com.apex.athlete.ui.trends

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.data.repository.TrendIntelligenceState
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.charts.ChartPoint
import com.apex.athlete.core.ui.charts.DaySeries
import com.apex.athlete.core.ui.charts.DaySeriesChart
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.KeyStatRow
import com.apex.athlete.core.ui.components.ReasonPlaceholder
import com.apex.athlete.core.ui.components.ReasonSize
import com.apex.athlete.core.ui.components.SkeletonLineFill
import com.apex.athlete.core.ui.components.apexClickable
import com.apex.athlete.core.ui.components.spoken
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.shell.DetailShell
import com.apex.athlete.core.ui.shell.SectionShell
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.navigation.ApexNavigator
import com.apex.athlete.ui.common.LocalFormatter
import com.apex.athlete.ui.common.apexViewModel
import com.apex.athlete.ui.detail.Caption
import com.apex.athlete.ui.detail.DetailLoad
import com.apex.athlete.ui.detail.FailedCard
import com.apex.athlete.ui.detail.LinkRow
import com.apex.athlete.ui.detail.RangeChoice
import com.apex.athlete.ui.detail.SeriesUi
import com.apex.athlete.ui.detail.readyOrNull
import com.apex.athlete.ui.health.HealthPreviewFrame
import com.apex.athlete.ui.health.HealthThemePreviews
import com.apex.athlete.ui.health.metricTitleRes
import java.time.LocalDate

/** The trends browser: every figure with data grouped by category, and an overlay of any two on separate scales. */
@Composable
fun TrendsBrowserRoute(navigator: ApexNavigator, first: MetricType?) {
    val vm = apexViewModel(key = "trends-browser") { container, handle ->
        val repository = container.repository
        TrendsBrowserViewModel(first, handle, repository::trends, repository::today)
    }
    val load by vm.state.collectAsStateWithLifecycle()
    val range by vm.range.collectAsStateWithLifecycle()
    val firstMetric by vm.first.collectAsStateWithLifecycle()
    val secondMetric by vm.second.collectAsStateWithLifecycle()
    val formatter = LocalFormatter.current
    val state = load.readyOrNull()
    val groups = remember(state, formatter) { state?.let { buildTrendGroups(it, formatter) } }
    val overlay = remember(firstMetric, secondMetric, state, formatter) { buildOverlay(firstMetric, secondMetric, state, formatter) }
    var selected by rememberSaveable { mutableStateOf<Long?>(null) }
    TrendsBrowserScreen(
        groups = groups,
        failed = load is DetailLoad.Failed,
        overlay = overlay,
        range = range,
        first = firstMetric,
        second = secondMetric,
        selectedDay = selected,
        dayLabel = { epochDay -> formatter.dayLabel(LocalDate.ofEpochDay(epochDay)) },
        onSelectDay = { selected = it },
        onSelectRange = { vm.selectRange(it); selected = null },
        onSelectFirst = { vm.selectFirst(it); selected = null },
        onSelectSecond = { vm.selectSecond(it); selected = null },
        onOpenTrend = navigator::openTrend,
        onOpenDay = { target, epochDay -> navigator.openDayTarget(target, LocalDate.ofEpochDay(epochDay)) },
        onBack = navigator::back,
    )
}

@Composable
internal fun TrendsBrowserScreen(
    groups: List<TrendGroupUi>?,
    failed: Boolean,
    overlay: OverlayState,
    range: Int,
    first: MetricType?,
    second: MetricType?,
    selectedDay: Long?,
    dayLabel: (Long) -> String,
    onSelectDay: (Long?) -> Unit,
    onSelectRange: (Int) -> Unit,
    onSelectFirst: (MetricType?) -> Unit,
    onSelectSecond: (MetricType?) -> Unit,
    onOpenTrend: (MetricType) -> Unit,
    onOpenDay: (DayTarget, Long) -> Unit,
    onBack: () -> Unit,
) {
    val available = remember(groups) { groups.orEmpty().flatMap { g -> g.rows.map { it.metric to it.titleRes } } }
    DetailShell(
        title = stringResource(R.string.trends_title),
        onBack = onBack,
        backDescription = stringResource(R.string.common_back),
        hero = {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                Text(
                    stringResource(R.string.trends_hero),
                    style = ApexTheme.type.sectionTitle,
                    color = ApexTheme.colors.foreground,
                    textAlign = TextAlign.Center,
                )
                Caption(stringResource(R.string.trends_hero_caption))
            }
        },
        primary = {
            if (failed) FailedCard()
            RangeChoice(TRENDS_RANGES, range, onSelectRange)
            SectionShell(stringResource(R.string.trends_section_overlay)) {
                OverlayCard(
                    overlay, available, range, first, second, selectedDay, dayLabel,
                    onSelectDay, onSelectFirst, onSelectSecond, onOpenDay,
                )
            }
            when {
                groups == null -> ApexCard { SkeletonLineFill(height = 120.dp) }
                groups.isEmpty() -> ApexCard {
                    ReasonPlaceholder(stringResource(R.string.trends_browser_empty), ApexIcons.Info, size = ReasonSize.Medium)
                }
                else -> groups.forEach { group ->
                    SectionShell(stringResource(group.titleRes)) {
                        ApexCard(contentPadding = PaddingValues(horizontal = ApexSpacing.cardPadding, vertical = ApexSpacing.sm)) {
                            group.rows.forEach { row ->
                                KeyStatRow(
                                    label = stringResource(row.titleRes),
                                    state = row.state,
                                    onClick = { onOpenTrend(row.metric) },
                                )
                                if (row.statusLabel != null) Caption(row.statusLabel)
                            }
                        }
                    }
                }
            }
        },
    )
}

@Composable
private fun OverlayCard(
    overlay: OverlayState,
    available: List<Pair<MetricType, Int>>,
    range: Int,
    first: MetricType?,
    second: MetricType?,
    selectedDay: Long?,
    dayLabel: (Long) -> String,
    onSelectDay: (Long?) -> Unit,
    onSelectFirst: (MetricType?) -> Unit,
    onSelectSecond: (MetricType?) -> Unit,
    onOpenDay: (DayTarget, Long) -> Unit,
) {
    // Which picker is open: 0 none, 1 first, 2 second. Saved so a rotation keeps the list open.
    var open by rememberSaveable { mutableIntStateOf(0) }
    ApexCard {
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
            MetricPicker(
                label = stringResource(R.string.trends_pick_first),
                selected = first,
                options = available.filter { it.first != second },
                expanded = open == 1,
                onToggle = { open = if (open == 1) 0 else 1 },
                onPick = { onSelectFirst(it); open = 0 },
            )
            MetricPicker(
                label = stringResource(R.string.trends_pick_second),
                selected = second,
                options = available.filter { it.first != first },
                expanded = open == 2,
                onToggle = { open = if (open == 2) 0 else 2 },
                onPick = { onSelectSecond(it); open = 0 },
            )
        }
    }
    ApexCard {
        when (overlay) {
            OverlayState.NeedsTwo -> ReasonPlaceholder(stringResource(R.string.trends_overlay_choose), ApexIcons.Info, size = ReasonSize.Medium)
            OverlayState.Loading -> SkeletonLineFill(height = 180.dp)
            is OverlayState.Ready -> {
                val a = overlay.primary
                val b = overlay.secondary
                DaySeriesChart(
                    title = stringResource(R.string.trends_overlay_title, a.series.label, b.series.label, range),
                    primary = a.series,
                    secondary = b.series,
                    startDay = a.startDay,
                    endDay = a.endDay,
                    selectedDay = selectedDay,
                    onSelectDay = onSelectDay,
                    provenance = overlay.provenance.takeIf { it.isNotBlank() },
                )
                overlay.missing.forEach { metric ->
                    Caption(
                        stringResource(R.string.trends_overlay_missing, stringResource(metricTitleRes(metric))),
                        Modifier.padding(top = ApexSpacing.xs),
                    )
                }
                val day = selectedDay?.takeIf { it in a.startDay..a.endDay }
                if (day == null) {
                    Caption(stringResource(R.string.trends_no_selection), Modifier.padding(top = ApexSpacing.xs))
                } else {
                    val label = dayLabel(day)
                    // One row per distinct screen: two figures that live on the same screen need one link only.
                    listOf(a.metric, b.metric).distinctBy { dayTargetOf(it) }.forEach { metric ->
                        val title = stringResource(metricTitleRes(metric))
                        LinkRow(
                            text = stringResource(R.string.trends_open_for, label, title),
                            description = stringResource(R.string.trends_open_for_cd, title, label),
                            onClick = { onOpenDay(dayTargetOf(metric), day) },
                        )
                    }
                }
                Caption(stringResource(R.string.trends_overlay_caption), Modifier.padding(top = ApexSpacing.sm))
            }
        }
    }
}

/** A row that shows the chosen figure and, when open, a list of figures to choose from (48 dp rows, "None" first). */
@Composable
private fun MetricPicker(
    label: String,
    selected: MetricType?,
    options: List<Pair<MetricType, Int>>,
    expanded: Boolean,
    onToggle: () -> Unit,
    onPick: (MetricType?) -> Unit,
) {
    val colors = ApexTheme.colors
    val chosen = selected?.let { stringResource(metricTitleRes(it)) } ?: stringResource(R.string.trends_pick_choose)
    Row(
        Modifier
            .fillMaxWidth()
            .apexClickable(onClick = onToggle, role = Role.Button)
            .heightIn(min = ApexSpacing.minTouch)
            .spoken(stringResource(R.string.trends_pick_cd, label, chosen)),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm),
    ) {
        Text(label.uppercase(), style = ApexTheme.type.statLabel, color = colors.foregroundSecondary, modifier = Modifier.weight(1f))
        Text(chosen, style = ApexTheme.type.bodyStrong, color = colors.foreground)
        Icon(
            if (expanded) ApexIcons.ChevronUp else ApexIcons.ChevronRight,
            contentDescription = null,
            modifier = Modifier.size(16.dp),
            tint = colors.foregroundSecondary,
        )
    }
    if (expanded) {
        Column(Modifier.fillMaxWidth()) {
            PickerOption(stringResource(R.string.trends_pick_none), selected == null) { onPick(null) }
            options.forEach { (metric, titleRes) ->
                PickerOption(stringResource(titleRes), metric == selected) { onPick(metric) }
            }
        }
    }
}

@Composable
private fun PickerOption(text: String, isSelected: Boolean, onClick: () -> Unit) {
    val colors = ApexTheme.colors
    val description = stringResource(R.string.trends_pick_option_cd, text)
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = ApexSpacing.minTouch)
            .selectable(selected = isSelected, role = Role.RadioButton, onClick = onClick)
            .semantics { contentDescription = description }
            .padding(start = ApexSpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text,
            style = if (isSelected) ApexTheme.type.bodyStrong else ApexTheme.type.body,
            color = if (isSelected) colors.foreground else colors.foregroundBody,
            modifier = Modifier.weight(1f),
        )
        if (isSelected) Icon(ApexIcons.Check, contentDescription = null, modifier = Modifier.size(16.dp), tint = colors.foreground)
    }
}

// --- Previews -------------------------------------------------------------------------------------

private const val PREVIEW_END = 20_400L

private fun previewSeries(metric: MetricType, label: String, base: Double, step: Double, suffix: String, gap: Int): SeriesUi {
    val points = (0 until 30).map { i -> ChartPoint(PREVIEW_END - 29 + i, if (i == gap) null else base + step * ((i * 7) % 11 - 5)) }
    return SeriesUi(metric, DaySeries(label, points, suffix, 0), PREVIEW_END - 29, PREVIEW_END, "Measured")
}

private fun previewGroups(): List<TrendGroupUi> {
    val sensor = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API
    return listOf(
        TrendGroupUi(
            com.apex.athlete.core.domain.MetricCategory.CARDIOVASCULAR, R.string.trends_group_cardio,
            listOf(
                TrendRowUi(MetricType.HRV_RMSSD, R.string.health_metric_hrv, MetricState.Value(66.0, 0, "ms", sensor, "Yesterday"), "Within your usual range"),
                TrendRowUi(MetricType.RESTING_HEART_RATE, R.string.health_metric_rhr, MetricState.Value(52.0, 0, "bpm", sensor), "Within your usual range"),
            ),
        ),
        TrendGroupUi(
            com.apex.athlete.core.domain.MetricCategory.ACTIVITY, R.string.trends_group_activity,
            listOf(TrendRowUi(MetricType.STEPS, R.string.health_metric_steps, MetricState.Value(8_412.0, 0, null, sensor), null)),
        ),
    )
}

@HealthThemePreviews
@Composable
private fun TrendsBrowserPreview() = HealthPreviewFrame {
    TrendsBrowserScreen(
        previewGroups(), false,
        OverlayState.Ready(
            previewSeries(MetricType.HRV_RMSSD, "HRV", 62.0, 3.0, " ms", 12),
            previewSeries(MetricType.RESTING_HEART_RATE, "Resting heart rate", 54.0, 1.0, " bpm", 7),
            emptyList(), "HRV: Measured. Resting heart rate: Measured",
        ),
        30, MetricType.HRV_RMSSD, MetricType.RESTING_HEART_RATE, PREVIEW_END - 4, { "Mon, Nov 9" },
        {}, {}, {}, {}, {}, { _, _ -> }, {},
    )
}

@HealthThemePreviews
@Composable
private fun TrendsBrowserChoosePreview() = HealthPreviewFrame {
    TrendsBrowserScreen(
        previewGroups(), false, OverlayState.NeedsTwo, 30, null, null, null, { "Mon, Nov 9" },
        {}, {}, {}, {}, {}, { _, _ -> }, {},
    )
}

@HealthThemePreviews
@Composable
private fun TrendsBrowserLoadingPreview() = HealthPreviewFrame {
    TrendsBrowserScreen(
        null, false, OverlayState.Loading, 30, MetricType.HRV_RMSSD, MetricType.STEPS, null, { "Mon, Nov 9" },
        {}, {}, {}, {}, {}, { _, _ -> }, {},
    )
}
