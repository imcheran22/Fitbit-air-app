package com.apex.athlete.ui.healthage

import android.content.res.Configuration
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.analytics.healthage.HealthAge
import com.apex.athlete.core.analytics.healthage.HealthAgeConfidence
import com.apex.athlete.core.analytics.healthage.HealthAgeFactor
import com.apex.athlete.core.analytics.healthage.HealthAgeNoDataReason
import com.apex.athlete.core.analytics.healthage.HealthAgeResult
import com.apex.athlete.core.analytics.healthage.ContributionDirection
import com.apex.athlete.core.analytics.healthage.FactorContribution
import com.apex.athlete.core.analytics.healthage.WithheldFactor
import com.apex.athlete.core.analytics.healthage.WithheldReason
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.ChipTone
import com.apex.athlete.core.ui.components.ReasonPlaceholder
import com.apex.athlete.core.ui.components.ReasonSize
import com.apex.athlete.core.ui.components.SkeletonLineFill
import com.apex.athlete.core.ui.components.Tag
import com.apex.athlete.core.ui.components.hideFromTalkBack
import com.apex.athlete.core.ui.components.provenanceLabelRes
import com.apex.athlete.core.ui.components.spoken
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.shell.DetailShell
import com.apex.athlete.core.ui.shell.SectionShell
import com.apex.athlete.core.ui.state.MetricFormat
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.state.metricSpoken
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.navigation.ApexNavigator
import com.apex.athlete.ui.common.apexViewModel
import com.apex.athlete.ui.detail.BodyText
import com.apex.athlete.ui.detail.Caption
import com.apex.athlete.ui.detail.LinkRow
import com.apex.athlete.ui.detail.StatBlock
import com.apex.athlete.ui.health.HealthPreviewFrame
import kotlinx.coroutines.flow.map
import kotlin.math.abs

/** The ViewModel shared by the Health tab card and the detail route (each gets its own instance, keyed by [key]). */
@Composable
fun rememberHealthAgeUi(key: String): HealthAgeUi {
    val vm = apexViewModel<HealthAgeViewModel>(key = key) { container, _ ->
        HealthAgeViewModel(
            enabled = container.settings.settings.map { it.healthAgeEnabled },
            sources = healthAgeSources(container.repository, container.settings.profile),
        )
    }
    val load by vm.state.collectAsStateWithLifecycle()
    return remember(load) { buildHealthAgeUi(load) }
}

/** Experimental health age detail (route `health/age`). With the Settings switch off it only explains how to turn it on. */
@Composable
fun HealthAgeRoute(navigator: ApexNavigator) {
    val ui = rememberHealthAgeUi("healthage.detail")
    HealthAgeScreen(
        ui = ui,
        onBack = navigator::back,
        onOpenSettings = navigator::openSettings,
        onOpenProfile = navigator::openProfile,
    )
}

@Composable
private fun yearsUnit(state: MetricState.Value): MetricState.Value = state.copy(unit = stringResource(R.string.healthage_unit_years))

@Composable
private fun deltaSentence(ui: HealthAgeUi.Estimate): String {
    val magnitude = MetricFormat.number(abs(ui.deltaYears), 1)
    return when (ui.direction) {
        AgeDirection.OLDER -> stringResource(R.string.healthage_delta_older, magnitude)
        AgeDirection.YOUNGER -> stringResource(R.string.healthage_delta_younger, magnitude)
        AgeDirection.SAME -> stringResource(R.string.healthage_delta_same)
    }
}

