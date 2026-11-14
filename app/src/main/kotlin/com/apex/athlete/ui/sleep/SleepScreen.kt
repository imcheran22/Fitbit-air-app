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
import com.apex.athlete.core.analytics.sleep.DipCategory
import com.apex.athlete.core.analytics.sleep.SleepComponent
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
import com.apex.athlete.core.ui.components.ChipTone
import com.apex.athlete.core.ui.components.Tag
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
import com.apex.athlete.ui.nap.NapsSectionRoute
import com.apex.athlete.ui.research.ResearchNote
import com.apex.athlete.ui.research.SleepResearchUi
import com.apex.athlete.ui.research.withReason
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
        napsSection = { NapsSectionRoute(navigator, day) },
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
    /** The day's naps; the route supplies it so this screen stays a pure function of [ui]. */
    napsSection: (@Composable () -> Unit)? = null,
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
            PartsCard(ui)
            if (ui != null && ui.hasSession) StagesCard(ui)
        },
        secondary = {
            if (ui != null) {
                SectionShell(stringResource(R.string.sleep_need_title)) { NeedCard(ui) }
                SectionShell(stringResource(R.string.sleep_timing_title)) { TimingCard(ui) }
                SectionShell(stringResource(R.string.sleep_patterns_title)) { PatternsCard(ui) }
                SectionShell(stringResource(R.string.sleep_details_title)) { DetailsCard(ui) }
                SectionShell(stringResource(R.string.sleep_tonight_title)) { TonightCard(ui) }
            }
            napsSection?.invoke()
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
            InfoParagraph(stringResource(R.string.sleep_how_p5))
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

@StringRes
private fun partNameRes(c: SleepComponent): Int = when (c) {
    SleepComponent.DURATION -> R.string.sleep_part_duration
    SleepComponent.RESTORATION -> R.string.sleep_part_restoration
    SleepComponent.QUALITY -> R.string.sleep_part_quality
    SleepComponent.EFFICIENCY -> R.string.sleep_part_efficiency
    SleepComponent.CONSISTENCY -> R.string.sleep_part_consistency
}

private fun partIcon(c: SleepComponent) = when (c) {
    SleepComponent.DURATION -> ApexIcons.Moon
    SleepComponent.RESTORATION -> ApexIcons.Heart
    SleepComponent.QUALITY -> ApexIcons.Pulse
    SleepComponent.EFFICIENCY -> ApexIcons.Check
    SleepComponent.CONSISTENCY -> ApexIcons.Sync
}

@StringRes
private fun driverRes(d: RestorationDriverUi): Int = when (d.signal) {
    RestorationSignal.SLEEPING_HEART_RATE -> when (d.vsUsual) {
        VsUsual.LOWER -> R.string.sleep_driver_hr_lower
        VsUsual.SIMILAR -> R.string.sleep_driver_hr_similar
        VsUsual.HIGHER -> R.string.sleep_driver_hr_higher
    }
    RestorationSignal.HRV -> when (d.vsUsual) {
        VsUsual.LOWER -> R.string.sleep_driver_hrv_lower
        VsUsual.SIMILAR -> R.string.sleep_driver_hrv_similar
        VsUsual.HIGHER -> R.string.sleep_driver_hrv_higher
    }
    RestorationSignal.BREATHING_RATE -> when (d.vsUsual) {
        VsUsual.LOWER -> R.string.sleep_driver_br_lower
        VsUsual.SIMILAR -> R.string.sleep_driver_br_similar
        VsUsual.HIGHER -> R.string.sleep_driver_br_higher
    }
}

@Composable
private fun partWhy(part: SleepPartUi, ui: SleepUi): String {
    val formatter = LocalFormatter.current
    return when (part.component) {
        SleepComponent.DURATION ->
            if (ui.asleepMinutes != null && ui.targetMinutes != null) {
                stringResource(R.string.sleep_part_duration_why, formatter.duration(ui.asleepMinutes), formatter.duration(ui.targetMinutes))
            } else {
                stringResource(R.string.sleep_part_duration_why_unknown)
            }
        SleepComponent.RESTORATION -> {
            val base = stringResource(R.string.sleep_part_restoration_why)
            val drivers = part.drivers.map { stringResource(driverRes(it)) }
            if (drivers.isEmpty()) base else base + " " + drivers.joinToString("; ") + "."
        }
        SleepComponent.QUALITY -> stringResource(R.string.sleep_part_quality_why)
        SleepComponent.EFFICIENCY -> stringResource(R.string.sleep_part_efficiency_why)
        SleepComponent.CONSISTENCY -> {
            val base = stringResource(R.string.sleep_part_consistency_why)
            val spread = ui.bedtimeSpreadMinutes
            if (spread != null) base + " " + stringResource(R.string.sleep_insight_consistency, formatter.duration(spread)) else base
        }
    }
}

/** The five score parts as contribution rows, plus the partial-score hint when the score is not fully backed by data. */
@Composable
private fun PartsCard(ui: SleepUi?) {
    ApexCard(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp)) {
        if (ui == null) {
            SleepComponent.entries.forEach { ContributorRow(stringResource(partNameRes(it)), MetricState.Loading) }
            return@ApexCard
        }
        val partial = ui.partial
        if (partial != null) PartialHint(partial)
        ui.parts.forEach { part ->
            val reason = part.missingReasonRes?.let { stringResource(it) }
            val state = if (reason != null) MetricState.Unavailable(MetricReason.NO_DATA, reason) else part.state
            val detail = if (part.weightPercent != null) {
                stringResource(
                    R.string.sleep_part_line,
                    stringResource(R.string.sleep_part_weight, part.weightPercent),
                    partWhy(part, ui),
                )
            } else {
                null
            }
            ContributorRow(
                label = stringResource(partNameRes(part.component)),
                state = state,
                icon = partIcon(part.component),
                status = part.status,
                points = part.points,
                detail = detail,
            )
        }
        Legend()
    }
}

