package com.apex.athlete.ui.energy

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.charts.ChartClock
import com.apex.athlete.core.ui.charts.ChartPoint
import com.apex.athlete.core.ui.charts.EnergyCurveChart
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.ReasonPlaceholder
import com.apex.athlete.core.ui.components.ReasonSize
import com.apex.athlete.core.ui.components.KeyStatRow
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.shell.DetailShell
import com.apex.athlete.core.ui.shell.SectionShell
import com.apex.athlete.core.ui.state.MetricReason
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
import com.apex.athlete.ui.detail.EstimateTag
import com.apex.athlete.ui.detail.FailedCard
import com.apex.athlete.ui.detail.LinkRow
import com.apex.athlete.ui.detail.StatBlock
import com.apex.athlete.ui.detail.StateBody
import com.apex.athlete.ui.detail.WindowLabels
import com.apex.athlete.ui.detail.clockLabel
import com.apex.athlete.ui.detail.readyOrNull
import com.apex.athlete.ui.health.HealthPreviewFrame
import com.apex.athlete.ui.health.HealthThemePreviews
import java.time.LocalDate

/** The energy bank for one day: the curve, what drained and charged it, or why there is none. Always labelled an estimate. */
@Composable
fun EnergyRoute(navigator: ApexNavigator, day: LocalDate, onDayChange: (LocalDate) -> Unit) {
    val vm = apexViewModel { container, handle -> EnergyViewModel(day.toEpochDay(), handle, container.repository::stressEnergy) }
    LaunchedEffect(day) { vm.setDay(day.toEpochDay()) }
    val load by vm.state.collectAsStateWithLifecycle()
    val formatter = LocalFormatter.current
    val ui = remember(load, formatter) { load.readyOrNull()?.let { buildEnergyDetail(it, formatter) } }
    val clock = remember(formatter) { ChartClock(use24Hour = formatter.clock24h) }
    EnergyScreen(
        title = formatter.dayLabel(day),
        canGoNext = day < formatter.today(),
        ui = ui,
        failed = load is DetailLoad.Failed,
        clock = clock,
        onOpenStress = { navigator.openStress(day) },
        onBack = navigator::back,
        onPrevious = { onDayChange(day.minusDays(1)) },
        onNext = { onDayChange(day.plusDays(1)) },
        onToday = { onDayChange(formatter.today()) },
    )
}

@Composable
internal fun EnergyScreen(
    title: String,
    canGoNext: Boolean,
    ui: EnergyDetailUi?,
    failed: Boolean,
    clock: ChartClock,
    onOpenStress: () -> Unit,
    onBack: () -> Unit,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onToday: () -> Unit,
) {
    val shown = ui ?: EnergyDetailUi.Loading
    DetailShell(
        title = title,
        onBack = onBack,
        backDescription = stringResource(R.string.common_back),
        banner = { DayBanner(title, canGoNext, onPrevious, onNext, onToday) },
        hero = {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                StatBlock(
                    label = stringResource(R.string.energy_hero_label),
                    state = shown.bank,
                    valueStyle = ApexTheme.type.statValueLarge,
                    extras = listOf(stringResource(R.string.detail_estimate_spoken)),
                )
                EstimateTag()
            }
        },
        primary = {
            if (failed) FailedCard()
            SectionShell(stringResource(R.string.energy_section_curve)) { CurveCard(shown, clock) }
            if (shown.bank !is MetricState.Value && shown.bank !is MetricState.Loading) {
                // The reason (calibrating, needs recovery, needs zones ...) is already in the hero; no breakdown without a curve.
            } else {
                SectionShell(stringResource(R.string.energy_section_breakdown)) { BreakdownCard(shown) }
            }
            ApexCard {
                LinkRow(
                    text = stringResource(R.string.energy_link_stress),
                    description = stringResource(R.string.energy_link_stress_cd),
                    onClick = onOpenStress,
                )
            }
        },
        secondary = {
            SectionShell(stringResource(R.string.detail_how_title)) {
                ApexCard {
                    Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                        BodyText(stringResource(R.string.energy_how_p1))
                        BodyText(stringResource(R.string.energy_how_p2))
                        BodyText(stringResource(R.string.energy_how_p3))
                        BodyText(stringResource(R.string.energy_how_p4))
                    }
                }
            }
        },
    )
}