@Composable
internal fun HealthAgeScreen(
    ui: HealthAgeUi,
    onBack: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenProfile: () -> Unit,
) {
    DetailShell(
        title = stringResource(R.string.healthage_title),
        onBack = onBack,
        backDescription = stringResource(R.string.common_back),
        hero = { Hero(ui) },
        primary = {
            when (ui) {
                HealthAgeUi.Pending, HealthAgeUi.Loading -> ApexCard { SkeletonLineFill(height = 120.dp) }
                HealthAgeUi.Off -> ApexCard {
                    Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                        Text(stringResource(R.string.healthage_off_title), style = ApexTheme.type.cardTitle, color = ApexTheme.colors.foreground)
                        BodyText(stringResource(R.string.healthage_off_body))
                        LinkRow(
                            text = stringResource(R.string.healthage_off_action),
                            description = stringResource(R.string.healthage_off_action_cd),
                            onClick = onOpenSettings,
                        )
                    }
                }
                HealthAgeUi.Failed -> ApexCard {
                    ReasonPlaceholder(stringResource(R.string.healthage_failed), ApexIcons.Warning, size = ReasonSize.Medium)
                }
                is HealthAgeUi.NoData -> ApexCard {
                    Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                        BodyText(stringResource(ui.reasonRes))
                        LinkRow(
                            text = stringResource(R.string.healthage_open_profile),
                            description = stringResource(R.string.healthage_open_profile_cd),
                            onClick = onOpenProfile,
                        )
                    }
                }
                is HealthAgeUi.NotEnough -> {
                    ApexCard {
                        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                            BodyText(stringResource(ui.reasonRes))
                            Caption(stringResource(R.string.healthage_notenough_scored, ui.scoredDaySeriesFactors))
                        }
                    }
                    WithheldSection(ui.withheld)
                }
                is HealthAgeUi.Estimate -> {
                    SectionShell(stringResource(R.string.healthage_section_factors)) {
                        Caption(stringResource(R.string.healthage_factors_caption))
                        if (ui.totalCapped) Caption(stringResource(R.string.healthage_capped_caption))
                        ApexCard {
                            Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.lg)) {
                                ui.factors.forEach { FactorRow(it) }
                            }
                        }
                    }
                    WithheldSection(ui.withheld)
                }
            }
        },
        secondary = {
            if (ui is HealthAgeUi.Estimate || ui is HealthAgeUi.NotEnough || ui is HealthAgeUi.NoData) {
                SectionShell(stringResource(R.string.detail_how_title)) {
                    ApexCard {
                        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                            BodyText(stringResource(R.string.healthage_how_p1))
                            BodyText(stringResource(R.string.healthage_how_p2))
                            BodyText(stringResource(R.string.healthage_how_p3))
                            BodyText(stringResource(R.string.healthage_how_p4))
                        }
                    }
                }
                SectionShell(stringResource(R.string.healthage_disclaimer_title)) {
                    ApexCard {
                        BodyText(if (ui is HealthAgeUi.Estimate) ui.disclaimer else HealthAge.DISCLAIMER)
                    }
                }
            }
        },
    )
}

@Composable
private fun Hero(ui: HealthAgeUi) {
    if (ui !is HealthAgeUi.Estimate) return
    val delta = deltaSentence(ui)
    val confidence = stringResource(ui.confidenceRes)
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
        StatBlock(
            label = stringResource(R.string.healthage_hero_label),
            state = yearsUnit(ui.age),
            valueStyle = ApexTheme.type.statValueLarge,
            extras = listOf(delta, stringResource(R.string.healthage_calendar_age, ui.chronologicalAge), confidence),
        )
        Text(delta, style = ApexTheme.type.sectionTitle, color = ApexTheme.colors.foreground)
        Caption(stringResource(R.string.healthage_calendar_age, ui.chronologicalAge))
        Row(horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
            Tag(confidence, tone = ChipTone.INFO)
            Tag(stringResource(R.string.healthage_tag_experimental))
        }
        Caption(stringResource(R.string.healthage_confidence_caption))
        if (ui.isDemo) {
            Tag(stringResource(R.string.healthage_tag_demo), tone = ChipTone.WARNING)
            Caption(stringResource(R.string.healthage_demo_caption))
        }
    }
}