@Composable
private fun PartialHint(partial: PartialScoreUi) {
    val colors = ApexTheme.colors
    val title = stringResource(R.string.sleep_partial_title, partial.availableParts)
    val lines = partial.missing.map {
        stringResource(R.string.sleep_partial_missing, stringResource(partNameRes(it)), stringResource(missingPartReasonRes(it)))
    }
    val note = stringResource(R.string.sleep_partial_note)
    val spoken = (listOf(title) + lines + note).joinToString(". ")
    Column(
        Modifier.fillMaxWidth().padding(vertical = 12.dp).semantics(mergeDescendants = true) { contentDescription = spoken },
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(title, style = ApexTheme.type.statLabel, color = colors.foreground)
        lines.forEach { Text(it, style = ApexTheme.type.caption, color = colors.mutedForeground) }
        Text(note, style = ApexTheme.type.caption, color = colors.mutedForeground)
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
        KeyStatRow(
            stringResource(R.string.sleep_need_debt),
            if (ui.need.debtKnown) hoursState(ui.need.debtMinutes) else MetricState.Calibrating(null),
        )
        KeyStatRow(stringResource(R.string.sleep_need_total), hoursState(ui.need.totalMinutes))
        KeyStatRow(stringResource(R.string.sleep_debt_row), ui.debt)
        if (ui.debt is MetricState.Calibrating) {
            Text(
                stringResource(R.string.sleep_debt_needs),
                style = ApexTheme.type.caption,
                color = ApexTheme.colors.mutedForeground,
                modifier = Modifier.padding(vertical = 4.dp),
            )
        }
        // Secondary line: shortfall against the 7 h guideline, a different figure from the personal debt above.
        KeyStatRow(
            if (ui.research.shortfallMissingNights > 0 && ui.research.shortfall is MetricState.Value) {
                stringResource(R.string.sleep_shortfall_row_partial, ui.research.shortfallValidNights)
            } else {
                stringResource(R.string.sleep_shortfall_row)
            },
            ui.research.shortfall.withReason(R.string.sleep_shortfall_missing),
        )
        ResearchNote(stringResource(R.string.sleep_shortfall_note))
        if (ui.research.shortfall is MetricState.Value && ui.research.shortfallMissingNights > 0) {
            ResearchNote(stringResource(R.string.sleep_shortfall_missing_nights, ui.research.shortfallMissingNights))
        }
        Text(
            stringResource(if (ui.need.usesDefaultBase) R.string.sleep_need_default_base else R.string.sleep_need_personal_base),
            style = ApexTheme.type.caption,
            color = ApexTheme.colors.mutedForeground,
            modifier = Modifier.padding(vertical = 8.dp),
        )
    }
}

