package com.apex.athlete.ui.overview

import android.content.Context
import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.analytics.trend.RangeStatus
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.charts.IntradayHrChart
import com.apex.athlete.core.ui.components.ApexButton
import com.apex.athlete.core.ui.components.ApexButtonStyle
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.BannerKind
import com.apex.athlete.core.ui.components.ChipTone
import com.apex.athlete.core.ui.components.ConnectionBanner
import com.apex.athlete.core.ui.components.DialSize
import com.apex.athlete.core.ui.components.DialVariant
import com.apex.athlete.core.ui.components.InsightCard
import com.apex.athlete.core.ui.components.KeyStatRow
import com.apex.athlete.core.ui.components.MetricProvenance
import com.apex.athlete.core.ui.components.MiniRing
import com.apex.athlete.core.ui.components.ProvenanceLabel
import com.apex.athlete.core.ui.components.ReasonPlaceholder
import com.apex.athlete.core.ui.components.ReasonSize
import com.apex.athlete.core.ui.components.ScoreDial
import com.apex.athlete.core.ui.components.SkeletonLineFill
import com.apex.athlete.core.ui.components.StatusChip
import com.apex.athlete.core.ui.components.StrainTargetBar
import com.apex.athlete.core.ui.components.Tag
import com.apex.athlete.core.ui.components.apexClickable
import com.apex.athlete.core.ui.components.hideFromTalkBack
import com.apex.athlete.core.ui.components.minTouchTarget
import com.apex.athlete.core.ui.components.spoken
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.shell.HomeHeader
import com.apex.athlete.core.ui.shell.SyncStatus
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.state.MetricValueText
import com.apex.athlete.core.ui.state.metricSpoken
import com.apex.athlete.core.ui.theme.ApexShapes
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.core.ui.theme.ThemePreference
import com.apex.athlete.navigation.ApexNavigator
import com.apex.athlete.ui.common.LocalFormatter
import com.apex.athlete.ui.common.apexViewModel
import java.time.LocalDate

/** Overview tab (Pulse 4.3 home): header, three dials, heart rate, health monitor, target, coach, alert. */
@Composable
fun OverviewRoute(
    navigator: ApexNavigator,
    day: LocalDate,
    onDayChange: (LocalDate) -> Unit,
    contentPadding: PaddingValues,
) {
    val vm = apexViewModel { container, _ -> OverviewViewModel(container.repository) }
    LaunchedEffect(day) { vm.setDay(day.toEpochDay()) }
    val dashboard by vm.state.collectAsStateWithLifecycle()
    val formatter = LocalFormatter.current
    val ui = remember(dashboard, day, formatter) { buildOverviewUi(dashboard, day, formatter) }
    val today = formatter.today()
    val actions = remember(navigator, day, onDayChange, today) {
        OverviewActions(
            onProfile = navigator::openProfile,
            onPreviousDay = { onDayChange(day.minusDays(1)) },
            onNextDay = { onDayChange(day.plusDays(1)) },
            onToday = { onDayChange(today) },
            onSync = navigator::openDataSources,
            onSleep = { navigator.openSleep(day) },
            onRecovery = { navigator.openRecovery(day) },
            onStrain = { navigator.openStrain(day) },
            onHeartRate = { navigator.openHeartRateDay(day) },
            onTrend = navigator::openTrend,
            onCoach = navigator::openCoach,
            onDataSources = navigator::openDataSources,
            onImport = navigator::openTakeoutImport,
        )
    }
    OverviewContent(ui, actions, contentPadding)
}

class OverviewActions(
    val onProfile: () -> Unit,
    val onPreviousDay: () -> Unit,
    val onNextDay: () -> Unit,
    val onToday: () -> Unit,
    val onSync: () -> Unit,
    val onSleep: () -> Unit,
    val onRecovery: () -> Unit,
    val onStrain: () -> Unit,
    val onHeartRate: () -> Unit,
    val onTrend: (MetricType) -> Unit,
    val onCoach: () -> Unit,
    val onDataSources: () -> Unit,
    val onImport: () -> Unit,
)

