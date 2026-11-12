package com.apex.athlete.ui.recovery

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
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
import com.apex.athlete.core.analytics.recovery.FatigueLevel
import com.apex.athlete.core.analytics.recovery.RecoveryComponent
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.ChipTone
import com.apex.athlete.core.ui.components.DatePill
import com.apex.athlete.core.ui.components.DialSize
import com.apex.athlete.core.ui.components.DialVariant
import com.apex.athlete.core.ui.components.DriverItem
import com.apex.athlete.core.ui.components.DriverList
import com.apex.athlete.core.ui.components.GoodDirection
import com.apex.athlete.core.ui.components.InsightCard
import com.apex.athlete.core.ui.components.KeyStatRow
import com.apex.athlete.core.ui.components.ProvenanceLabel
import com.apex.athlete.core.ui.components.ReasonPlaceholder
import com.apex.athlete.core.ui.components.ScoreDial
import com.apex.athlete.core.ui.components.Tag
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.shell.DetailShell
import com.apex.athlete.core.ui.shell.InfoCard
import com.apex.athlete.core.ui.shell.InfoParagraph
import com.apex.athlete.core.ui.shell.SectionShell
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.theme.ApexShapes
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.core.ui.theme.ThemePreference
import com.apex.athlete.navigation.ApexNavigator
import com.apex.athlete.ui.common.ApexFormatter
import com.apex.athlete.ui.common.LocalFormatter
import com.apex.athlete.ui.common.MetricStateMapper
import com.apex.athlete.ui.common.apexViewModel
import java.time.LocalDate

@Composable
fun RecoveryRoute(navigator: ApexNavigator, day: LocalDate, onDayChange: (LocalDate) -> Unit) {
    val vm = apexViewModel { container, handle -> RecoveryViewModel(container.repository, handle) }
    LaunchedEffect(day) { vm.setDay(day.toEpochDay()) }
    val load by vm.state.collectAsStateWithLifecycle()
    val formatter = LocalFormatter.current
    val mapper = remember(formatter) { MetricStateMapper(formatter) }
    val ui = remember(load, mapper) { (load as? RecoveryLoad.Ready)?.let { buildRecoveryUi(it.detail, mapper) } }
    RecoveryScreen(
        title = formatter.dayLabel(day),
        canGoNext = day < formatter.today(),
        ui = ui,
        failed = load is RecoveryLoad.Failed,
        onBack = navigator::back,
        onPrevious = { onDayChange(day.minusDays(1)) },
        onNext = { onDayChange(day.plusDays(1)) },
        onOpenTrend = navigator::openTrend,
    )
}

/** Stateless screen: [ui] null means still loading. */
@Composable
fun RecoveryScreen(
    title: String,
    canGoNext: Boolean,
    ui: RecoveryUi?,
    failed: Boolean,
    onBack: () -> Unit,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onOpenTrend: (MetricType) -> Unit,
) {
    var showInfo by rememberSaveable { mutableStateOf(false) }
    val heroState = when {
        failed -> MetricState.Error()
        ui == null -> MetricState.Loading
        else -> ui.recovery
    }
    DetailShell(
        title = title,
        onBack = onBack,
        backDescription = stringResource(R.string.common_back),
        onInfo = { showInfo = true },
        infoDescription = stringResource(R.string.recovery_info_description),
        banner = {
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                DatePill(
                    label = title,
                    onPrevious = onPrevious,
                    onNext = onNext,
                    onLabelClick = {},
                    canGoNext = canGoNext,
                    previousDescription = stringResource(R.string.recovery_prev_day),
                    nextDescription = stringResource(R.string.recovery_next_day),
                )
            }
        },
        hero = {
            ScoreDial(
                state = heroState,
                variant = DialVariant.Recovery,
                size = DialSize.Hero,
                label = stringResource(R.string.recovery_dial_label),
            )
        },
        insight = if (ui != null) {
            { InsightCard(text = insightText(ui.insight), provenance = DataProvenance.MATHEMATICALLY_DERIVED) }
        } else {
            null
        },
        primary = {
            if (failed) {
                ApexCard { ReasonPlaceholder(stringResource(R.string.recovery_error), ApexIcons.Warning) }
            }
            StatsCard(ui, onOpenTrend)
            if (ui != null) {
                FatigueCard(ui.fatigue)
                if (ui.calibration.isNotEmpty()) CalibrationCard(ui.calibration)
            }
        },
        secondary = {
            if (ui != null) {
                SectionShell(stringResource(R.string.recovery_drivers_title)) {
                    DriverList(
                        items = ui.drivers.map { DriverItem(it.component.name, componentLabel(it.component), it.points) },
                        unit = stringResource(R.string.recovery_drivers_unit),
                        emptyText = stringResource(R.string.recovery_drivers_empty),
                    )
                }
            }
            HowLink(onClick = { showInfo = true })
        },
    )
    if (showInfo) {
        InfoCard(
            title = stringResource(R.string.recovery_how_title),
            onDismiss = { showInfo = false },
            dismissLabel = stringResource(R.string.recovery_how_close),
        ) {
            InfoParagraph(stringResource(R.string.recovery_how_p1))
            InfoParagraph(stringResource(R.string.recovery_how_p2))
            InfoParagraph(stringResource(R.string.recovery_how_p3))
            InfoParagraph(stringResource(R.string.recovery_how_p4))
        }
    }
}

