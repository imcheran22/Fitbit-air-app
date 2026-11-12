package com.apex.athlete.ui.sleep

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.SleepStage
import com.apex.athlete.core.ui.charts.ChartClock
import com.apex.athlete.core.ui.charts.HypnogramSegment
import com.apex.athlete.core.ui.charts.SleepHypnogramChart
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.ContributorRow
import com.apex.athlete.core.ui.components.ContributorStatus
import com.apex.athlete.core.ui.components.DatePill
import com.apex.athlete.core.ui.components.DialSize
import com.apex.athlete.core.ui.components.DialVariant
import com.apex.athlete.core.ui.components.InsightCard
import com.apex.athlete.core.ui.components.KeyStatRow
import com.apex.athlete.core.ui.components.ReasonPlaceholder
import com.apex.athlete.core.ui.components.ScoreDial
import com.apex.athlete.core.ui.components.StatusDashes
import com.apex.athlete.core.ui.components.provenanceLabelRes
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.shell.DetailShell
import com.apex.athlete.core.ui.shell.InfoCard
import com.apex.athlete.core.ui.shell.InfoParagraph
import com.apex.athlete.core.ui.shell.SectionShell
import com.apex.athlete.core.ui.components.MetricProvenance
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.state.MetricStateView
import com.apex.athlete.core.ui.theme.ApexShapes
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.core.ui.theme.ThemePreference
import com.apex.athlete.navigation.ApexNavigator
import com.apex.athlete.ui.common.ApexFormatter
import com.apex.athlete.ui.common.LocalFormatter
import com.apex.athlete.ui.common.MetricStateMapper
import com.apex.athlete.ui.common.apexViewModel
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset

@Composable
fun SleepRoute(navigator: ApexNavigator, day: LocalDate, onDayChange: (LocalDate) -> Unit) {
    val vm = apexViewModel { container, handle -> SleepViewModel(container.repository, handle) }
    LaunchedEffect(day) { vm.setDay(day.toEpochDay()) }
    val load by vm.state.collectAsStateWithLifecycle()
    val formatter = LocalFormatter.current
    val mapper = remember(formatter) { MetricStateMapper(formatter) }
    val ui = remember(load, mapper) { (load as? SleepLoad.Ready)?.let { buildSleepUi(it.detail, mapper) } }
    SleepScreen(
        title = formatter.dayLabel(day),
        canGoNext = day < formatter.today(),
        ui = ui,
        failed = load is SleepLoad.Failed,
        onBack = navigator::back,
        onPrevious = { onDayChange(day.minusDays(1)) },
        onNext = { onDayChange(day.plusDays(1)) },
    )
}

