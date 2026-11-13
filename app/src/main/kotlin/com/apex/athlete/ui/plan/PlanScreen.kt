package com.apex.athlete.ui.plan

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.res.stringResource
import androidx.compose.material3.Text
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.analytics.plan.NoPlanReason
import com.apex.athlete.core.analytics.plan.PlanLowConfidenceReason
import com.apex.athlete.core.analytics.plan.StrainBand
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.ChipTone
import com.apex.athlete.core.ui.components.ReasonPlaceholder
import com.apex.athlete.core.ui.components.ReasonSize
import com.apex.athlete.core.ui.components.Tag
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.shell.DetailShell
import com.apex.athlete.core.ui.shell.SectionShell
import com.apex.athlete.core.ui.state.MetricFormat
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.ui.common.LocalFormatter
import com.apex.athlete.ui.common.apexViewModel
import com.apex.athlete.ui.detail.BodyText
import com.apex.athlete.ui.detail.Caption
import com.apex.athlete.ui.detail.LoadingCard
import com.apex.athlete.ui.detail.StatBlock
import com.apex.athlete.ui.health.HealthPreviewFrame
import com.apex.athlete.ui.health.HealthThemePreviews
import java.time.LocalDate

/** The coming 7 days: a strain band and a one-line reason per day. Read-only. */
@Composable
fun PlanRoute(onBack: () -> Unit) {
    val vm = apexViewModel { container, _ -> PlanViewModel(container.repository) }
    val ui by vm.state.collectAsStateWithLifecycle()
    PlanScreen(ui = ui, onBack = onBack)
}

@Composable
internal fun PlanScreen(ui: PlanUi, onBack: () -> Unit) {
    DetailShell(
        title = stringResource(R.string.plan_title),
        onBack = onBack,
        backDescription = stringResource(R.string.common_back),
        hero = { BodyText(stringResource(R.string.plan_intro)) },
        primary = {
            when (ui) {
                PlanUi.Loading -> {
                    LoadingCard()
                    LoadingCard()
                }
                is PlanUi.NoPlan -> ApexCard {
                    ReasonPlaceholder(stringResource(R.string.plan_no_plan_title), ApexIcons.Info, size = ReasonSize.Medium)
                    Caption(stringResource(noPlanRes(ui.reason)))
                }
                is PlanUi.Ready -> {
                    if (ui.lowConfidence) ConfidenceCard(ui.lowConfidenceReasons)
                    ui.days.forEach { DayCard(it) }
                    ApexCard {
                        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                            StatBlock(stringResource(R.string.plan_sleep_label), ui.sleepTarget.withMinutes(stringResource(R.string.plan_unit_min)))
                            Caption(stringResource(R.string.plan_source_note))
                        }
                    }
                }
            }
        },
        secondary = {
            SectionShell(stringResource(R.string.plan_how_title)) {
                ApexCard {
                    Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                        BodyText(stringResource(R.string.plan_how_p1))
                        BodyText(stringResource(R.string.plan_how_p2))
                        BodyText(stringResource(R.string.plan_how_p3))
                        BodyText(stringResource(R.string.plan_how_p4))
                    }
                }
            }
        },
    )
}

@Composable
private fun ConfidenceCard(reasons: List<PlanLowConfidenceReason>) {
    ApexCard {
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
            Tag(stringResource(R.string.plan_confidence_low_title), tone = ChipTone.WARNING)
            reasons.forEach { BodyText(stringResource(lowConfidenceRes(it))) }
        }
    }
}

@Composable
private fun DayCard(day: PlanDayUi) {
    val f = LocalFormatter.current
    val label = f.dayLabel(LocalDate.ofEpochDay(day.epochDay))
    val band = stringResource(bandLabelRes(day.band))
    val reason = stringResource(reasonRes(day.reason))
    val strainLabel = stringResource(R.string.plan_strain_label)
    val centre = day.strainCentre
    val strainText = if (centre is MetricState.Value) MetricFormat.number(centre.value, centre.decimals, f.locale) else MetricFormat.MISSING
    val spoken = stringResource(R.string.plan_day_cd, label, stringResource(R.string.plan_band_cd, band), "$reason $strainLabel $strainText")
    ApexCard(spokenDescription = spoken) {
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
            Row(horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm), verticalAlignment = Alignment.CenterVertically) {
                Text(label, style = ApexTheme.type.bodyStrong, color = ApexTheme.colors.foreground)
                Tag(band, tone = toneFor(day.band))
            }
            BodyText(reason)
            StatBlock(strainLabel, centre)
        }
    }
}

private fun toneFor(band: StrainBand): ChipTone = when (band) {
    StrainBand.REST -> ChipTone.NEUTRAL
    StrainBand.LIGHT -> ChipTone.INFO
    StrainBand.MODERATE -> ChipTone.OPTIMAL
    StrainBand.HARD -> ChipTone.STRAIN
}

private fun MetricState.withMinutes(unit: String): MetricState = if (this is MetricState.Value) copy(unit = unit) else this

// --- Previews -------------------------------------------------------------------------------------

private fun previewReady(low: Boolean): PlanUi.Ready {
    val src = buildPlanUi(PlanSource(9.0, if (low) 30.0 else 72.0, null, !low, 480.0), 19_723L)
    return (src as PlanUi.Ready)
}

@HealthThemePreviews
@Composable
private fun PlanPreview() = HealthPreviewFrame { PlanScreen(previewReady(false), {}) }

@HealthThemePreviews
@Composable
private fun PlanLowRecoveryPreview() = HealthPreviewFrame { PlanScreen(previewReady(true), {}) }

@HealthThemePreviews
@Composable
private fun PlanNoPlanPreview() = HealthPreviewFrame { PlanScreen(PlanUi.NoPlan(NoPlanReason.STRAIN_BASE_MISSING), {}) }

@HealthThemePreviews
@Composable
private fun PlanLoadingPreview() = HealthPreviewFrame { PlanScreen(PlanUi.Loading, {}) }
