package com.apex.athlete.ui.health

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.charts.ChartClock
import com.apex.athlete.core.ui.charts.ChartPoint
import com.apex.athlete.core.ui.charts.IntradayHrChart
import com.apex.athlete.core.ui.charts.ZoneBars
import com.apex.athlete.core.ui.charts.ZoneMinutes
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.DatePill
import com.apex.athlete.core.ui.components.KeyStatRow
import com.apex.athlete.core.ui.components.ReasonPlaceholder
import com.apex.athlete.core.ui.components.SkeletonLineFill
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.shell.DetailShell
import com.apex.athlete.core.ui.shell.SectionShell
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.navigation.ApexNavigator
import com.apex.athlete.ui.common.LocalFormatter
import com.apex.athlete.ui.common.MetricStateMapper
import com.apex.athlete.ui.common.apexViewModel
import java.time.LocalDate
import java.time.ZoneId

/**
 * Heart rate for one day. The repository exposes the day only as 5-minute averages
 * (`AthleteRepository.strainLoad(day).heartRate`), so that is what is drawn; empty buckets stay gaps.
 */
@Composable
fun HeartRateDayRoute(navigator: ApexNavigator, day: LocalDate, onDayChange: (LocalDate) -> Unit) {
    val vm = apexViewModel(key = "health-hr-day") { container, _ -> HeartRateDayViewModel(container.repository, day.toEpochDay()) }
    LaunchedEffect(day) { vm.setDay(day.toEpochDay()) }
    val state by vm.state.collectAsStateWithLifecycle()
    val formatter = LocalFormatter.current
    val mapper = remember(formatter) { MetricStateMapper(formatter) }
    val ui = remember(state, mapper, formatter) { state?.let { buildHeartRateDay(it, mapper, formatter) } }
    val clock = remember(formatter) { ChartClock(ZoneId.systemDefault(), formatter.clock24h) }
    val isToday = day == formatter.today()
    HeartRateDayScreen(
        ui = ui,
        clock = clock,
        nowMillis = if (isToday) formatter.now() else null,
        dayLabel = formatter.dayLabel(day),
        canGoNext = day < formatter.today(),
        sourceText = ui?.let { provenanceText(it.provenance, formatter) },
        derivedText = provenanceText(DataProvenance.MATHEMATICALLY_DERIVED, formatter),
        onPreviousDay = { onDayChange(day.minusDays(1)) },
        onNextDay = { onDayChange(day.plusDays(1)) },
        onToday = { onDayChange(formatter.today()) },
        onBack = navigator::back,
    )
}

@Composable
internal fun HeartRateDayScreen(
    ui: HeartRateDayUi?,
    clock: ChartClock,
    nowMillis: Long?,
    dayLabel: String,
    canGoNext: Boolean,
    sourceText: String?,
    derivedText: String,
    onPreviousDay: () -> Unit,
    onNextDay: () -> Unit,
    onToday: () -> Unit,
    onBack: () -> Unit,
) {
    DetailShell(
        title = stringResource(R.string.health_hr_day_title),
        onBack = onBack,
        backDescription = stringResource(R.string.common_back),
        hero = {
            DatePill(
                label = dayLabel,
                onPrevious = onPreviousDay,
                onNext = onNextDay,
                onLabelClick = onToday,
                canGoNext = canGoNext,
                previousDescription = stringResource(R.string.health_hr_prev_day),
                nextDescription = stringResource(R.string.health_hr_next_day),
                labelClickDescription = stringResource(R.string.health_hr_go_today),
            )
        },
        primary = {
            ApexCard {
                if (ui == null) {
                    SkeletonLineFill(height = 180.dp)
                } else {
                    IntradayHrChart(
                        points = ui.points,
                        windowStartMillis = ui.windowStartMillis,
                        windowEndMillis = ui.windowEndMillis,
                        clock = clock,
                        nowMillis = nowMillis,
                        provenance = sourceText,
                    )
                    Text(
                        stringResource(R.string.health_hr_chart_note),
                        style = ApexTheme.type.caption,
                        color = ApexTheme.colors.mutedForeground,
                        modifier = Modifier.padding(top = ApexSpacing.sm),
                    )
                }
            }
            ApexCard(contentPadding = PaddingValues(horizontal = ApexSpacing.cardPadding, vertical = ApexSpacing.sm)) {
                KeyStatRow(
                    label = stringResource(R.string.health_hr_resting),
                    state = ui?.resting ?: MetricState.Loading,
                    icon = ApexIcons.Heart,
                )
                KeyStatRow(label = stringResource(R.string.health_hr_lowest), state = ui?.lowest ?: MetricState.Loading)
                KeyStatRow(label = stringResource(R.string.health_hr_highest), state = ui?.highest ?: MetricState.Loading)
            }
            ZonesCard(ui, derivedText)
        },
        secondary = {
            SectionShell(stringResource(R.string.health_hr_info_title)) {
                ApexCard {
                    Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                        Info(stringResource(R.string.health_hr_info_buckets))
                        Info(stringResource(R.string.health_hr_info_zones))
                        Info(stringResource(R.string.health_hr_info_resting))
                    }
                }
            }
        },
    )
}