/** Stateless screen: [ui] null means still loading. */
@Composable
fun SleepScreen(
    title: String,
    canGoNext: Boolean,
    ui: SleepUi?,
    failed: Boolean,
    onBack: () -> Unit,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
) {
    var showInfo by rememberSaveable { mutableStateOf(false) }
    val heroState = when {
        failed -> MetricState.Error()
        ui == null -> MetricState.Loading
        else -> ui.score
    }
    val insightUi = ui?.insight
    DetailShell(
        title = title,
        onBack = onBack,
        backDescription = stringResource(R.string.common_back),
        onInfo = { showInfo = true },
        infoDescription = stringResource(R.string.sleep_info_description),
        banner = {
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                DatePill(
                    label = title,
                    onPrevious = onPrevious,
                    onNext = onNext,
                    onLabelClick = {},
                    canGoNext = canGoNext,
                    previousDescription = stringResource(R.string.sleep_prev_day),
                    nextDescription = stringResource(R.string.sleep_next_day),
                )
            }
        },
        hero = {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                ScoreDial(
                    state = heroState,
                    variant = DialVariant.Sleep,
                    size = DialSize.Hero,
                    label = stringResource(R.string.sleep_dial_label),
                )
                val status = ui?.scoreStatus
                if (status != null) StatusMarkers(status)
            }
        },
        insight = if (insightUi != null) {
            { InsightCard(text = insightText(insightUi), provenance = DataProvenance.MATHEMATICALLY_DERIVED) }
        } else {
            null
        },
        primary = {
            if (failed) ApexCard { ReasonPlaceholder(stringResource(R.string.sleep_error), ApexIcons.Warning) }
            SummaryCard(ui)
            if (ui != null && ui.hasSession) StagesCard(ui)
        },
        secondary = {
            if (ui != null) {
                SectionShell(stringResource(R.string.sleep_need_title)) { NeedCard(ui) }
                SectionShell(stringResource(R.string.sleep_details_title)) { DetailsCard(ui) }
                SectionShell(stringResource(R.string.sleep_tonight_title)) { TonightCard(ui) }
            }
            HowLink(onClick = { showInfo = true })
        },
    )
    if (showInfo) {
        InfoCard(
            title = stringResource(R.string.sleep_how_title),
            onDismiss = { showInfo = false },
            dismissLabel = stringResource(R.string.sleep_how_close),
        ) {
            InfoParagraph(stringResource(R.string.sleep_how_p1))
            InfoParagraph(stringResource(R.string.sleep_how_p2))
            InfoParagraph(stringResource(R.string.sleep_how_p3))
            InfoParagraph(stringResource(R.string.sleep_how_p4))
        }
    }
}

@StringRes
private fun statusWord(status: ContributorStatus): Int = when (status) {
    ContributorStatus.Poor -> com.apex.athlete.core.ui.R.string.status_poor
    ContributorStatus.Sufficient -> com.apex.athlete.core.ui.R.string.status_sufficient
    ContributorStatus.Optimal -> com.apex.athlete.core.ui.R.string.status_optimal
}

/** The Poor / Sufficient / Optimal dashes under the hero dial, with the active word so colour is not the only carrier. */
@Composable
private fun StatusMarkers(status: ContributorStatus) {
    val word = stringResource(statusWord(status))
    val spoken = stringResource(R.string.sleep_status_cd, word)
    Row(
        Modifier.semantics(mergeDescendants = true) { contentDescription = spoken },
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        StatusDashes(status)
        Text(word.uppercase(), style = ApexTheme.type.statLabel, color = ApexTheme.colors.foregroundSecondary)
    }
}

@Composable
private fun insightText(insight: SleepInsightUi): String {
    val formatter = LocalFormatter.current
    val base = if (insight.sufficient) {
        stringResource(R.string.sleep_insight_sufficient)
    } else {
        stringResource(R.string.sleep_insight_short, formatter.duration(insight.deficitMinutes))
    }
    val spread = insight.bedtimeSpreadMinutes ?: return base
    return base + " " + stringResource(R.string.sleep_insight_consistency, formatter.duration(spread))
}