@StringRes
private fun metricLabelRes(metric: MetricType): Int = when (metric) {
    MetricType.HRV_RMSSD, MetricType.HRV_DEEP_SLEEP_RMSSD -> R.string.overview_metric_hrv
    MetricType.RESTING_HEART_RATE, MetricType.SLEEPING_HEART_RATE -> R.string.overview_metric_rhr
    MetricType.RESPIRATORY_RATE -> R.string.overview_metric_resp
    MetricType.SPO2_AVG -> R.string.overview_metric_spo2
    MetricType.SKIN_TEMP_DEVIATION -> R.string.overview_metric_skin
    else -> R.string.overview_metric_generic
}

private fun metricLabel(context: Context, metric: MetricType): String = context.getString(metricLabelRes(metric))

@Composable
internal fun OverviewContent(ui: OverviewUi, actions: OverviewActions, contentPadding: PaddingValues) {
    val listState = rememberLazyListState()
    // The dials are item 0; once it has scrolled out of the list the mini rings appear in the header.
    val ringsVisible by remember { derivedStateOf { listState.firstVisibleItemIndex >= 1 } }
    val interactive = ui.phase == OverviewPhase.Content
    val sleepLabel = stringResource(R.string.overview_dial_sleep)
    val recoveryLabel = stringResource(R.string.overview_dial_recovery)
    val strainLabel = stringResource(R.string.overview_dial_strain)
    val target = rememberTarget(ui)

    Column(Modifier.fillMaxSize()) {
        HomeHeader(
            dateLabel = ui.dateLabel,
            onPreviousDay = actions.onPreviousDay,
            onNextDay = actions.onNextDay,
            onDateClick = actions.onToday,
            previousDayDescription = stringResource(R.string.overview_previous_day),
            nextDayDescription = stringResource(R.string.overview_next_day),
            syncText = ui.syncText,
            syncStatus = ui.syncStatus,
            syncDescription = ui.syncDescription,
            onSyncClick = actions.onSync,
            profileDescription = stringResource(R.string.overview_profile_description),
            onProfileClick = actions.onProfile,
            canGoNext = ui.canGoNext,
            ringsVisible = ringsVisible,
            ringRow = {
                MiniRing(ui.sleep, DialVariant.Sleep, sleepLabel, Modifier.weight(1f), onClick = if (interactive) actions.onSleep else null)
                MiniRing(ui.recovery, DialVariant.Recovery, recoveryLabel, Modifier.weight(1f), onClick = if (interactive) actions.onRecovery else null)
                MiniRing(ui.strain, DialVariant.Strain, strainLabel, Modifier.weight(1f), onClick = if (interactive) actions.onStrain else null)
            },
        )
        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = PaddingValues(
                start = ApexSpacing.gutter,
                end = ApexSpacing.gutter,
                top = ApexSpacing.sm,
                bottom = contentPadding.calculateBottomPadding() + ApexSpacing.sm,
            ),
            verticalArrangement = Arrangement.spacedBy(ApexSpacing.cardGap),
        ) {
            item(key = "dials") {
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                    if (ui.staleSince != null) {
                        ConnectionBanner(
                            kind = BannerKind.Stale,
                            title = stringResource(R.string.overview_stale_title),
                            description = stringResource(R.string.overview_stale_body, ui.staleSince),
                            actionLabel = stringResource(R.string.overview_stale_action),
                            onAction = actions.onDataSources,
                        )
                    }
                    Text(
                        text = stringResource(R.string.overview_wordmark).uppercase(),
                        style = ApexTheme.type.sectionTitle,
                        color = ApexTheme.colors.foregroundSecondary,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.Top) {
                        ScoreDial(ui.sleep, DialVariant.Sleep, DialSize.Home, sleepLabel, onClick = if (interactive) actions.onSleep else null)
                        ScoreDial(ui.recovery, DialVariant.Recovery, DialSize.Home, recoveryLabel, onClick = if (interactive) actions.onRecovery else null)
                        ScoreDial(
                            ui.strain, DialVariant.Strain, DialSize.Home, strainLabel,
                            strainTarget = target,
                            onClick = if (interactive) actions.onStrain else null,
                        )
                    }
                }
            }
            when (ui.phase) {
                OverviewPhase.Empty -> item(key = "empty") { EmptyCard(actions) }
                else -> {
                    item(key = "hr") { HeartRateCard(ui, actions.onHeartRate) }
                    item(key = "monitor") { MonitorCard(ui, actions.onTrend) }
                    item(key = "target") { StrainTargetCard(ui, actions.onStrain) }
                    if (ui.coachHeadline != null) {
                        item(key = "coach") {
                            InsightCard(
                                text = ui.coachHeadline,
                                linkLabel = stringResource(R.string.overview_coach_link),
                                onLinkClick = actions.onCoach,
                                provenance = DataProvenance.MATHEMATICALLY_DERIVED,
                            )
                        }
                    }
                    if (ui.alerts.isNotEmpty()) {
                        item(key = "alert") { AlertCard(ui.alerts, actions.onTrend) }
                    }
                }
            }
        }
    }
}

