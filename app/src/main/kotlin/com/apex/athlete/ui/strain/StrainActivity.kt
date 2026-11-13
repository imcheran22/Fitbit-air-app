package com.apex.athlete.ui.strain

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.apex.athlete.R
import com.apex.athlete.core.data.pipeline.DayAnalysis
import com.apex.athlete.core.data.repository.ACTIVITY_METRICS
import com.apex.athlete.core.data.repository.ActivityDayState
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.charts.ChartTone
import com.apex.athlete.core.ui.charts.DailyBar
import com.apex.athlete.core.ui.charts.DailyBarChart
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.KeyStatRow
import com.apex.athlete.core.ui.components.Skeleton
import com.apex.athlete.core.ui.components.provenanceLabelRes
import com.apex.athlete.core.ui.shell.SectionShell
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.theme.ApexShapes
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.core.ui.theme.ThemePreference
import com.apex.athlete.ui.common.ApexFormatter
import com.apex.athlete.ui.common.LocalFormatter
import com.apex.athlete.ui.common.activityLabelRes
import com.apex.athlete.ui.common.ActivityRowUi
import com.apex.athlete.ui.common.activityRows

/** What the Strain screen's Activity section draws. */
internal data class ActivitySectionUi(
    val rows: List<ActivityRowUi>,
    val steps: List<DailyBar>,
    val stepsStartDay: Long,
    val stepsEndDay: Long,
    val stepsProvenance: DataProvenance?,
    val isProvisional: Boolean,
)

/** Maps the repository day to the section; a result for another day is not shown (the caller passes null while loading). */
internal fun buildActivitySectionUi(state: ActivityDayState, formatter: ApexFormatter): ActivitySectionUi {
    val history = state.stepsHistory
    return ActivitySectionUi(
        rows = activityRows(state.readings, ACTIVITY_METRICS, formatter, state.isProvisional),
        steps = stepsBars(history, state.isProvisional),
        stepsStartDay = history.firstOrNull()?.epochDay ?: state.epochDay,
        stepsEndDay = history.lastOrNull()?.epochDay ?: state.epochDay,
        stepsProvenance = state.readings[MetricType.STEPS]?.provenance,
        isProvisional = state.isProvisional,
    )
}

/** The athlete's own usual strain (the base of the personal target), or Calibrating below 5 recorded days. */
@Composable
internal fun PersonalTargetRow(analysis: DayAnalysis?) {
    val state = if (analysis == null) MetricState.Loading else personalStrainBaseState(analysis.personalStrainBase)
    KeyStatRow(stringResource(R.string.strain_personal_base), state)
    if (state is MetricState.Calibrating) {
        Text(
            stringResource(R.string.strain_personal_needs, MIN_PERSONAL_STRAIN_DAYS),
            style = ApexTheme.type.caption,
            color = ApexTheme.colors.mutedForeground,
        )
    }
}

@Composable
internal fun ActivitySection(activity: ActivityDayState?, day: java.time.LocalDate, formatter: ApexFormatter) {
    val ui = remember(activity, day, formatter) {
        activity?.takeIf { it.epochDay == day.toEpochDay() }?.let { buildActivitySectionUi(it, formatter) }
    }
    ActivitySectionContent(ui)
}

@Composable
internal fun ActivitySectionContent(ui: ActivitySectionUi?) {
    SectionShell(stringResource(R.string.strain_activity_title)) {
        ApexCard {
            if (ui == null) {
                ACTIVITY_METRICS.forEach { metric ->
                    val label = activityLabelRes(metric)?.let { stringResource(it) } ?: return@forEach
                    KeyStatRow(label, MetricState.Loading)
                }
                return@ApexCard
            }
            ui.rows.forEach { row ->
                val label = activityLabelRes(row.metric)?.let { stringResource(it) } ?: return@forEach
                KeyStatRow(label, row.state)
            }
            if (ui.isProvisional) {
                Text(
                    stringResource(R.string.strain_activity_provisional),
                    style = ApexTheme.type.caption,
                    color = ApexTheme.colors.mutedForeground,
                )
            }
        }
        ApexCard {
            if (ui == null) {
                Skeleton(Modifier.fillMaxWidth().height(160.dp), ApexShapes.row)
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                    Text(
                        stringResource(R.string.strain_steps_history_title).uppercase(),
                        style = ApexTheme.type.cardTitle,
                        color = ApexTheme.colors.foregroundSecondary,
                    )
                    DailyBarChart(
                        title = stringResource(R.string.strain_steps_history_title),
                        bars = ui.steps,
                        startDay = ui.stepsStartDay,
                        endDay = ui.stepsEndDay,
                        provenance = ui.stepsProvenance?.let { stringResource(provenanceLabelRes(it)) },
                    )
                }
            }
        }
    }
}

// --- Previews -------------------------------------------------------------------------------------

private fun previewSection(): ActivitySectionUi {
    val sensor = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API
    val day = 20_800L
    return ActivitySectionUi(
        rows = listOf(
            ActivityRowUi(MetricType.STEPS, MetricState.Value(8_412.0, 0, null, sensor, isProvisional = true)),
            ActivityRowUi(MetricType.DISTANCE, MetricState.Value(6.12, 2, "km", sensor, isProvisional = true)),
            ActivityRowUi(MetricType.FLOORS, MetricState.Unavailable()),
            ActivityRowUi(MetricType.CALORIES_ACTIVE, MetricState.Value(512.0, 0, "kcal", sensor, isProvisional = true)),
            ActivityRowUi(MetricType.ACTIVE_ZONE_MINUTES, MetricState.Value(34.0, 0, "min", sensor, isProvisional = true)),
        ),
        steps = (day - 13..day).map { d ->
            DailyBar(d, if (d % 5L == 0L) null else 6_000.0 + (d % 7) * 900.0, ChartTone.STRAIN, provisional = d == day)
        },
        stepsStartDay = day - 13,
        stepsEndDay = day,
        stepsProvenance = sensor,
        isProvisional = true,
    )
}

@Composable
private fun PreviewHost(dark: Boolean, content: @Composable () -> Unit) {
    val context = LocalContext.current
    val formatter = remember { ApexFormatter(context) }
    CompositionLocalProvider(LocalFormatter provides formatter) {
        ApexTheme(if (dark) ThemePreference.DARK else ThemePreference.LIGHT) {
            Box(Modifier.background(ApexTheme.colors.background)) {
                Column(Modifier.fillMaxWidth().padding(ApexSpacing.gutter)) { content() }
            }
        }
    }
}

@Preview(name = "Strain activity dark", heightDp = 1100)
@Composable
private fun ActivityDark() = PreviewHost(true) { ActivitySectionContent(previewSection()) }

@Preview(name = "Strain activity light", heightDp = 1100)
@Composable
private fun ActivityLight() = PreviewHost(false) { ActivitySectionContent(previewSection()) }

@Preview(name = "Strain activity loading light", heightDp = 800)
@Composable
private fun ActivityLoadingLight() = PreviewHost(false) { ActivitySectionContent(null) }