@Composable
private fun SummaryCard(ui: SleepUi?) {
    val formatter = LocalFormatter.current
    ApexCard(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp)) {
        if (ui == null) {
            listOf(R.string.sleep_row_hours, R.string.sleep_row_consistency, R.string.sleep_row_efficiency, R.string.sleep_row_restorative)
                .forEach { ContributorRow(stringResource(it), MetricState.Loading) }
            return@ApexCard
        }
        val hoursDetail = if (ui.hours.state is MetricState.Value && ui.asleepMinutes != null && ui.neededMinutes != null) {
            stringResource(R.string.sleep_detail_hours, formatter.duration(ui.asleepMinutes), formatter.duration(ui.neededMinutes))
        } else {
            null
        }
        ContributorRow(
            label = stringResource(R.string.sleep_row_hours),
            state = ui.hours.state,
            icon = ApexIcons.Moon,
            status = ui.hours.status,
            detail = hoursDetail,
        )
        ContributorRow(
            label = stringResource(R.string.sleep_row_consistency),
            state = ui.consistency.state,
            icon = ApexIcons.Sync,
            status = ui.consistency.status,
            detail = when {
                ui.consistency.state is MetricState.Value && ui.bedtimeSpreadMinutes != null ->
                    stringResource(R.string.sleep_detail_consistency, formatter.duration(ui.bedtimeSpreadMinutes))
                ui.consistency.state is MetricState.Calibrating -> stringResource(R.string.sleep_detail_consistency_needs)
                else -> null
            },
        )
        ContributorRow(
            label = stringResource(R.string.sleep_row_efficiency),
            state = ui.efficiency.state,
            icon = ApexIcons.Check,
            status = ui.efficiency.status,
            detail = if (ui.efficiency.state is MetricState.Value) stringResource(R.string.sleep_detail_efficiency) else null,
        )
        ContributorRow(
            label = stringResource(R.string.sleep_row_restorative),
            state = ui.restorative.state,
            icon = ApexIcons.Pulse,
            status = ui.restorative.status,
            detail = when {
                ui.restorative.state is MetricState.Value -> stringResource(R.string.sleep_detail_restorative)
                ui.hasSession && !ui.hasStageDetail -> stringResource(R.string.sleep_detail_no_stages)
                else -> null
            },
        )
        Legend()
    }
}

/** "Poor, Sufficient, Optimal" legend strip under the summary rows. */
@Composable
private fun Legend() {
    val colors = ApexTheme.colors
    val spoken = stringResource(R.string.sleep_legend_cd)
    Row(
        Modifier.fillMaxWidth().padding(vertical = 12.dp).semantics(mergeDescendants = true) { contentDescription = spoken },
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ContributorStatus.entries.forEach { s ->
            val tint = when (s) {
                ContributorStatus.Poor -> colors.warning
                ContributorStatus.Sufficient -> colors.foregroundSecondary
                ContributorStatus.Optimal -> colors.optimal
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(width = 16.dp, height = 4.dp).background(tint, ApexShapes.bar))
                Text(stringResource(statusWord(s)), style = ApexTheme.type.caption, color = colors.mutedForeground)
            }
        }
    }
}

@StringRes
private fun stageNameRes(stage: SleepStage): Int = when (stage) {
    SleepStage.DEEP -> R.string.sleep_stage_deep
    SleepStage.REM -> R.string.sleep_stage_rem
    SleepStage.LIGHT -> R.string.sleep_stage_light
    else -> R.string.sleep_stage_awake
}

@Composable
private fun StagesCard(ui: SleepUi) {
    val formatter = LocalFormatter.current
    val colors = ApexTheme.colors
    // Clock labels follow the offset the night began in and the owner's 12 or 24 hour setting.
    val zone: ZoneId = remember(ui.zoneOffsetSeconds) {
        ui.zoneOffsetSeconds?.let { ZoneOffset.ofTotalSeconds(it) } ?: ZoneId.systemDefault()
    }
    val clock = remember(zone, formatter.clock24h) { ChartClock(zone, formatter.clock24h) }
    val provenance = ui.sessionProvenance?.let { stringResource(provenanceLabelRes(it)) }
    SectionShell(stringResource(R.string.sleep_stages_title)) {
        ApexCard {
            SleepHypnogramChart(segments = ui.segments, clock = clock, provenance = provenance)
            Text(
                stringResource(R.string.sleep_attribution_note),
                style = ApexTheme.type.caption,
                color = colors.mutedForeground,
                modifier = Modifier.padding(top = 8.dp),
            )
        }
        if (ui.hasStageDetail) {
            ApexCard(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp)) {
                ui.stageRows.forEach { row ->
                    val state: MetricState = when {
                        row.percentOfAsleep != null -> MetricState.Value(row.percentOfAsleep, 0, "%", DataProvenance.MATHEMATICALLY_DERIVED)
                        row.stage == SleepStage.AWAKE && row.minutes != null ->
                            MetricState.Value(row.minutes.toDouble(), 0, "min", ui.sessionProvenance)
                        else -> MetricState.Unavailable(MetricReason.NO_DATA)
                    }
                    ContributorRow(
                        label = stringResource(stageNameRes(row.stage)),
                        state = state,
                        detail = if (row.stage != SleepStage.AWAKE) row.minutes?.let { formatter.duration(it.toDouble()) } else null,
                    )
                }
            }
        }
    }
}