@Composable
private fun rememberTarget(ui: OverviewUi): ClosedFloatingPointRange<Double>? {
    val low = ui.strainTargetLow
    val high = ui.strainTargetHigh
    return remember(low, high) { if (low != null && high != null && high > low) low..high else null }
}

@Composable
private fun EmptyCard(actions: OverviewActions) {
    ApexCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
            Text(stringResource(R.string.overview_empty_title), style = ApexTheme.type.cardTitle, color = ApexTheme.colors.foreground)
            Text(stringResource(R.string.overview_empty_body), style = ApexTheme.type.body, color = ApexTheme.colors.foregroundSecondary)
            ApexButton(stringResource(R.string.overview_empty_connect), actions.onDataSources, Modifier.fillMaxWidth())
            ApexButton(
                stringResource(R.string.overview_empty_import), actions.onImport, Modifier.fillMaxWidth(),
                style = ApexButtonStyle.Secondary,
            )
        }
    }
}

@Composable
private fun HeartRateCard(ui: OverviewUi, onOpen: () -> Unit) {
    val colors = ApexTheme.colors
    val title = stringResource(R.string.overview_hr_title)
    val spoken = metricSpoken(title, ui.heartRate, extras = listOf(stringResource(R.string.overview_hr_card_description)))
    ApexCard(Modifier.fillMaxWidth()) {
        Column(
            Modifier.fillMaxWidth().apexClickable(onClick = onOpen, role = Role.Button).spoken(spoken).minTouchTarget(),
            verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm),
        ) {
            Column(Modifier.hideFromTalkBack(), verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(title.uppercase(), style = ApexTheme.type.cardTitle, color = colors.foreground, modifier = Modifier.weight(1f))
                    Icon(ApexIcons.ChevronRight, null, Modifier.size(16.dp), tint = colors.mutedForeground)
                }
                if (ui.heartRate is MetricState.Loading) {
                    SkeletonLineFill(height = 36.dp)
                } else {
                    MetricValueText(ui.heartRate, valueStyle = ApexTheme.type.statValueLarge)
                    if (ui.heartRate is MetricState.Calibrating || ui.heartRate is MetricState.Unavailable || ui.heartRate is MetricState.Error) {
                        ReasonPlaceholder(ui.heartRate, size = ReasonSize.Small)
                    } else {
                        MetricProvenance(ui.heartRate)
                        if (ui.heartRate is MetricState.Stale) Tag(stringResource(R.string.overview_hr_stale), tone = ChipTone.WARNING)
                    }
                }
            }
        }
        if (ui.heartRatePoints.isNotEmpty() && ui.heartRate !is MetricState.Loading) {
            Text(
                stringResource(R.string.overview_hr_last_30).uppercase(),
                style = ApexTheme.type.caption,
                color = colors.mutedForeground,
                modifier = Modifier.padding(top = ApexSpacing.sm),
            )
            IntradayHrChart(
                points = ui.heartRatePoints,
                windowStartMillis = ui.heartRateWindowStart,
                windowEndMillis = ui.heartRateWindowEnd,
                clock = ui.clock,
                maxGapMillis = 3 * 60_000L,
                height = 140.dp,
            )
        }
    }
}

