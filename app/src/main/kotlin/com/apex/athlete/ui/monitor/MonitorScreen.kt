package com.apex.athlete.ui.monitor

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.ChipTone
import com.apex.athlete.core.ui.components.GoodDirection
import com.apex.athlete.core.ui.components.KeyStatRow
import com.apex.athlete.core.ui.components.SkeletonLine
import com.apex.athlete.core.ui.components.Tag
import com.apex.athlete.core.ui.shell.DetailShell
import com.apex.athlete.core.ui.shell.SectionShell
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.navigation.ApexNavigator
import com.apex.athlete.ui.common.LocalFormatter
import com.apex.athlete.ui.common.MetricStateMapper
import com.apex.athlete.ui.common.apexViewModel
import com.apex.athlete.ui.detail.BodyText
import com.apex.athlete.ui.detail.Caption
import com.apex.athlete.ui.detail.DayBanner
import com.apex.athlete.ui.detail.DetailLoad
import com.apex.athlete.ui.detail.FailedCard
import com.apex.athlete.ui.detail.readyOrNull
import com.apex.athlete.ui.health.HealthPreviewFrame
import com.apex.athlete.ui.health.HealthThemePreviews
import java.time.LocalDate

/** Every vital with its 30 day personal range and an out-of-range flag; tapping a vital opens its trend. */
@Composable
fun MonitorRoute(navigator: ApexNavigator, day: LocalDate, onDayChange: (LocalDate) -> Unit) {
    val vm = apexViewModel { container, handle ->
        val repository = container.repository
        MonitorViewModel(day.toEpochDay(), handle, repository::dashboard, repository::vitals, repository::trends)
    }
    LaunchedEffect(day) { vm.setDay(day.toEpochDay()) }
    val dashboard by vm.state.collectAsStateWithLifecycle()
    val vitals by vm.vitals.collectAsStateWithLifecycle()
    val trends by vm.trends.collectAsStateWithLifecycle()
    val formatter = LocalFormatter.current
    val mapper = remember(formatter) { MetricStateMapper(formatter) }
    val night = remember(dashboard, mapper, formatter) { dashboard.readyOrNull()?.let { buildNightCards(it.monitor, mapper, formatter) } }
    val more = remember(vitals, trends, formatter) { vitals.readyOrNull()?.let { buildMoreCards(it, trends.readyOrNull(), formatter) } }
    MonitorScreen(
        title = formatter.dayLabel(day),
        canGoNext = day < formatter.today(),
        night = night,
        more = more,
        failed = dashboard is DetailLoad.Failed || vitals is DetailLoad.Failed,
        onOpenTrend = navigator::openTrend,
        onBack = navigator::back,
        onPrevious = { onDayChange(day.minusDays(1)) },
        onNext = { onDayChange(day.plusDays(1)) },
        onToday = { onDayChange(formatter.today()) },
    )
}

@Composable
internal fun MonitorScreen(
    title: String,
    canGoNext: Boolean,
    night: List<VitalCardUi>?,
    more: List<VitalCardUi>?,
    failed: Boolean,
    onOpenTrend: (MetricType) -> Unit,
    onBack: () -> Unit,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onToday: () -> Unit,
) {
    val summary = monitorSummary(night, more)
    DetailShell(
        title = title,
        onBack = onBack,
        backDescription = stringResource(R.string.common_back),
        banner = { DayBanner(title, canGoNext, onPrevious, onNext, onToday) },
        hero = {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                when (summary) {
                    MonitorSummary.Loading -> SkeletonLine(width = 200.dp, height = 24.dp)
                    MonitorSummary.Learning -> SummaryText(stringResource(R.string.monitor_summary_learning))
                    MonitorSummary.AllInside -> SummaryText(stringResource(R.string.monitor_summary_inside))
                    is MonitorSummary.Outside -> SummaryText(pluralStringResource(R.plurals.monitor_summary_outside, summary.count, summary.count))
                }
                Caption(stringResource(R.string.monitor_summary_caption))
            }
        },
        primary = {
            if (failed) FailedCard()
            SectionShell(stringResource(R.string.monitor_section_night)) { VitalsCard(night, NIGHT_PLACEHOLDERS, onOpenTrend) }
            SectionShell(stringResource(R.string.monitor_section_more)) { VitalsCard(more, MORE_PLACEHOLDERS, onOpenTrend) }
        },
        secondary = {
            SectionShell(stringResource(R.string.detail_how_title)) {
                ApexCard {
                    Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                        BodyText(stringResource(R.string.monitor_how_p1))
                        BodyText(stringResource(R.string.monitor_how_p2))
                        BodyText(stringResource(R.string.monitor_how_p3))
                    }
                }
            }
        },
    )
}