private fun hoursState(minutes: Double): MetricState =
    MetricState.Value(minutes / 60.0, 1, "h", DataProvenance.MATHEMATICALLY_DERIVED)

@Composable
private fun NeedCard(ui: SleepUi) {
    ApexCard(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)) {
        KeyStatRow(stringResource(R.string.sleep_need_base), hoursState(ui.need.baseMinutes))
        KeyStatRow(stringResource(R.string.sleep_need_strain), hoursState(ui.need.strainMinutes))
        KeyStatRow(stringResource(R.string.sleep_need_debt), hoursState(ui.need.debtMinutes))
        KeyStatRow(stringResource(R.string.sleep_need_total), hoursState(ui.need.totalMinutes))
        Text(
            stringResource(if (ui.need.usesDefaultBase) R.string.sleep_need_default_base else R.string.sleep_need_personal_base),
            style = ApexTheme.type.caption,
            color = ApexTheme.colors.mutedForeground,
            modifier = Modifier.padding(vertical = 8.dp),
        )
    }
}

@Composable
private fun DetailsCard(ui: SleepUi) {
    ApexCard(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)) {
        KeyStatRow(stringResource(R.string.sleep_detail_in_bed), ui.timeInBed, icon = ApexIcons.Moon)
        KeyStatRow(stringResource(R.string.sleep_detail_latency), ui.latency, icon = ApexIcons.Hourglass)
        KeyStatRow(stringResource(R.string.sleep_detail_wake_bouts), ui.wakeBouts, icon = ApexIcons.Bolt)
        Text(
            stringResource(R.string.sleep_detail_wake_bouts_note),
            style = ApexTheme.type.caption,
            color = ApexTheme.colors.mutedForeground,
            modifier = Modifier.padding(vertical = 8.dp),
        )
    }
}

@Composable
private fun TonightCard(ui: SleepUi) {
    ApexCard(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)) {
        KeyStatRow(stringResource(R.string.sleep_tonight_need), hoursState(ui.needTonightMinutes), icon = ApexIcons.Moon)
        ClockRow(stringResource(R.string.sleep_tonight_bedtime), ui.suggestedBedtimeMinute)
        ClockRow(stringResource(R.string.sleep_tonight_wake), ui.usualWakeMinute)
        Text(
            stringResource(R.string.sleep_tonight_note),
            style = ApexTheme.type.caption,
            color = ApexTheme.colors.mutedForeground,
            modifier = Modifier.padding(vertical = 8.dp),
        )
    }
}

/** A time of day as a metric: the clock time when known, otherwise `--` with the reason. */
@Composable
private fun ClockRow(label: String, minuteOfDay: Int?) {
    val formatter = LocalFormatter.current
    val colors = ApexTheme.colors
    val state: MetricState = if (minuteOfDay == null) {
        MetricState.Unavailable(MetricReason.NO_DATA, stringResource(R.string.sleep_tonight_needs_history))
    } else {
        MetricState.Value(minuteOfDay.toDouble(), 0, null, DataProvenance.MATHEMATICALLY_DERIVED)
    }
    val clockText = formatter.clockTime(minuteOfDay)
    Column(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp)
            .semantics(mergeDescendants = true) { contentDescription = "$label: $clockText" },
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(label.uppercase(), style = ApexTheme.type.statLabel, color = colors.foreground)
        MetricStateView(state, label = label) {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(clockText, style = ApexTheme.type.statValue, color = colors.foreground)
                MetricProvenance(it)
            }
        }
    }
}