@Composable
private fun MonitorCard(ui: OverviewUi, onTrend: (MetricType) -> Unit) {
    val colors = ApexTheme.colors
    val context = LocalContext.current
    ApexCard(Modifier.fillMaxWidth()) {
        Text(stringResource(R.string.overview_monitor_title).uppercase(), style = ApexTheme.type.cardTitle, color = colors.foreground)
        if (ui.monitorEvaluated > 0) {
            val outside = ui.monitorOutside > 0
            StatusChip(
                text = if (outside) {
                    stringResource(R.string.overview_monitor_some_outside, ui.monitorOutside, ui.monitorEvaluated)
                } else {
                    stringResource(R.string.overview_monitor_all_in_range, ui.monitorEvaluated)
                },
                tone = if (outside) ChipTone.WARNING else ChipTone.OPTIMAL,
                icon = if (outside) ApexIcons.Warning else null,
                modifier = Modifier.padding(top = ApexSpacing.sm),
            )
        }
        ui.monitor.forEach { row ->
            KeyStatRow(
                label = metricLabel(context, row.metric),
                state = row.state,
                icon = monitorIcon(row.metric),
                average = row.average,
                averageDecimals = averageDecimalsFor(row.metric),
                goodDirection = goodDirectionFor(row.metric),
                averageLabel = stringResource(R.string.overview_monitor_average_label),
                onClick = { onTrend(row.metric) },
            )
        }
        Text(stringResource(R.string.overview_monitor_footnote), style = ApexTheme.type.caption, color = colors.mutedForeground)
    }
}

private fun monitorIcon(metric: MetricType) = when (metric) {
    MetricType.HRV_RMSSD, MetricType.HRV_DEEP_SLEEP_RMSSD -> ApexIcons.Pulse
    MetricType.RESTING_HEART_RATE, MetricType.SLEEPING_HEART_RATE -> ApexIcons.Heart
    MetricType.RESPIRATORY_RATE -> ApexIcons.Wind
    else -> ApexIcons.Info
}

@Composable
private fun StrainTargetCard(ui: OverviewUi, onOpen: () -> Unit) {
    val colors = ApexTheme.colors
    ApexCard(Modifier.fillMaxWidth(), onClick = onOpen) {
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
            Text(stringResource(R.string.overview_target_title).uppercase(), style = ApexTheme.type.cardTitle, color = colors.foreground)
            StrainTargetBar(ui.strain, ui.strainTargetLow, ui.strainTargetHigh)
            val note = when (ui.strainTargetNote) {
                StrainTargetNote.Calibrating -> stringResource(R.string.overview_target_calibrating)
                StrainTargetNote.Unavailable -> stringResource(R.string.overview_target_unavailable)
                StrainTargetNote.None -> ui.strainPrescription
            }
            if (ui.phase == OverviewPhase.Content && note != null) {
                Text(note, style = ApexTheme.type.body, color = colors.foregroundBody)
                ProvenanceLabel(DataProvenance.MATHEMATICALLY_DERIVED)
            }
        }
    }
}

@Composable
private fun AlertCard(alerts: List<AlertUi>, onTrend: (MetricType) -> Unit) {
    val colors = ApexTheme.colors
    val context = LocalContext.current
    val title = pluralStringResource(R.plurals.overview_alert_title, alerts.size, alerts.size)
    val first = alerts.first().metric
    val actionLabel = stringResource(R.string.overview_alert_action)
    Column(
        Modifier
            .fillMaxWidth()
            .clip(ApexShapes.card)
            .background(colors.card)
            .border(1.dp, colors.warning, ApexShapes.card)
            .padding(ApexSpacing.cardPadding),
        verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(ApexSpacing.md), verticalAlignment = Alignment.CenterVertically) {
            Icon(ApexIcons.Warning, null, Modifier.size(20.dp), tint = colors.warningText)
            Text(title, style = ApexTheme.type.bodyStrong, color = colors.foreground)
        }
        alerts.forEach { alert ->
            val name = metricLabel(context, alert.metric)
            Text(
                stringResource(if (alert.above) R.string.overview_alert_above else R.string.overview_alert_below, name),
                style = ApexTheme.type.body,
                color = colors.foregroundSecondary,
            )
        }
        Text(stringResource(R.string.overview_alert_note), style = ApexTheme.type.caption, color = colors.mutedForeground)
        ProvenanceLabel(DataProvenance.MATHEMATICALLY_DERIVED)
        Row(
            Modifier
                .apexClickable(onClick = { onTrend(first) }, role = Role.Button)
                .minTouchTarget()
                .spoken(stringResource(R.string.overview_alert_description, actionLabel)),
            horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(actionLabel.uppercase(), style = ApexTheme.type.linkAction, color = colors.warningText, modifier = Modifier.hideFromTalkBack())
            Icon(ApexIcons.ArrowRight, null, Modifier.size(16.dp), tint = colors.warningText)
        }
    }
}

// --- Previews (stateless content; no repository or formatter needed) ---------------------------------

private val previewActions = OverviewActions({}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {})