@Composable
private fun FactorRow(f: FactorUi) {
    val name = stringResource(f.nameRes)
    val value = f.unitRes?.let { f.value.copy(unit = stringResource(it)) } ?: f.value
    val provenance = value.provenance?.let { stringResource(provenanceLabelRes(it)) } ?: stringResource(com.apex.athlete.core.ui.R.string.provenance_unknown)
    val days = pluralStringResource(R.plurals.healthage_days, f.days, f.days)
    val years = stringResource(R.string.healthage_factor_years, f.yearsText)
    val word = stringResource(directionRes(f.direction))
    val capped = stringResource(R.string.healthage_factor_capped)
    val spoken = metricSpoken(name, value, listOfNotNull("$years, $word", days, capped.takeIf { f.capped }))
    Column(Modifier.fillMaxWidth().spoken(spoken)) {
        Column(Modifier.hideFromTalkBack(), verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(ApexSpacing.md), verticalAlignment = Alignment.Top) {
                Text(name, style = ApexTheme.type.body, color = ApexTheme.colors.foreground, modifier = Modifier.weight(1f))
                Column(horizontalAlignment = Alignment.End) {
                    Text("$years", style = ApexTheme.type.body, color = ApexTheme.colors.foreground)
                    Text(word.uppercase(), style = ApexTheme.type.statLabel, color = ApexTheme.colors.foregroundSecondary)
                }
            }
            Caption("${MetricFormat.withUnit(value.value, value.decimals, value.unit)} · $provenance · $days")
            if (f.capped) Caption(capped)
        }
    }
}