@Composable
private fun insightText(insight: RecoveryInsight): String = when (insight) {
    is RecoveryInsight.Raised -> stringResource(R.string.recovery_insight_raised, componentLabel(insight.component))
    is RecoveryInsight.Lowered -> stringResource(R.string.recovery_insight_lowered, componentLabel(insight.component))
    RecoveryInsight.Balanced -> stringResource(R.string.recovery_insight_balanced)
    RecoveryInsight.Calibrating -> stringResource(R.string.recovery_insight_calibrating)
    RecoveryInsight.Unavailable -> stringResource(R.string.recovery_insight_unavailable)
}

@StringRes
private fun componentRes(component: RecoveryComponent): Int = when (component) {
    RecoveryComponent.HRV -> R.string.recovery_component_hrv
    RecoveryComponent.RESTING_HEART_RATE -> R.string.recovery_component_rhr
    RecoveryComponent.SLEEP -> R.string.recovery_component_sleep
    RecoveryComponent.RESPIRATORY_RATE -> R.string.recovery_component_resp
    RecoveryComponent.SKIN_TEMPERATURE -> R.string.recovery_component_skin
    RecoveryComponent.SUBJECTIVE_FATIGUE -> R.string.recovery_component_fatigue
    RecoveryComponent.TRAINING_LOAD -> R.string.recovery_component_load
}

@Composable
private fun componentLabel(component: RecoveryComponent): String = stringResource(componentRes(component))

@StringRes
private fun statLabelRes(metric: MetricType): Int = when (metric) {
    MetricType.HRV_RMSSD -> R.string.recovery_stat_hrv
    MetricType.RESPIRATORY_RATE -> R.string.recovery_stat_resp
    MetricType.SLEEP_SCORE -> R.string.recovery_stat_sleep
    else -> R.string.recovery_stat_rhr
}

private fun statIcon(metric: MetricType) = when (metric) {
    MetricType.HRV_RMSSD -> ApexIcons.Pulse
    MetricType.RESPIRATORY_RATE -> ApexIcons.Wind
    MetricType.SLEEP_SCORE -> ApexIcons.Moon
    else -> ApexIcons.Heart
}

private val LOADING_STATS = listOf(
    RecoveryStatUi(MetricType.HRV_RMSSD, MetricState.Loading, null, 0, null, GoodDirection.UP),
    RecoveryStatUi(MetricType.RESTING_HEART_RATE, MetricState.Loading, null, 0, null, GoodDirection.DOWN),
    RecoveryStatUi(MetricType.RESPIRATORY_RATE, MetricState.Loading, null, 1, null, GoodDirection.NEUTRAL),
    RecoveryStatUi(MetricType.SLEEP_SCORE, MetricState.Loading, null, 0, null, GoodDirection.UP),
)

@Composable
private fun StatsCard(ui: RecoveryUi?, onOpenTrend: (MetricType) -> Unit) {
    val stats = ui?.stats ?: LOADING_STATS
    ApexCard(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp)) {
        Text(
            stringResource(R.string.recovery_stats_title).uppercase(),
            style = ApexTheme.type.cardTitle,
            color = ApexTheme.colors.foregroundSecondary,
        )
        stats.forEach { s ->
            KeyStatRow(
                label = stringResource(statLabelRes(s.metric)),
                state = s.state,
                icon = statIcon(s.metric),
                average = s.average,
                averageDecimals = s.averageDecimals,
                sd = s.sd,
                goodDirection = s.goodDirection,
                onClick = if (s.state is MetricState.Loading) null else ({ onOpenTrend(s.metric) }),
            )
        }
    }
}

@Composable
private fun FatigueCard(fatigue: FatigueUi) {
    val colors = ApexTheme.colors
    val formatter = LocalFormatter.current
    val mapper = remember(formatter) { MetricStateMapper(formatter) }
    ApexCard {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                stringResource(R.string.recovery_fatigue_title).uppercase(),
                style = ApexTheme.type.cardTitle,
                color = colors.foregroundSecondary,
            )
            when (fatigue) {
                FatigueUi.NoData -> ReasonPlaceholder(stringResource(R.string.recovery_fatigue_no_data), ApexIcons.Info)
                is FatigueUi.Assessed -> {
                    val a = fatigue.assessment
                    val tone = when (a.level) {
                        FatigueLevel.NONE -> ChipTone.OPTIMAL
                        FatigueLevel.WATCH -> ChipTone.NEUTRAL
                        FatigueLevel.ELEVATED -> ChipTone.WARNING
                        FatigueLevel.HIGH -> ChipTone.ALERT
                    }
                    Tag(mapper.fatigueLevelText(a), tone = tone)
                    a.signals.forEach { signal ->
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
                            Icon(ApexIcons.Warning, null, Modifier.size(16.dp), tint = colors.warningText)
                            Text(mapper.fatigueSignalText(signal), style = ApexTheme.type.body, color = colors.foreground)
                        }
                    }
                    Text(stringResource(R.string.recovery_fatigue_note), style = ApexTheme.type.caption, color = colors.mutedForeground)
                    ProvenanceLabel(DataProvenance.MATHEMATICALLY_DERIVED)
                }
            }
        }
    }
}

