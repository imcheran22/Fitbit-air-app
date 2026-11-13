package com.apex.athlete.ui.workout

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.analytics.strain.HeartRateRecoveryResult
import com.apex.athlete.core.analytics.strain.HeartRateZone
import com.apex.athlete.core.analytics.strain.HrrMissing
import com.apex.athlete.core.data.repository.HeartRateTick
import com.apex.athlete.core.data.repository.WorkoutDetailState as RepoWorkoutDetail
import com.apex.athlete.core.database.entity.WorkoutEntity
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.charts.ChartClock
import com.apex.athlete.core.ui.charts.ChartPoint
import com.apex.athlete.core.ui.charts.IntradayHrChart
import com.apex.athlete.core.ui.charts.ZoneBars
import com.apex.athlete.core.ui.charts.ZoneMinutes
import com.apex.athlete.core.ui.components.ApexButton
import com.apex.athlete.core.ui.components.ApexButtonStyle
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.KeyStatRow
import com.apex.athlete.core.ui.components.MetricProvenance
import com.apex.athlete.core.ui.components.ProvenanceLabel
import com.apex.athlete.core.ui.components.ReasonPlaceholder
import com.apex.athlete.core.ui.components.ReasonSize
import com.apex.athlete.core.ui.components.Skeleton
import com.apex.athlete.core.ui.components.SkeletonLine
import com.apex.athlete.core.ui.components.provenanceLabelRes
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.shell.ApexSheet
import com.apex.athlete.core.ui.shell.DetailHeader
import com.apex.athlete.core.ui.shell.DetailShell
import com.apex.athlete.core.ui.shell.SectionShell
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.state.MetricValueText
import com.apex.athlete.core.ui.theme.ApexShapes
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.core.ui.theme.ThemePreference
import com.apex.athlete.navigation.ApexNavigator
import com.apex.athlete.ui.common.ApexFormatter
import com.apex.athlete.ui.common.LocalFormatter
import com.apex.athlete.ui.common.MetricStateMapper
import com.apex.athlete.ui.common.apexViewModel
import com.apex.athlete.ui.strain.zoneRowsOf
import java.time.LocalDate

@Composable
fun WorkoutDetailRoute(navigator: ApexNavigator, workoutId: String) {
    val vm = apexViewModel(key = "workout:$workoutId") { container, handle ->
        WorkoutDetailViewModel(container.repository, handle, workoutId)
    }
    val state by vm.state.collectAsStateWithLifecycle()
    val deleteState by vm.deleteState.collectAsStateWithLifecycle()
    LaunchedEffect(deleteState) {
        if (deleteState == DeleteState.Done) navigator.back()
    }
    WorkoutDetailScreen(
        state = state,
        deleteState = deleteState,
        onBack = { navigator.back() },
        onDelete = vm::delete,
    )
}

@Composable
internal fun WorkoutDetailScreen(
    state: WorkoutDetailState,
    deleteState: DeleteState,
    onBack: () -> Unit,
    onDelete: () -> Unit,
) {
    when (state) {
        WorkoutDetailState.Loading -> DetailShell(
            title = stringResource(R.string.workout_detail_title),
            onBack = onBack,
            backDescription = stringResource(R.string.common_back),
            hero = { SkeletonLine(width = 160.dp, height = 44.dp) },
            primary = { Skeleton(Modifier.fillMaxWidth().height(200.dp), ApexShapes.card) },
        )
        WorkoutDetailState.NotFound -> NotFound(onBack)
        is WorkoutDetailState.Found -> FoundDetail(state.workout, state.detail, deleteState, onBack, onDelete)
    }
}

