package com.apex.athlete.ui.fitness

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.charts.ChartPoint
import com.apex.athlete.core.ui.charts.DaySeries
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.ChipTone
import com.apex.athlete.core.ui.components.Tag
import com.apex.athlete.core.ui.shell.DetailShell
import com.apex.athlete.core.ui.shell.SectionShell
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.navigation.ApexNavigator
import com.apex.athlete.ui.common.LocalFormatter
import com.apex.athlete.ui.common.apexViewModel
import com.apex.athlete.ui.detail.BodyText
import com.apex.athlete.ui.detail.Caption
import com.apex.athlete.ui.detail.DayBanner
import com.apex.athlete.ui.detail.DetailLoad
import com.apex.athlete.ui.detail.FailedCard
import com.apex.athlete.ui.detail.LinkRow
import com.apex.athlete.ui.detail.LoadingCard
import com.apex.athlete.ui.detail.SeriesChartCard
import com.apex.athlete.ui.detail.SeriesPanel
import com.apex.athlete.ui.detail.SeriesUi
import com.apex.athlete.ui.detail.StatBlock
import com.apex.athlete.ui.detail.readyOrNull
import com.apex.athlete.ui.health.CardioLineUi
import com.apex.athlete.ui.health.CardioUi
import com.apex.athlete.ui.health.HealthPreviewFrame
import com.apex.athlete.ui.health.HealthThemePreviews
import java.time.LocalDate

/** Cardio fitness: VO2 max (labelled an estimate when it is one), category, fitness age and the VO2 trend. */
@Composable
fun FitnessRoute(navigator: ApexNavigator, day: LocalDate, onDayChange: (LocalDate) -> Unit) {
    val vm = apexViewModel { container, handle -> FitnessViewModel(day.toEpochDay(), handle, container.repository::fitness) }
    LaunchedEffect(day) { vm.setDay(day.toEpochDay()) }
    val load by vm.state.collectAsStateWithLifecycle()
    val formatter = LocalFormatter.current
    val ui = remember(load, formatter) { load.readyOrNull()?.let { buildFitnessDetail(it, formatter) } }
    var selected by rememberSaveable { mutableStateOf<Long?>(null) }
    FitnessScreen(
        title = formatter.dayLabel(day),
        canGoNext = day < formatter.today(),
        ui = ui,
        failed = load is DetailLoad.Failed,
        selectedDay = selected,
        dayLabel = { epochDay -> formatter.dayLabel(LocalDate.ofEpochDay(epochDay)) },
        onSelectDay = { selected = it },
        onOpenDay = { epochDay -> selected = null; onDayChange(LocalDate.ofEpochDay(epochDay)) },
        onOpenProfile = navigator::openProfile,
        onBack = navigator::back,
        onPrevious = { onDayChange(day.minusDays(1)) },
        onNext = { onDayChange(day.plusDays(1)) },
        onToday = { onDayChange(formatter.today()) },
    )
}

@Composable
internal fun FitnessScreen(
    title: String,
    canGoNext: Boolean,
    ui: FitnessDetailUi?,
    failed: Boolean,
    selectedDay: Long?,
    dayLabel: (Long) -> String,
    onSelectDay: (Long?) -> Unit,
    onOpenDay: (Long) -> Unit,
    onOpenProfile: () -> Unit,
    onBack: () -> Unit,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onToday: () -> Unit,
) {
    val cardio = ui?.cardio
    val caveat = if (cardio?.isEstimate == true) stringResource(R.string.health_fitness_estimate_caveat) else null
    val method = cardio?.method?.let { stringResource(R.string.health_fitness_method, it) }
    DetailShell(
        title = title,
        onBack = onBack,
        backDescription = stringResource(R.string.common_back),
        banner = { DayBanner(title, canGoNext, onPrevious, onNext, onToday) },
        hero = {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                StatBlock(
                    label = stringResource(R.string.health_metric_vo2),
                    state = cardio?.vo2?.state ?: MetricState.Loading,
                    valueStyle = ApexTheme.type.statValueLarge,
                    extras = listOfNotNull(caveat, method),
                )
                if (cardio?.isEstimate == true) Tag(stringResource(R.string.health_cardio_estimated), tone = ChipTone.INFO)
                if (caveat != null) Caption(caveat)
                if (method != null) Caption(method)
            }
        },
        primary = {
            if (failed) FailedCard()
            SectionShell(stringResource(R.string.fitness_section_lines)) {
                if (cardio == null) {
                    LoadingCard(160.dp)
                } else {
                    ApexCard {
                        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.lg)) {
                            Line(cardio.category)
                            Line(cardio.fitnessAge)
                            if (cardio.needsProfile) {
                                LinkRow(
                                    text = stringResource(R.string.health_open_profile),
                                    description = stringResource(R.string.health_cardio_profile_link_cd),
                                    onClick = onOpenProfile,
                                )
                            }
                        }
                    }
                    Caption(stringResource(R.string.health_cardio_caption))
                }
            }
            SectionShell(stringResource(R.string.fitness_section_trend)) {
                SeriesChartCard(
                    title = stringResource(R.string.fitness_trend_title),
                    panel = when {
                        ui == null -> SeriesPanel.Loading
                        ui.trend == null -> SeriesPanel.Empty
                        else -> SeriesPanel.Ready(ui.trend)
                    },
                    selectedDay = selectedDay,
                    onSelectDay = onSelectDay,
                    dayLabel = dayLabel,
                    onOpenDay = onOpenDay,
                    emptyText = stringResource(R.string.fitness_trend_empty),
                )
            }
        },
        secondary = {
            SectionShell(stringResource(R.string.detail_how_title)) {
                ApexCard {
                    Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                        BodyText(stringResource(R.string.fitness_how_p1))
                        BodyText(stringResource(R.string.fitness_how_p2))
                        BodyText(stringResource(R.string.fitness_how_p3))
                    }
                }
            }
        },
    )
}