@Composable
private fun Info(text: String) {
    Text(text, style = ApexTheme.type.body, color = ApexTheme.colors.foregroundBody)
}

@Composable
private fun ZonesCard(ui: HeartRateDayUi?, derivedText: String) {
    ApexCard {
        Text(
            stringResource(R.string.health_hr_zones_title).uppercase(),
            style = ApexTheme.type.cardTitle,
            color = ApexTheme.colors.foreground,
            modifier = Modifier.semantics { heading() }.padding(bottom = ApexSpacing.md),
        )
        when {
            ui == null -> SkeletonLineFill(height = 96.dp)
            ui.zones != null -> ZoneBars(
                zones = ui.zones,
                caption = stringResource(R.string.health_hr_zones_caption),
                provenance = derivedText,
            )
            else -> ui.zonesMissing?.let { ReasonPlaceholder(it) }
        }
    }
}

// --- Previews -------------------------------------------------------------------------------------

private const val DAY_START = 1_760_000_000_000L
private const val BUCKET = 300_000L

private fun previewUi(withZones: Boolean = true): HeartRateDayUi {
    val points = (0 until 288).map { i ->
        val awake = i in 90..260
        val gap = i in 150..170
        ChartPoint(DAY_START + i * BUCKET, if (gap) null else if (awake) 70.0 + ((i * 13) % 40) else 52.0 + (i % 6))
    }
    val derived = DataProvenance.MATHEMATICALLY_DERIVED
    return HeartRateDayUi(
        points = points,
        windowStartMillis = DAY_START,
        windowEndMillis = DAY_START + 288 * BUCKET,
        resting = MetricState.Value(52.0, 0, "bpm", DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API),
        lowest = MetricState.Value(51.0, 0, "bpm", derived),
        highest = MetricState.Value(108.0, 0, "bpm", derived),
        zones = if (withZones) {
            listOf(
                ZoneMinutes("Zone 5", "175 to 190 bpm", 0L),
                ZoneMinutes("Zone 4", "160 to 175 bpm", 600L),
                ZoneMinutes("Zone 3", "145 to 160 bpm", 1_200L),
                ZoneMinutes("Zone 2", "130 to 145 bpm", 2_400L),
                ZoneMinutes("Zone 1", "115 to 130 bpm", 3_600L),
                ZoneMinutes("Rest", "Below 115 bpm", 40_000L),
            )
        } else {
            null
        },
        zonesMissing = if (withZones) null else MetricState.Unavailable(detail = "Needs a maximum heart rate. Add your age or a measured value in your profile."),
        provenance = DataProvenance.SYNTHETIC_DEMO,
    )
}

@Composable
private fun PreviewBody(ui: HeartRateDayUi?) {
    HeartRateDayScreen(
        ui = ui, clock = ChartClock(ZoneId.of("UTC"), true), nowMillis = null, dayLabel = "Yesterday", canGoNext = true,
        sourceText = "Demo data", derivedText = "Calculated", onPreviousDay = {}, onNextDay = {}, onToday = {}, onBack = {},
    )
}

@HealthThemePreviews
@Composable
private fun HeartRateDayPreview() = HealthPreviewFrame { PreviewBody(previewUi()) }

@HealthThemePreviews
@Composable
private fun HeartRateDayNoZonesPreview() = HealthPreviewFrame { PreviewBody(previewUi(withZones = false)) }

@HealthThemePreviews
@Composable
private fun HeartRateDayLoadingPreview() = HealthPreviewFrame { PreviewBody(null) }
