package com.apex.athlete.ui.strain

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.analytics.strain.HeartRateZone
import com.apex.athlete.core.data.repository.ActivityDayState
import com.apex.athlete.core.data.repository.StrainLoadState
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.charts.AcwrTrendChart
import com.apex.athlete.core.ui.charts.ZoneBars
import com.apex.athlete.core.ui.charts.ZoneMinutes
import com.apex.athlete.core.ui.components.ActivityCard
import com.apex.athlete.core.ui.components.ActivityCardSkeleton
import com.apex.athlete.core.ui.components.ApexButton
import com.apex.athlete.core.ui.components.ApexButtonStyle
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.ActivityKind
import com.apex.athlete.core.ui.components.DatePill
import com.apex.athlete.core.ui.components.DialSize
import com.apex.athlete.core.ui.components.DialVariant
import com.apex.athlete.core.ui.components.KeyStatRow
import com.apex.athlete.core.ui.components.ReasonPlaceholder
import com.apex.athlete.core.ui.components.ReasonSize
import com.apex.athlete.core.ui.components.ScoreDial
import com.apex.athlete.core.ui.components.Skeleton
import com.apex.athlete.core.ui.components.StrainTargetBar
import com.apex.athlete.core.ui.components.provenanceLabelRes
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.shell.DetailShell
import com.apex.athlete.core.ui.shell.SectionShell
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.theme.ApexShapes
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.core.ui.theme.ThemePreference
import com.apex.athlete.navigation.ApexNavigator
import com.apex.athlete.ui.common.ApexFormatter
import com.apex.athlete.ui.common.LocalFormatter
import com.apex.athlete.ui.common.MetricStateMapper
import com.apex.athlete.ui.common.apexViewModel
import java.time.LocalDate

@Composable
fun StrainRoute(navigator: ApexNavigator, day: LocalDate, onDayChange: (LocalDate) -> Unit) {
    val vm = apexViewModel { container, handle -> StrainViewModel(container.repository, handle) }
    LaunchedEffect(day) { vm.setDay(day.toEpochDay()) }
    val state by vm.state.collectAsStateWithLifecycle()
    val activity by vm.activity.collectAsStateWithLifecycle()
    StrainScreen(
        state = state,
        activity = activity,
        day = day,
        onDayChange = onDayChange,
        onBack = { navigator.back() },
        onOpenWorkout = { id -> navigator.openWorkout(id) },
        onAddWorkout = { navigator.openAddWorkout(day) },
    )
}

/** Stateless screen: [state] null means loading. */
@Composable
internal fun StrainScreen(
    state: StrainLoadState?,
    day: LocalDate,
    onDayChange: (LocalDate) -> Unit,
    onBack: () -> Unit,
    onOpenWorkout: (String) -> Unit,
    onAddWorkout: () -> Unit,
    activity: ActivityDayState? = null,
) {
    val formatter = LocalFormatter.current
    val mapper = remember(formatter) { MetricStateMapper(formatter) }
    val analysis = state?.analysis
    val strainState = if (analysis == null) MetricState.Loading else mapper.strain(analysis)
    val target = analysis?.strainTarget
    val today = formatter.today()

    DetailShell(
        title = stringResource(R.string.strain_title),
        onBack = onBack,
        backDescription = stringResource(R.string.common_back),
        hero = {
            Column(
                Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(ApexSpacing.lg),
            ) {
                DatePill(
                    label = formatter.dayLabel(day),
                    onPrevious = { onDayChange(day.minusDays(1)) },
                    onNext = { onDayChange(day.plusDays(1)) },
                    onLabelClick = { onDayChange(today) },
                    canGoNext = day.isBefore(today),
                    previousDescription = stringResource(R.string.strain_date_previous),
                    nextDescription = stringResource(R.string.strain_date_next),
                    labelClickDescription = stringResource(R.string.strain_date_go_today),
                )
                ScoreDial(
                    state = strainState,
                    variant = DialVariant.Strain,
                    size = DialSize.Hero,
                    label = stringResource(R.string.strain_dial_label),
                    strainTarget = target?.let { it.low..it.high },
                )
                if (analysis?.isProvisional == true && strainState is MetricState.Value) {
                    Text(
                        stringResource(R.string.strain_provisional_note),
                        style = ApexTheme.type.caption,
                        color = ApexTheme.colors.foregroundSecondary,
                        textAlign = TextAlign.Center,
                    )
                }
            }
        },
        primary = {
            ApexCard {
                StrainTargetBar(state = strainState, targetLow = target?.low, targetHigh = target?.high)
                PersonalTargetRow(analysis)
            }
            ActivitySection(activity, day, formatter)
            ZonesSection(state, mapper)
            ActivitiesSection(state, formatter, mapper, onOpenWorkout, onAddWorkout)
            LoadSection(state, mapper)
            HowCard()
        },
    )
}