private val NIGHT_PLACEHOLDERS = listOf(
    R.string.health_metric_hrv, R.string.health_metric_rhr, R.string.health_metric_resp, R.string.health_metric_spo2, R.string.health_metric_skin,
)

private val MORE_PLACEHOLDERS = listOf(
    R.string.health_metric_skin_nightly, R.string.health_metric_spo2_low, R.string.health_metric_spo2_high, R.string.health_metric_hrv_deep,
    R.string.health_metric_hrv_sleep_samples, R.string.health_metric_hrv_lf, R.string.health_metric_hrv_hf, R.string.health_metric_sleeping_hr,
)

@Composable
private fun SummaryText(text: String) {
    Text(text, style = ApexTheme.type.sectionTitle, color = ApexTheme.colors.foreground, textAlign = TextAlign.Center)
}

@Composable
private fun VitalsCard(cards: List<VitalCardUi>?, placeholders: List<Int>, onOpenTrend: (MetricType) -> Unit) {
    ApexCard(contentPadding = PaddingValues(horizontal = ApexSpacing.cardPadding, vertical = ApexSpacing.sm)) {
        if (cards == null) {
            placeholders.forEach { res -> KeyStatRow(label = stringResource(res), state = MetricState.Loading) }
        } else {
            cards.forEach { c -> VitalRow(c, onOpenTrend) }
        }
    }
}

@Composable
private fun VitalRow(c: VitalCardUi, onOpenTrend: (MetricType) -> Unit) {
    KeyStatRow(
        label = stringResource(c.titleRes),
        state = c.state,
        average = c.average,
        averageDecimals = c.decimals,
        sd = c.sd,
        goodDirection = c.good,
        onClick = if (c.opensTrend) ({ onOpenTrend(c.metric) }) else null,
    )
    val flagRes = c.flag.labelRes
    if (flagRes != null) {
        Tag(
            stringResource(flagRes),
            modifier = Modifier.padding(bottom = ApexSpacing.xs),
            tone = if (c.flag == RangeFlag.INSIDE) ChipTone.NEUTRAL else ChipTone.WARNING,
        )
    }
    Caption(c.bandText ?: stringResource(R.string.monitor_band_none))
    if (c.sampleNote != null) Caption(c.sampleNote)
    androidx.compose.foundation.layout.Spacer(Modifier.height(ApexSpacing.sm))
}

// --- Previews -------------------------------------------------------------------------------------

private val PreviewSensor = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API

private fun previewCards(): List<VitalCardUi> = listOf(
    VitalCardUi(MetricType.HRV_RMSSD, R.string.health_metric_hrv, MetricState.Value(48.0, 0, "ms", PreviewSensor), 62.0, 8.0, 0, GoodDirection.UP,
        "Your 30-day range: 54 to 70 ms", RangeFlag.BELOW, null, true),
    VitalCardUi(MetricType.RESTING_HEART_RATE, R.string.health_metric_rhr, MetricState.Value(52.0, 0, "bpm", PreviewSensor), 53.0, 2.0, 0, GoodDirection.DOWN,
        "Your 30-day range: 51 to 55 bpm", RangeFlag.INSIDE, null, true),
    VitalCardUi(MetricType.RESPIRATORY_RATE, R.string.health_metric_resp, MetricState.Calibrating(3), null, null, 1, GoodDirection.NEUTRAL,
        null, RangeFlag.NONE, null, true),
    VitalCardUi(MetricType.HRV_LOW_FREQUENCY, R.string.health_metric_hrv_lf, MetricState.Value(412.0, 0, "ms²", PreviewSensor), null, null, 0, GoodDirection.NEUTRAL,
        null, RangeFlag.NONE, "Night average of 9 samples", false),
)

@HealthThemePreviews
@Composable
private fun MonitorPreview() = HealthPreviewFrame {
    MonitorScreen("Today", false, previewCards(), previewCards().take(2), false, {}, {}, {}, {}, {})
}

@HealthThemePreviews
@Composable
private fun MonitorLoadingPreview() = HealthPreviewFrame {
    MonitorScreen("Today", false, null, null, false, {}, {}, {}, {}, {})
}