/** The sleeping heart-rate dip: context, never a diagnosis. */
@Composable
private fun PatternsCard(ui: SleepUi) {
    val colors = ApexTheme.colors
    val dipState = if (ui.hrDip.missingReasonRes != null) {
        MetricState.Unavailable(MetricReason.NO_DATA, stringResource(ui.hrDip.missingReasonRes))
    } else {
        ui.hrDip.state
    }
    ApexCard(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)) {
        KeyStatRow(stringResource(R.string.sleep_dip_row), dipState, icon = ApexIcons.Heart)
        val category = ui.hrDip.category
        if (category != null && dipState is MetricState.Value) {
            Tag(stringResource(dipCategoryRes(category)), tone = dipTone(category))
        }
        Text(
            stringResource(R.string.sleep_dip_note),
            style = ApexTheme.type.caption,
            color = colors.mutedForeground,
            modifier = Modifier.padding(vertical = 8.dp),
        )
    }
}

/** Midpoint, its 7-night variability, raw Sleep Regularity Index, WASO and awakenings per hour. Descriptive, never a diagnosis. */
@Composable
private fun TimingCard(ui: SleepUi) {
    val r = ui.research
    ApexCard(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)) {
        ClockRow(stringResource(R.string.sleep_midpoint_row), r.midpointMinute, R.string.sleep_midpoint_missing)
        KeyStatRow(stringResource(R.string.sleep_midpoint_sd_row), r.midpointSd.withReason(R.string.sleep_midpoint_sd_missing), icon = ApexIcons.Moon)
        val nights = r.midpointSdNights
        if (nights != null && r.midpointSd is MetricState.Value) ResearchNote(stringResource(R.string.sleep_midpoint_sd_nights, nights))
        KeyStatRow(stringResource(R.string.sleep_regularity_row), ui.regularity, icon = ApexIcons.Sync)
        ResearchNote(
            stringResource(
                if (ui.regularity is MetricState.Calibrating) R.string.sleep_regularity_needs else R.string.sleep_regularity_note,
            ),
        )
        KeyStatRow(stringResource(R.string.sleep_waso_row), r.waso.withReason(R.string.sleep_waso_missing), icon = ApexIcons.Hourglass)
        KeyStatRow(
            stringResource(R.string.sleep_awakenings_row),
            r.awakeningsPerHour.withReason(R.string.sleep_awakenings_missing),
            icon = ApexIcons.Bolt,
        )
        ResearchNote(stringResource(R.string.sleep_timing_note), Modifier.padding(vertical = 4.dp))
    }
}

@StringRes
private fun dipCategoryRes(category: DipCategory): Int = when (category) {
    DipCategory.DIPPER -> R.string.sleep_dip_dipper
    DipCategory.BLUNTED -> R.string.sleep_dip_blunted
    DipCategory.REVERSED -> R.string.sleep_dip_reversed
}

private fun dipTone(category: DipCategory): ChipTone = when (category) {
    DipCategory.DIPPER -> ChipTone.OPTIMAL
    DipCategory.BLUNTED -> ChipTone.NEUTRAL
    DipCategory.REVERSED -> ChipTone.WARNING
}