@Composable
private fun ZonesSection(state: StrainLoadState?, mapper: MetricStateMapper) {
    SectionShell(stringResource(R.string.strain_zones_title)) {
        ApexCard {
            if (state == null) {
                Skeleton(Modifier.fillMaxWidth().height(120.dp), ApexShapes.row)
                return@ApexCard
            }
            val analysis = state.analysis
            val rows = remember(analysis.zoneMinutes, analysis.zones) { zoneRowsOf(analysis.zoneMinutes, analysis.zones) }
            if (!hasZoneData(rows)) {
                val strainState = mapper.strain(analysis)
                if (strainState is MetricState.Value) {
                    ReasonPlaceholder(
                        text = stringResource(R.string.strain_zones_empty),
                        icon = ApexIcons.Info,
                        size = ReasonSize.Medium,
                    )
                } else {
                    ReasonPlaceholder(strainState, size = ReasonSize.Medium)
                }
                return@ApexCard
            }
            val zones = rows.map { row ->
                ZoneMinutes(
                    zoneLabel = stringResource(zoneLabelRes(row.zone)),
                    rangeLabel = zoneRangeLabel(row),
                    seconds = row.seconds,
                )
            }
            val max = analysis.zones?.maxHeartRate
            ZoneBars(
                zones = zones,
                caption = max?.let { stringResource(R.string.strain_zone_caption, it.toInt()) },
                provenance = stringResource(R.string.strain_zones_provenance),
            )
        }
    }
}

@Composable
private fun zoneRangeLabel(row: ZoneRow): String? = when {
    row.zone == HeartRateZone.BELOW_ZONES && row.highBpm != null -> stringResource(R.string.strain_zone_range_below, row.highBpm)
    row.openEnded && row.lowBpm != null -> stringResource(R.string.strain_zone_range_top, row.lowBpm)
    row.lowBpm != null && row.highBpm != null -> stringResource(R.string.strain_zone_range, row.lowBpm, row.highBpm)
    else -> null
}

private fun zoneLabelRes(zone: HeartRateZone): Int = when (zone) {
    HeartRateZone.ZONE_5 -> R.string.strain_zone_5
    HeartRateZone.ZONE_4 -> R.string.strain_zone_4
    HeartRateZone.ZONE_3 -> R.string.strain_zone_3
    HeartRateZone.ZONE_2 -> R.string.strain_zone_2
    HeartRateZone.ZONE_1 -> R.string.strain_zone_1
    HeartRateZone.BELOW_ZONES -> R.string.strain_zone_below
}

@Composable
private fun ActivitiesSection(
    state: StrainLoadState?,
    formatter: ApexFormatter,
    mapper: MetricStateMapper,
    onOpenWorkout: (String) -> Unit,
    onAddWorkout: () -> Unit,
) {
    SectionShell(stringResource(R.string.strain_activities_title)) {
        if (state == null) {
            ActivityCardSkeleton()
        } else {
            // The analysis carries every workout that started on this day; recentWorkouts would cap older days.
            val workouts = remember(state.analysis.workouts) { sortedWorkouts(state.analysis.workouts) }
            if (workouts.isEmpty()) {
                ApexCard {
                    ReasonPlaceholder(
                        text = stringResource(R.string.strain_activities_empty),
                        icon = ApexIcons.Info,
                    )
                }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                    val untitled = stringResource(R.string.strain_activity_untitled)
                    workouts.forEach { w ->
                        ActivityCard(
                            name = w.displayName.ifBlank { untitled },
                            kind = ActivityKind.Workout,
                            value = mapper.value(w.derivedStrain, 1, null, DataProvenance.MATHEMATICALLY_DERIVED),
                            startTime = formatter.clockTime(w.startEpochMillis, w.zoneOffsetSeconds),
                            endTime = formatter.clockTime(w.endEpochMillis, w.zoneOffsetSeconds),
                            onClick = { onOpenWorkout(w.id) },
                        )
                    }
                }
            }
        }
        ApexButton(
            text = stringResource(R.string.strain_add_workout),
            onClick = onAddWorkout,
            style = ApexButtonStyle.Secondary,
            leadingIcon = ApexIcons.Plus,
            modifier = Modifier.fillMaxWidth(),
        )
        Text(
            stringResource(R.string.strain_add_workout_hint),
            style = ApexTheme.type.caption,
            color = ApexTheme.colors.mutedForeground,
        )
    }
}