@Composable
private fun HowLink(onClick: () -> Unit) {
    val label = stringResource(R.string.sleep_how_link)
    ApexCard(onClick = onClick, spokenDescription = label, contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Icon(ApexIcons.Info, null, Modifier.size(20.dp), tint = ApexTheme.colors.mutedForeground)
            Text(label.uppercase(), style = ApexTheme.type.statLabel, color = ApexTheme.colors.foreground, modifier = Modifier.weight(1f))
            Icon(ApexIcons.ChevronRight, null, Modifier.size(16.dp), tint = ApexTheme.colors.mutedForeground)
        }
    }
}

// --- Previews -----------------------------------------------------------------------------------

private fun previewUi(): SleepUi {
    val derived = DataProvenance.MATHEMATICALLY_DERIVED
    val source = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API
    val start = 1_700_000_000_000L
    val min = 60_000L
    return SleepUi(
        score = MetricState.Value(84.0, 0, "%", derived),
        scoreStatus = ContributorStatus.Sufficient,
        hours = SleepRowUi(MetricState.Value(7.2, 1, "h", source), ContributorStatus.Sufficient),
        asleepMinutes = 432.0,
        neededMinutes = 504.0,
        consistency = SleepRowUi(MetricState.Value(71.0, 0, "%", derived), ContributorStatus.Sufficient),
        bedtimeSpreadMinutes = 70.0,
        efficiency = SleepRowUi(MetricState.Value(93.0, 0, "%", derived), ContributorStatus.Optimal),
        restorative = SleepRowUi(MetricState.Value(42.0, 0, "%", derived), ContributorStatus.Poor),
        hasSession = true,
        hasStageDetail = true,
        segments = listOf(
            HypnogramSegment(start, start + 90 * min, SleepStage.LIGHT),
            HypnogramSegment(start + 90 * min, start + 150 * min, SleepStage.DEEP),
            HypnogramSegment(start + 150 * min, start + 180 * min, SleepStage.REM),
            HypnogramSegment(start + 195 * min, start + 300 * min, SleepStage.LIGHT),
        ),
        zoneOffsetSeconds = 0,
        stageRows = listOf(
            StageRowUi(SleepStage.DEEP, 20.0, 86),
            StageRowUi(SleepStage.REM, 22.0, 95),
            StageRowUi(SleepStage.LIGHT, 58.0, 251),
            StageRowUi(SleepStage.AWAKE, null, 31),
        ),
        timeInBed = MetricState.Value(7.7, 1, "h", source),
        latency = MetricState.Value(12.0, 0, "min", source),
        wakeBouts = MetricState.Unavailable(MetricReason.NO_DATA),
        need = NeedUi(465.0, 24.0, 15.0, 504.0, usesDefaultBase = true),
        needTonightMinutes = 500.0,
        suggestedBedtimeMinute = 22 * 60 + 10,
        usualWakeMinute = null,
        insight = SleepInsightUi(sufficient = false, deficitMinutes = 72.0, bedtimeSpreadMinutes = 70.0),
        sessionProvenance = source,
    )
}

@Composable
private fun PreviewBody(dark: Boolean) {
    ApexTheme(if (dark) ThemePreference.DARK else ThemePreference.LIGHT) {
        CompositionLocalProvider(LocalFormatter provides ApexFormatter(LocalContext.current)) {
            Box(Modifier.background(ApexTheme.colors.background)) {
                SleepScreen("Today", false, previewUi(), false, {}, {}, {})
            }
        }
    }
}

@Preview(name = "Sleep dark", heightDp = 2200)
@Composable
private fun SleepPreviewDark() = PreviewBody(dark = true)

@Preview(name = "Sleep light", heightDp = 2200)
@Composable
private fun SleepPreviewLight() = PreviewBody(dark = false)