@Composable
private fun CurveCard(ui: EnergyDetailUi, clock: ChartClock) {
    ApexCard {
        when {
            ui.bank is MetricState.Value && ui.points.isNotEmpty() -> {
                val description = stringResource(
                    R.string.energy_chart_desc,
                    clockLabel(ui.windowStartMillis, clock),
                    clockLabel(ui.windowEndMillis, clock),
                    ui.bank.numberText(),
                    (ui.lowest as? MetricState.Value)?.numberText() ?: stringResource(com.apex.athlete.core.ui.R.string.apex_chart_value_missing),
                )
                EnergyCurveChart(
                    points = ui.points,
                    windowStartMillis = ui.windowStartMillis,
                    windowEndMillis = ui.windowEndMillis,
                    description = description,
                )
                WindowLabels(ui.windowStartMillis, ui.windowEndMillis, clock)
                Column(Modifier.padding(top = ApexSpacing.md), verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                    StatBlock(stringResource(R.string.energy_lowest), ui.lowest)
                    StatBlock(stringResource(R.string.energy_start), ui.start)
                    Caption(stringResource(R.string.energy_start_note))
                }
            }
            ui.bank is MetricState.Loading -> StateBody(ui.bank)
            ui.bank is MetricState.Value -> ReasonPlaceholder(stringResource(R.string.energy_chart_empty), ApexIcons.Info, size = ReasonSize.Medium)
            else -> ReasonPlaceholder(ui.bank, size = ReasonSize.Medium)
        }
    }
}

@Composable
private fun BreakdownCard(ui: EnergyDetailUi) {
    ApexCard(contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = ApexSpacing.cardPadding, vertical = ApexSpacing.sm)) {
        Caption(stringResource(R.string.energy_drained_title).uppercase(), Modifier.padding(top = ApexSpacing.sm))
        ui.drains.forEach { row -> KeyStatRow(label = stringResource(row.term.labelRes), state = row.state) }
        Caption(stringResource(R.string.energy_charged_title).uppercase(), Modifier.padding(top = ApexSpacing.sm))
        ui.charges.forEach { row -> KeyStatRow(label = stringResource(row.term.labelRes), state = row.state) }
        val unscored = ui.unscoredStressMinutes
        if (unscored != null) {
            Caption(pluralStringResource(R.plurals.energy_unscored_note, unscored, unscored), Modifier.padding(top = ApexSpacing.sm))
        }
        Caption(stringResource(R.string.energy_breakdown_note), Modifier.padding(vertical = ApexSpacing.sm))
    }
}

// --- Previews -------------------------------------------------------------------------------------

private val PreviewDerived = DataProvenance.MATHEMATICALLY_DERIVED
private const val PREVIEW_START = 1_800_000_000_000L

private fun previewUi(): EnergyDetailUi {
    val minute = 60_000L
    val curve = (0 until 360 step 5).map { i -> ChartPoint(PREVIEW_START + i * minute, if (i in 150..170) null else 88.0 - i * 0.12) }
    fun pts(v: Double) = MetricState.Value(v, 1, "points", PreviewDerived)
    return EnergyDetailUi(
        20_400L, MetricState.Value(46.0, 0, "/ 100", PreviewDerived), MetricState.Value(44.0, 0, "/ 100", PreviewDerived),
        MetricState.Value(88.0, 0, "/ 100", PreviewDerived),
        listOf(
            EnergyTermUi(EnergyTerm.BASAL, pts(38.4)), EnergyTermUi(EnergyTerm.ACTIVITY, pts(12.2)), EnergyTermUi(EnergyTerm.STRESS, pts(2.4)),
            EnergyTermUi(EnergyTerm.REST, pts(1.1)), EnergyTermUi(EnergyTerm.NAP, pts(0.0)),
        ),
        42, curve, PREVIEW_START, PREVIEW_START + 355 * minute, false,
    )
}

@HealthThemePreviews
@Composable
private fun EnergyPreview() = HealthPreviewFrame {
    EnergyScreen("Today", false, previewUi(), false, ChartClock(), {}, {}, {}, {}, {})
}

@HealthThemePreviews
@Composable
private fun EnergyMissingPreview() = HealthPreviewFrame {
    val missing = MetricState.Unavailable(MetricReason.NO_DATA, "Needs this morning's recovery score to start the bank.")
    val ui = EnergyDetailUi(
        20_400L, missing, missing, missing, EnergyTerm.entries.map { EnergyTermUi(it, missing) }, null, emptyList(), 0L, 0L, false,
    )
    EnergyScreen("Today", false, ui, false, ChartClock(), {}, {}, {}, {}, {})
}