private fun previewUi(phase: OverviewPhase): OverviewUi {
    val derived = DataProvenance.MATHEMATICALLY_DERIVED
    val sensor = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API
    val content = phase == OverviewPhase.Content
    return OverviewUi(
        phase = phase,
        dateLabel = "Today",
        canGoNext = false,
        syncText = "2 min ago",
        syncStatus = SyncStatus.Ok,
        syncDescription = "Synced 2 min ago. Opens data sources.",
        staleSince = null,
        sleep = when (phase) {
            OverviewPhase.Loading -> MetricState.Loading
            OverviewPhase.Empty -> MetricState.Unavailable(MetricReason.NOT_CONNECTED)
            OverviewPhase.Content -> MetricState.Value(88.0, 0, "%", derived)
        },
        recovery = when (phase) {
            OverviewPhase.Loading -> MetricState.Loading
            OverviewPhase.Empty -> MetricState.Unavailable(MetricReason.NOT_CONNECTED)
            OverviewPhase.Content -> MetricState.Calibrating(3)
        },
        strain = when (phase) {
            OverviewPhase.Loading -> MetricState.Loading
            OverviewPhase.Empty -> MetricState.Unavailable(MetricReason.NOT_CONNECTED)
            OverviewPhase.Content -> MetricState.Value(9.4, 1, null, derived, isProvisional = true)
        },
        strainTargetLow = if (content) 10.0 else null,
        strainTargetHigh = if (content) 12.0 else null,
        strainTargetNote = StrainTargetNote.None,
        strainPrescription = if (content) "Strain is 9.4. Today's target is 10.0 to 12.0." else null,
        heartRate = if (content) MetricState.Value(62.0, 0, "bpm", sensor, "2 min ago") else MetricState.Loading,
        heartRatePoints = emptyList(),
        heartRateWindowStart = 0L,
        heartRateWindowEnd = 0L,
        clock = com.apex.athlete.core.ui.charts.ChartClock(),
        monitor = listOf(
            MonitorRowUi(MetricType.HRV_RMSSD, if (content) MetricState.Value(66.0, 0, "ms", sensor) else MetricState.Loading, 55.0, RangeStatus.ABOVE_NORMAL),
            MonitorRowUi(MetricType.RESTING_HEART_RATE, if (content) MetricState.Value(52.0, 0, "bpm", sensor) else MetricState.Loading, 54.0, RangeStatus.WITHIN_NORMAL),
            MonitorRowUi(MetricType.SKIN_TEMP_DEVIATION, if (content) MetricState.Unavailable(MetricReason.NOT_WORN) else MetricState.Loading, null, RangeStatus.NO_READING),
        ),
        monitorOutside = if (content) 1 else 0,
        monitorEvaluated = if (content) 2 else 0,
        alerts = if (content) listOf(AlertUi(MetricType.HRV_RMSSD, true, sensor)) else emptyList(),
        coachHeadline = if (content) "A moderate day fits" else null,
    )
}

@Composable
private fun OverviewPreviewBody(dark: Boolean, phase: OverviewPhase) {
    ApexTheme(if (dark) ThemePreference.DARK else ThemePreference.LIGHT) {
        Box(Modifier.background(ApexTheme.colors.background)) {
            OverviewContent(previewUi(phase), previewActions, PaddingValues(bottom = 24.dp))
        }
    }
}

@Preview(name = "Overview content dark", heightDp = 1500)
@Composable
private fun OverviewContentDark() = OverviewPreviewBody(true, OverviewPhase.Content)

@Preview(name = "Overview content light", heightDp = 1500)
@Composable
private fun OverviewContentLight() = OverviewPreviewBody(false, OverviewPhase.Content)

@Preview(name = "Overview first run dark", heightDp = 900)
@Composable
private fun OverviewEmptyDark() = OverviewPreviewBody(true, OverviewPhase.Empty)

@Preview(name = "Overview first run light", heightDp = 900)
@Composable
private fun OverviewEmptyLight() = OverviewPreviewBody(false, OverviewPhase.Empty)

@Preview(name = "Overview loading dark", heightDp = 900)
@Composable
private fun OverviewLoadingDark() = OverviewPreviewBody(true, OverviewPhase.Loading)

@Preview(name = "Overview loading light", heightDp = 900)
@Composable
private fun OverviewLoadingLight() = OverviewPreviewBody(false, OverviewPhase.Loading)