@Composable
private fun CalibrationCard(items: List<CalibrationItem>) {
    val colors = ApexTheme.colors
    ApexCard {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                stringResource(R.string.recovery_calibration_title).uppercase(),
                style = ApexTheme.type.cardTitle,
                color = colors.foregroundSecondary,
            )
            Text(stringResource(R.string.recovery_calibration_body), style = ApexTheme.type.body, color = colors.foregroundBody)
            items.forEach { item ->
                val label = stringResource(statLabelRes(item.metric))
                val spoken = stringResource(R.string.recovery_calibration_cd, label, item.validDays, item.requiredDays)
                val fraction = if (item.requiredDays > 0) (item.validDays.toFloat() / item.requiredDays).coerceIn(0f, 1f) else 0f
                Column(Modifier.semantics(mergeDescendants = true) { contentDescription = spoken }, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        stringResource(R.string.recovery_calibration_item, label, item.validDays, item.requiredDays),
                        style = ApexTheme.type.caption,
                        color = colors.foreground,
                    )
                    Box(Modifier.fillMaxWidth().height(4.dp).background(colors.dialTrack, ApexShapes.bar)) {
                        Box(Modifier.fillMaxWidth(fraction).height(4.dp).background(colors.optimal, ApexShapes.bar))
                    }
                }
            }
            ProvenanceLabel(DataProvenance.MATHEMATICALLY_DERIVED)
        }
    }
}

@Composable
private fun HowLink(onClick: () -> Unit) {
    val label = stringResource(R.string.recovery_how_link)
    ApexCard(onClick = onClick, spokenDescription = label, contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Icon(ApexIcons.Info, null, Modifier.size(20.dp), tint = ApexTheme.colors.mutedForeground)
            Text(label.uppercase(), style = ApexTheme.type.statLabel, color = ApexTheme.colors.foreground, modifier = Modifier.weight(1f))
            Icon(ApexIcons.ChevronRight, null, Modifier.size(16.dp), tint = ApexTheme.colors.mutedForeground)
        }
    }
}

// --- Previews -----------------------------------------------------------------------------------

private val PreviewSource = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API

private fun previewUi(): RecoveryUi = RecoveryUi(
    recovery = MetricState.Value(72.0, 0, "%", DataProvenance.MATHEMATICALLY_DERIVED),
    stats = listOf(
        RecoveryStatUi(MetricType.HRV_RMSSD, MetricState.Value(66.0, 0, "ms", PreviewSource, "this morning"), 55.0, 0, 6.0, GoodDirection.UP),
        RecoveryStatUi(MetricType.RESTING_HEART_RATE, MetricState.Value(55.0, 0, "bpm", PreviewSource, "this morning"), 55.0, 0, 2.0, GoodDirection.DOWN),
        RecoveryStatUi(MetricType.RESPIRATORY_RATE, MetricState.Calibrating(4), null, 1, null, GoodDirection.NEUTRAL),
        RecoveryStatUi(MetricType.SLEEP_SCORE, MetricState.Value(84.0, 0, "%", DataProvenance.MATHEMATICALLY_DERIVED), null, 0, null, GoodDirection.UP),
    ),
    insight = RecoveryInsight.Raised(RecoveryComponent.HRV),
    fatigue = FatigueUi.NoData,
    calibration = listOf(CalibrationItem(MetricType.RESPIRATORY_RATE, 3, 7)),
    drivers = listOf(
        RecoveryDriverUi(RecoveryComponent.HRV, 12.0),
        RecoveryDriverUi(RecoveryComponent.RESTING_HEART_RATE, -4.0),
    ),
)

@Composable
private fun PreviewBody(dark: Boolean) {
    ApexTheme(if (dark) ThemePreference.DARK else ThemePreference.LIGHT) {
        CompositionLocalProvider(LocalFormatter provides ApexFormatter(LocalContext.current)) {
            Box(Modifier.background(ApexTheme.colors.background)) {
                RecoveryScreen("Today", false, previewUi(), false, {}, {}, {}, {})
            }
        }
    }
}

@Preview(name = "Recovery dark", heightDp = 1600)
@Composable
private fun RecoveryPreviewDark() = PreviewBody(dark = true)

@Preview(name = "Recovery light", heightDp = 1600)
@Composable
private fun RecoveryPreviewLight() = PreviewBody(dark = false)