@Composable
private fun DetailsCard(ui: SleepUi) {
    ApexCard(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)) {
        KeyStatRow(stringResource(R.string.sleep_detail_in_bed), ui.timeInBed, icon = ApexIcons.Moon)
        KeyStatRow(stringResource(R.string.sleep_detail_latency_reported), ui.latency, icon = ApexIcons.Hourglass)
        if (ui.latency is MetricState.Value) {
            Text(
                stringResource(if (ui.latencyNotMeasured) R.string.sleep_latency_not_measured else R.string.sleep_latency_note),
                style = ApexTheme.type.caption,
                color = ApexTheme.colors.mutedForeground,
                modifier = Modifier.padding(vertical = 4.dp),
            )
        }
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
private fun ClockRow(label: String, minuteOfDay: Int?, @StringRes missingRes: Int = R.string.sleep_tonight_needs_history) {
    val formatter = LocalFormatter.current
    val colors = ApexTheme.colors
    val state: MetricState = if (minuteOfDay == null) {
        MetricState.Unavailable(MetricReason.NO_DATA, stringResource(missingRes))
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
        parts = listOf(
            SleepPartUi(SleepComponent.DURATION, MetricState.Value(86.0, 0, null, derived), ContributorStatus.Poor, 35, 30.1, null),
            SleepPartUi(
                SleepComponent.RESTORATION, MetricState.Value(88.0, 0, null, derived), ContributorStatus.Optimal, 25, 22.0, null,
                listOf(
                    RestorationDriverUi(RestorationSignal.SLEEPING_HEART_RATE, VsUsual.LOWER),
                    RestorationDriverUi(RestorationSignal.HRV, VsUsual.HIGHER),
                    RestorationDriverUi(RestorationSignal.BREATHING_RATE, VsUsual.SIMILAR),
                ),
            ),
            SleepPartUi(SleepComponent.QUALITY, MetricState.Value(80.0, 0, null, derived), ContributorStatus.Sufficient, 15, 12.0, null),
            SleepPartUi(SleepComponent.EFFICIENCY, MetricState.Value(93.0, 0, null, derived), ContributorStatus.Optimal, 15, 14.0, null),
            SleepPartUi(
                SleepComponent.CONSISTENCY, MetricState.Unavailable(MetricReason.NO_DATA), null, null, null,
                R.string.sleep_part_missing_consistency,
            ),
        ),
        partial = PartialScoreUi(4, listOf(SleepComponent.CONSISTENCY)),
        asleepMinutes = 432.0,
        targetMinutes = 504.0,
        bedtimeSpreadMinutes = 70.0,
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
        latency = MetricState.Value(0.0, 0, "min", source),
        latencyNotMeasured = true,
        wakeBouts = MetricState.Unavailable(MetricReason.NO_DATA),
        need = NeedUi(465.0, 24.0, 15.0, 504.0, usesDefaultBase = true),
        needTonightMinutes = 500.0,
        suggestedBedtimeMinute = 22 * 60 + 10,
        usualWakeMinute = null,
        insight = SleepInsightUi(sufficient = false, deficitMinutes = 72.0, bedtimeSpreadMinutes = 70.0),
        sessionProvenance = source,
        regularity = MetricState.Value(82.0, 0, null, derived),
        hrDip = HrDipUi(MetricState.Value(11.4, 1, "%", derived), DipCategory.DIPPER, null),
        debt = MetricState.Calibrating(null),
        research = SleepResearchUi(
            shortfall = MetricState.Value(1.4, 1, "h", derived),
            shortfallMissingNights = 1,
            shortfallValidNights = 6,
            midpointMinute = 3 * 60 + 20,
            midpointSd = MetricState.Value(38.0, 0, "min", derived),
            midpointSdNights = 6,
            waso = MetricState.Unavailable(MetricReason.NO_DATA),
            awakeningsPerHour = MetricState.Value(1.2, 1, "/h", derived),
        ),
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

@Preview(name = "Sleep dark", heightDp = 2800)
@Composable
private fun SleepPreviewDark() = PreviewBody(dark = true)

@Preview(name = "Sleep light", heightDp = 2800)
@Composable
private fun SleepPreviewLight() = PreviewBody(dark = false)