@Composable
private fun LoadSection(state: StrainLoadState?, mapper: MetricStateMapper) {
    SectionShell(stringResource(R.string.strain_load_title)) {
        ApexCard {
            if (state == null) {
                Skeleton(Modifier.fillMaxWidth().height(180.dp), ApexShapes.row)
                return@ApexCard
            }
            val load = state.analysis.load
            val data = remember(load.series) { loadChartData(load.series) }
            Text(
                stringResource(R.string.strain_load_blurb),
                style = ApexTheme.type.body,
                color = ApexTheme.colors.foregroundBody,
            )
            if (data.isEmpty) {
                ReasonPlaceholder(text = stringResource(R.string.strain_load_empty), icon = ApexIcons.Hourglass)
            } else {
                val caveat = load.caveats.takeIf { it.isNotEmpty() }
                    ?.joinToString(" ") { mapper.loadCaveatText(it) }
                AcwrTrendChart(
                    acute = data.acute,
                    chronic = data.chronic,
                    acwr = data.acwr,
                    monotony = load.monotony?.takeIf { it.isFinite() },
                    caveat = caveat,
                    provenance = stringResource(R.string.strain_load_provenance) + " " +
                        stringResource(provenanceLabelRes(load.provenance)),
                )
            }
            val ratio = mapper.workloadRatio(state.analysis)
            KeyStatRow(stringResource(R.string.strain_load_ratio), ratio)
            if (ratio is MetricState.Calibrating) {
                Text(
                    stringResource(R.string.strain_load_calibrating_note),
                    style = ApexTheme.type.caption,
                    color = ApexTheme.colors.mutedForeground,
                )
            }
            KeyStatRow(
                stringResource(R.string.strain_load_confidence),
                loadConfidenceState(state.analysis.loadConfidence, state.analysis.loadCalibrating),
            )
            KeyStatRow(stringResource(R.string.strain_load_fitness), mapper.value(load.chronicLoad, 1, null, load.provenance))
            KeyStatRow(stringResource(R.string.strain_load_fatigue), mapper.value(load.acuteLoad, 1, null, load.provenance))
            KeyStatRow(stringResource(R.string.strain_load_balance), mapper.value(load.trainingBalance, 1, null, load.provenance))
            KeyStatRow(stringResource(R.string.strain_load_monotony), mapper.value(load.monotony, 1, null, load.provenance))
        }
    }
}

@Composable
private fun HowCard() {
    SectionShell(stringResource(R.string.strain_how_title)) {
        ApexCard {
            Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                listOf(
                    R.string.strain_how_scale,
                    R.string.strain_how_trimp,
                    R.string.strain_how_zones,
                    R.string.strain_how_target,
                    R.string.strain_how_load,
                    R.string.strain_how_today,
                ).forEach { id ->
                    Text(stringResource(id), style = ApexTheme.type.body, color = ApexTheme.colors.foregroundBody)
                }
            }
        }
    }
}

// --- Previews -------------------------------------------------------------------------------------

@Composable
private fun PreviewHost(dark: Boolean, content: @Composable () -> Unit) {
    val context = LocalContext.current
    val formatter = remember { ApexFormatter(context) }
    CompositionLocalProvider(LocalFormatter provides formatter) {
        ApexTheme(if (dark) ThemePreference.DARK else ThemePreference.LIGHT) {
            Box(Modifier.background(ApexTheme.colors.background)) { content() }
        }
    }
}

@Preview(name = "Strain loading dark", heightDp = 900)
@Composable
private fun StrainLoadingDark() = PreviewHost(dark = true) {
    StrainScreen(null, LocalDate.of(2026, 11, 12), {}, {}, {}, {})
}

@Preview(name = "Strain loading light", heightDp = 900)
@Composable
private fun StrainLoadingLight() = PreviewHost(dark = false) {
    StrainScreen(null, LocalDate.of(2026, 11, 12), {}, {}, {}, {})
}