@Composable
private fun Line(line: CardioLineUi) {
    val label = stringResource(line.titleRes)
    Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
        if (line.headline != null) Text(line.headline, style = ApexTheme.type.sectionTitle, color = ApexTheme.colors.foreground)
        StatBlock(label, line.state, valueStyle = ApexTheme.type.statValueLarge, extras = listOfNotNull(line.headline, line.note))
        if (line.note != null) Caption(line.note)
    }
}

// --- Previews -------------------------------------------------------------------------------------

private const val PREVIEW_END = 20_400L

private fun previewUi(missing: Boolean): FitnessDetailUi {
    val derived = DataProvenance.MATHEMATICALLY_DERIVED
    val vo2 = CardioLineUi(R.string.health_metric_vo2, MetricState.Value(47.5, 1, "ml/kg/min", DataProvenance.ESTIMATED), null, null, false)
    val cardio = if (missing) {
        CardioUi(
            vo2, true, "Heart-rate ratio (Uth et al. 2004)",
            CardioLineUi(R.string.health_cardio_category, MetricState.Unavailable(detail = "Choose your sex in Profile to see this."), null, null, true),
            CardioLineUi(R.string.health_cardio_age, MetricState.Unavailable(detail = "Choose your sex in Profile to see this."), null, null, true),
        )
    } else {
        CardioUi(
            vo2, true, "Heart-rate ratio (Uth et al. 2004)",
            CardioLineUi(R.string.health_cardio_category, MetricState.Value(71.0, 0, "percentile", derived), "Good", "Compared with adults of your age and sex", false),
            CardioLineUi(R.string.health_cardio_age, MetricState.Value(31.0, 0, "years", derived), null, "4 years younger than your age", false),
        )
    }
    val points = (0 until 90).map { i -> ChartPoint(PREVIEW_END - 89 + i, if (i % 13 == 4) null else 46.0 + (i % 9) * 0.3) }
    return FitnessDetailUi(cardio, SeriesUi(MetricType.VO2_MAX, DaySeries("VO2 max", points, " ml/kg/min", 1), PREVIEW_END - 89, PREVIEW_END, "Estimated"), PREVIEW_END)
}

@HealthThemePreviews
@Composable
private fun FitnessPreview() = HealthPreviewFrame {
    FitnessScreen("Today", false, previewUi(false), false, PREVIEW_END - 8, { "Mon, Nov 9" }, {}, {}, {}, {}, {}, {}, {})
}

@HealthThemePreviews
@Composable
private fun FitnessNeedsProfilePreview() = HealthPreviewFrame {
    FitnessScreen("Today", false, previewUi(true), false, null, { "Mon, Nov 9" }, {}, {}, {}, {}, {}, {}, {})
}

@HealthThemePreviews
@Composable
private fun FitnessLoadingPreview() = HealthPreviewFrame {
    FitnessScreen("Today", false, null, false, null, { "Mon, Nov 9" }, {}, {}, {}, {}, {}, {}, {})
}