@Composable
private fun NotFound(onBack: () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        DetailHeader(
            title = stringResource(R.string.workout_detail_title),
            onBack = onBack,
            backDescription = stringResource(R.string.common_back),
        )
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = ApexSpacing.gutter, vertical = ApexSpacing.xxl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(ApexSpacing.lg),
        ) {
            Text(
                stringResource(R.string.workout_not_found_title),
                style = ApexTheme.type.sectionTitle,
                color = ApexTheme.colors.foreground,
                textAlign = TextAlign.Center,
            )
            ReasonPlaceholder(
                text = stringResource(R.string.workout_not_found_body),
                icon = ApexIcons.Info,
                size = ReasonSize.Medium,
            )
            ApexButton(
                text = stringResource(R.string.workout_not_found_back),
                onClick = onBack,
                style = ApexButtonStyle.Secondary,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun FoundDetail(
    w: WorkoutEntity,
    detail: RepoWorkoutDetail?,
    deleteState: DeleteState,
    onBack: () -> Unit,
    onDelete: () -> Unit,
) {
    val formatter = LocalFormatter.current
    val mapper = remember(formatter) { MetricStateMapper(formatter) }
    var confirming by rememberSaveable { mutableStateOf(false) }
    val derived = DataProvenance.MATHEMATICALLY_DERIVED
    val stats = remember(w, detail, formatter) { workoutStats(w, detail, formatter) }

    val typeRes = workoutTypeLabelRes(w.exerciseType)
    val typeLabel = if (typeRes != null) stringResource(typeRes) else humanizeType(w.exerciseType)
    val title = w.displayName.ifBlank { typeLabel }
    val durationMinutes = w.activeDurationMillis / 60_000.0
    val strainState = mapper.value(w.derivedStrain, 1, null, derived)
    val durationState = mapper.value(durationMinutes, 0, stringResource(R.string.workout_unit_min), w.provenance)
    val dayLabel = formatter.dayLabel(LocalDate.ofEpochDay(w.epochDay))
    val start = formatter.clockTime(w.startEpochMillis, w.zoneOffsetSeconds)
    val end = formatter.clockTime(w.endEpochMillis, w.zoneOffsetSeconds)

    DetailShell(
        title = title,
        onBack = onBack,
        backDescription = stringResource(R.string.common_back),
        hero = {
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(ApexSpacing.xxl)) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
                        MetricValueText(
                            strainState,
                            valueStyle = ApexTheme.type.statValueLarge,
                            color = ApexTheme.colors.strainText,
                        )
                        Text(
                            stringResource(R.string.workout_detail_strain_label).uppercase(),
                            style = ApexTheme.type.statLabel,
                            color = ApexTheme.colors.foregroundSecondary,
                        )
                        MetricProvenance(strainState)
                    }
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
                        MetricValueText(durationState, valueStyle = ApexTheme.type.statValueLarge)
                        Text(
                            stringResource(R.string.workout_detail_duration_label).uppercase(),
                            style = ApexTheme.type.statLabel,
                            color = ApexTheme.colors.foregroundSecondary,
                        )
                        MetricProvenance(durationState)
                    }
                }
                Text(
                    stringResource(R.string.workout_detail_times, dayLabel, start, end),
                    style = ApexTheme.type.caption,
                    color = ApexTheme.colors.foregroundSecondary,
                )
            }
        },
        primary = {
            SectionShell(stringResource(R.string.workout_detail_stats_title)) {
                ApexCard {
                    KeyStatRow(stringResource(R.string.workout_stat_duration), durationState)
                    KeyStatRow(
                        stringResource(R.string.workout_stat_avg_hr),
                        mapper.value(w.averageHeartRate?.toDouble(), 0, "bpm", w.provenance),
                    )
                    KeyStatRow(
                        stringResource(R.string.workout_stat_max_hr),
                        mapper.value(w.maxHeartRate?.toDouble(), 0, "bpm", w.provenance),
                    )
                    KeyStatRow(stringResource(R.string.workout_stat_strain), strainState)
                    KeyStatRow(stringResource(R.string.workout_stat_load), mapper.value(w.derivedTrimp, 0, null, derived))
                    w.perceivedExertion?.let { rpe ->
                        KeyStatRow(
                            stringResource(R.string.workout_stat_rpe),
                            mapper.value(rpe.toDouble(), 0, stringResource(R.string.workout_stat_rpe_unit), DataProvenance.USER_REPORTED),
                        )
                    }
                    KeyStatRow(stringResource(R.string.workout_stat_calories), stats.calories)
                    KeyStatRow(stringResource(R.string.workout_stat_distance), stats.distance)
                    KeyStatRow(stringResource(R.string.workout_stat_steps), stats.steps)
                    KeyStatRow(stringResource(R.string.workout_stat_azm), stats.activeZoneMinutes)
                    KeyStatRow(stringResource(R.string.workout_stat_elevation), stats.elevation)
                    Row(
                        Modifier.fillMaxWidth().padding(top = ApexSpacing.sm),
                        horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            stringResource(R.string.workout_stat_source).uppercase(),
                            style = ApexTheme.type.statLabel,
                            color = ApexTheme.colors.foreground,
                        )
                        ProvenanceLabel(w.provenance)
                    }
                }
            }
            SectionShell(stringResource(R.string.workout_zones_title)) {
                ApexCard { ZonesBody(w, detail) }
            }
            SectionShell(stringResource(R.string.workout_hrr_title)) {
                ApexCard {
                    KeyStatRow(stringResource(R.string.workout_hrr_60), stats.recovery60)
                    KeyStatRow(stringResource(R.string.workout_hrr_120), stats.recovery120)
                    Text(
                        stringResource(R.string.workout_hrr_note),
                        style = ApexTheme.type.caption,
                        color = ApexTheme.colors.mutedForeground,
                        modifier = Modifier.padding(top = ApexSpacing.sm),
                    )
                }
            }
            val ticks = detail?.heartRate.orEmpty()
            if (ticks.any { it.bpm != null }) {
                SectionShell(stringResource(R.string.workout_hr_title)) {
                    ApexCard {
                        val points = remember(ticks) { ticks.map { ChartPoint(it.epochMillis, it.bpm) } }
                        IntradayHrChart(
                            points = points,
                            windowStartMillis = w.startEpochMillis,
                            windowEndMillis = w.endEpochMillis,
                            clock = ChartClock(use24Hour = formatter.clock24h),
                            maxGapMillis = 3 * 60_000L,
                            provenance = stringResource(provenanceLabelRes(w.provenance)),
                            height = 160.dp,
                        )
                    }
                }
            }
            SectionShell(stringResource(R.string.workout_how_title)) {
                ApexCard {
                    Text(
                        stringResource(R.string.workout_how_body),
                        style = ApexTheme.type.body,
                        color = ApexTheme.colors.foregroundBody,
                    )
                }
            }
            if (canDelete(w)) {
                ApexButton(
                    text = stringResource(R.string.workout_delete_action),
                    onClick = { confirming = true },
                    style = ApexButtonStyle.Destructive,
                    enabled = deleteState != DeleteState.Deleting,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (deleteState == DeleteState.Failed) {
                    Text(
                        stringResource(R.string.workout_delete_failed),
                        style = ApexTheme.type.caption,
                        color = ApexTheme.colors.recoveryRedText,
                    )
                }
            }
        },
    )

    if (confirming && canDelete(w)) {
        ApexSheet(onDismiss = { confirming = false }, title = stringResource(R.string.workout_delete_title)) {
            Text(
                stringResource(R.string.workout_delete_body),
                style = ApexTheme.type.body,
                color = ApexTheme.colors.foregroundBody,
            )
            ApexButton(
                text = stringResource(R.string.workout_delete_confirm),
                onClick = {
                    confirming = false
                    onDelete()
                },
                style = ApexButtonStyle.Destructive,
                modifier = Modifier.fillMaxWidth(),
            )
            ApexButton(
                text = stringResource(R.string.workout_delete_cancel),
                onClick = { confirming = false },
                style = ApexButtonStyle.Secondary,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun ZonesBody(w: WorkoutEntity, detail: RepoWorkoutDetail?) {
    val apexMinutes = detail?.zoneMinutes
    if (hasMeasuredZoneMinutes(apexMinutes)) {
        val zoneRows = remember(apexMinutes) { zoneRowsOf(apexMinutes, null) }
        ZoneBars(
            zones = zoneRows.map { ZoneMinutes(stringResource(zoneLabelRes(it.zone)), null, it.seconds) },
            caption = stringResource(R.string.workout_zones_apex_caption),
            provenance = stringResource(R.string.workout_zones_apex_provenance),
        )
        return
    }
    val rows = remember(w) { sourceZoneSeconds(w) }
    if (rows.all { it == null }) {
        val text = if (w.provenance == DataProvenance.USER_REPORTED) {
            stringResource(R.string.workout_zones_none_manual)
        } else {
            stringResource(R.string.workout_zones_none)
        }
        ReasonPlaceholder(text = text, icon = ApexIcons.Info, size = ReasonSize.Medium)
        return
    }
    val labels = listOf(
        stringResource(R.string.workout_zone_peak),
        stringResource(R.string.workout_zone_vigorous),
        stringResource(R.string.workout_zone_moderate),
        stringResource(R.string.workout_zone_light),
    )
    ZoneBars(
        zones = labels.mapIndexed { i, label -> ZoneMinutes(label, null, rows[i]) },
        caption = stringResource(R.string.workout_zones_caption),
        provenance = stringResource(provenanceLabelRes(w.provenance)),
    )
}

@StringRes
private fun zoneLabelRes(zone: HeartRateZone): Int = when (zone) {
    HeartRateZone.ZONE_5 -> R.string.strain_zone_5
    HeartRateZone.ZONE_4 -> R.string.strain_zone_4
    HeartRateZone.ZONE_3 -> R.string.strain_zone_3
    HeartRateZone.ZONE_2 -> R.string.strain_zone_2
    HeartRateZone.ZONE_1 -> R.string.strain_zone_1
    HeartRateZone.BELOW_ZONES -> R.string.strain_zone_below
}

/** Seconds per source zone, hottest first (peak, vigorous, moderate, light). Null means the source reported nothing. */
internal fun sourceZoneSeconds(w: WorkoutEntity): List<Long?> = listOf(
    w.sourcePeakZoneMinutes,
    w.sourceVigorousZoneMinutes,
    w.sourceModerateZoneMinutes,
    w.sourceLightZoneMinutes,
).map { minutes -> minutes?.takeIf { it.isFinite() && it >= 0.0 }?.let { Math.round(it * 60.0) } }

// --- Previews -------------------------------------------------------------------------------------

private fun previewWorkout(provenance: DataProvenance) = WorkoutEntity(
    id = "preview",
    startEpochMillis = 1_800_000_000_000L,
    endEpochMillis = 1_800_000_000_000L + 42 * 60_000L,
    zoneOffsetSeconds = 0,
    epochDay = 20_800L,
    exerciseType = "RUNNING",
    displayName = "Morning run",
    activeDurationMillis = 42 * 60_000L,
    averageHeartRate = if (provenance == DataProvenance.USER_REPORTED) null else 152,
    maxHeartRate = if (provenance == DataProvenance.USER_REPORTED) null else 176,
    sourceLightZoneMinutes = if (provenance == DataProvenance.USER_REPORTED) null else 8.0,
    sourceModerateZoneMinutes = if (provenance == DataProvenance.USER_REPORTED) null else 20.0,
    sourceVigorousZoneMinutes = if (provenance == DataProvenance.USER_REPORTED) null else 12.0,
    sourcePeakZoneMinutes = if (provenance == DataProvenance.USER_REPORTED) null else 2.0,
    derivedTrimp = 88.0,
    derivedStrain = 10.3,
    perceivedExertion = if (provenance == DataProvenance.USER_REPORTED) 6 else null,
    provenance = provenance,
    updatedAtEpochMillis = 1_800_000_000_000L,
)

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

private fun previewDetail(workout: WorkoutEntity, withRecovery: Boolean): RepoWorkoutDetail {
    val start = workout.startEpochMillis
    return RepoWorkoutDetail(
        workout = workout,
        isDemo = true,
        recovery = if (withRecovery) {
            HeartRateRecoveryResult(peakBpm = 171.0, dropAt60 = 24.0, dropAt120 = 41.0, missing = null)
        } else {
            HeartRateRecoveryResult(peakBpm = null, dropAt60 = null, dropAt120 = null, missing = HrrMissing.RECOVERY_MINUTES_MISSING)
        },
        recoveryNeedsZones = false,
        zoneMinutes = mapOf(
            HeartRateZone.BELOW_ZONES to 3.0,
            HeartRateZone.ZONE_1 to 6.0,
            HeartRateZone.ZONE_2 to 12.0,
            HeartRateZone.ZONE_3 to 14.0,
            HeartRateZone.ZONE_4 to 6.0,
            HeartRateZone.ZONE_5 to 1.0,
        ),
        heartRate = (0 until 42).map { i ->
            HeartRateTick(start + i * 60_000L, if (i in 20..24) null else 120.0 + i * 1.2, workout.provenance)
        },
    )
}

private fun previewFull(provenance: DataProvenance): WorkoutEntity = previewWorkout(provenance).copy(
    caloriesKcal = 512.0,
    distanceMeters = 7_240.0,
    steps = 8_120L,
    activeZoneMinutes = 38,
    elevationGainMeters = 64.0,
)

@Preview(name = "Workout detail with recovery dark", heightDp = 1800)
@Composable
private fun DetailFullDark() = PreviewHost(true) {
    val w = previewFull(DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API)
    WorkoutDetailScreen(WorkoutDetailState.Found(w, previewDetail(w, true)), DeleteState.Idle, {}, {})
}

@Preview(name = "Workout detail recovery missing light", heightDp = 1800)
@Composable
private fun DetailFullLight() = PreviewHost(false) {
    val w = previewWorkout(DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API)
    WorkoutDetailScreen(WorkoutDetailState.Found(w, previewDetail(w, false)), DeleteState.Idle, {}, {})
}

@Preview(name = "Workout detail recorded dark", heightDp = 900)
@Composable
private fun DetailRecordedDark() = PreviewHost(true) {
    WorkoutDetailScreen(WorkoutDetailState.Found(previewWorkout(DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API)), DeleteState.Idle, {}, {})
}

@Preview(name = "Workout detail manual light", heightDp = 900)
@Composable
private fun DetailManualLight() = PreviewHost(false) {
    WorkoutDetailScreen(WorkoutDetailState.Found(previewWorkout(DataProvenance.USER_REPORTED)), DeleteState.Idle, {}, {})
}

@Preview(name = "Workout not found dark", heightDp = 500)
@Composable
private fun DetailNotFoundDark() = PreviewHost(true) {
    WorkoutDetailScreen(WorkoutDetailState.NotFound, DeleteState.Idle, {}, {})
}

@Preview(name = "Workout not found light", heightDp = 500)
@Composable
private fun DetailNotFoundLight() = PreviewHost(false) {
    WorkoutDetailScreen(WorkoutDetailState.NotFound, DeleteState.Idle, {}, {})
}