@Composable
private fun WithheldSection(withheld: List<WithheldUi>) {
    if (withheld.isEmpty()) return
    SectionShell(stringResource(R.string.healthage_section_withheld)) {
        Caption(stringResource(R.string.healthage_withheld_caption))
        ApexCard {
            Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                withheld.forEach { w ->
                    val name = stringResource(w.nameRes)
                    val reason = stringResource(w.reasonRes)
                    Column(Modifier.fillMaxWidth().spoken("$name, $reason"), verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
                        Column(Modifier.hideFromTalkBack()) {
                            Text(name, style = ApexTheme.type.body, color = ApexTheme.colors.foreground)
                            Text("${MetricFormat.MISSING}  $reason", style = ApexTheme.type.caption, color = ApexTheme.colors.mutedForeground)
                        }
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------- Health tab card

/** True when the Health tab shows the card: only while the switch is on (a pending or off setting shows nothing). */
fun HealthAgeUi.showsOnHealthTab(): Boolean = this != HealthAgeUi.Off && this != HealthAgeUi.Pending

/** The one entry card on the Health tab. Callers only show it when [showsOnHealthTab]. */
@Composable
fun HealthAgeCard(ui: HealthAgeUi, onOpen: () -> Unit) {
    SectionShell(stringResource(R.string.healthage_title)) {
        val open = stringResource(R.string.healthage_card_open)
        when (ui) {
            HealthAgeUi.Pending, HealthAgeUi.Off -> Unit
            HealthAgeUi.Loading -> ApexCard(spokenDescription = stringResource(R.string.healthage_loading_cd)) {
                SkeletonLineFill(height = 72.dp)
            }
            HealthAgeUi.Failed -> ApexCard(onClick = onOpen, onClickLabel = open) {
                ReasonPlaceholder(stringResource(R.string.healthage_failed), ApexIcons.Warning, size = ReasonSize.Medium)
            }
            is HealthAgeUi.NoData -> ApexCard(onClick = onOpen, onClickLabel = open) {
                Text(stringResource(R.string.healthage_nodata_title), style = ApexTheme.type.cardTitle, color = ApexTheme.colors.foreground)
                BodyText(stringResource(ui.reasonRes))
            }
            is HealthAgeUi.NotEnough -> ApexCard(onClick = onOpen, onClickLabel = open) {
                Text(stringResource(R.string.healthage_notenough_title), style = ApexTheme.type.cardTitle, color = ApexTheme.colors.foreground)
                BodyText(stringResource(ui.reasonRes))
            }
            is HealthAgeUi.Estimate -> {
                val delta = deltaSentence(ui)
                val confidence = stringResource(ui.confidenceRes)
                val state = yearsUnit(ui.age)
                ApexCard(
                    onClick = onOpen,
                    onClickLabel = open,
                    spokenDescription = metricSpoken(
                        stringResource(R.string.healthage_title),
                        state,
                        listOf(delta, confidence) + listOfNotNull(stringResource(R.string.healthage_demo_caption).takeIf { ui.isDemo }),
                    ),
                ) {
                    Column(Modifier.hideFromTalkBack(), verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                        StatBlock(stringResource(R.string.healthage_hero_label), state, valueStyle = ApexTheme.type.statValueLarge)
                        Text(delta, style = ApexTheme.type.body, color = ApexTheme.colors.foreground)
                        Row(horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                            Tag(confidence, tone = ChipTone.INFO)
                            Tag(stringResource(R.string.healthage_tag_experimental))
                            if (ui.isDemo) Tag(stringResource(R.string.healthage_tag_demo), tone = ChipTone.WARNING)
                        }
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------- Previews (light and dark)

private val previewEstimate: HealthAgeUi by lazy {
    fun c(f: HealthAgeFactor, v: Double, days: Int, years: Double, capped: Boolean = false) = FactorContribution(
        f, v, days, years, years, capped,
        when {
            years > 0 -> ContributionDirection.OLDER
            years < 0 -> ContributionDirection.YOUNGER
            else -> ContributionDirection.NEUTRAL
        },
    )
    buildHealthAgeUi(
        HealthAgeLoad.Ready(
            HealthAgeResult.Estimate(
                chronologicalAgeYears = 42,
                estimatedAgeYears = 40.6,
                deltaYears = -1.4,
                uncappedDeltaYears = -1.4,
                totalCapped = false,
                contributions = listOf(
                    c(HealthAgeFactor.VO2_MAX, 46.0, 1, -1.5),
                    c(HealthAgeFactor.RESTING_HEART_RATE, 58.0, 28, -0.7),
                    c(HealthAgeFactor.SLEEP_DURATION, 400.0, 29, 0.0),
                    c(HealthAgeFactor.DAILY_STEPS, 5200.0, 25, 1.4),
                ),
                withheld = listOf(
                    WithheldFactor(HealthAgeFactor.HRV, WithheldReason.NO_VALIDATED_NORM),
                    WithheldFactor(HealthAgeFactor.BMI, WithheldReason.MISSING),
                ),
                confidence = HealthAgeConfidence.MODERATE,
            ),
            isDemo = false,
        ),
    )
}

private val previewNotEnough: HealthAgeUi by lazy {
    buildHealthAgeUi(
        HealthAgeLoad.Ready(
            HealthAgeResult.NotEnoughData(
                reasons = listOf(com.apex.athlete.core.analytics.healthage.NotEnoughDataReason.NEED_VO2_MAX_OR_THREE_FACTORS),
                scoredDaySeriesFactors = 1,
                withheld = listOf(WithheldFactor(HealthAgeFactor.VO2_MAX, WithheldReason.MISSING)),
            ),
            isDemo = false,
        ),
    )
}

@Preview(name = "Health age dark", uiMode = Configuration.UI_MODE_NIGHT_YES or Configuration.UI_MODE_TYPE_NORMAL, heightDp = 1200)
@Preview(name = "Health age light", uiMode = Configuration.UI_MODE_NIGHT_NO or Configuration.UI_MODE_TYPE_NORMAL, heightDp = 1200)
@Composable
private fun HealthAgeScreenPreview() = HealthPreviewFrame {
    HealthAgeScreen(previewEstimate, onBack = {}, onOpenSettings = {}, onOpenProfile = {})
}

@Preview(name = "Health age off dark", uiMode = Configuration.UI_MODE_NIGHT_YES or Configuration.UI_MODE_TYPE_NORMAL, heightDp = 500)
@Preview(name = "Health age off light", uiMode = Configuration.UI_MODE_NIGHT_NO or Configuration.UI_MODE_TYPE_NORMAL, heightDp = 500)
@Composable
private fun HealthAgeOffPreview() = HealthPreviewFrame {
    HealthAgeScreen(HealthAgeUi.Off, onBack = {}, onOpenSettings = {}, onOpenProfile = {})
}

@Preview(name = "Health age cards dark", uiMode = Configuration.UI_MODE_NIGHT_YES or Configuration.UI_MODE_TYPE_NORMAL, heightDp = 700)
@Preview(name = "Health age cards light", uiMode = Configuration.UI_MODE_NIGHT_NO or Configuration.UI_MODE_TYPE_NORMAL, heightDp = 700)
@Composable
private fun HealthAgeCardsPreview() = HealthPreviewFrame {
    Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.lg)) {
        HealthAgeCard(previewEstimate, onOpen = {})
        HealthAgeCard(previewNotEnough, onOpen = {})
        HealthAgeCard(HealthAgeUi.NoData(noDataReasonRes(HealthAgeNoDataReason.NO_AGE)), onOpen = {})
    }
}
