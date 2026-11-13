package com.apex.athlete.ui.nap

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.data.repository.NapReads
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.SleepStage
import com.apex.athlete.core.ui.charts.ChartClock
import com.apex.athlete.core.ui.charts.HypnogramSegment
import com.apex.athlete.core.ui.charts.SleepHypnogramChart
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.KeyStatRow
import com.apex.athlete.core.ui.components.MetricProvenance
import com.apex.athlete.core.ui.components.ReasonPlaceholder
import com.apex.athlete.core.ui.components.ReasonSize
import com.apex.athlete.core.ui.components.SkeletonLineFill
import com.apex.athlete.core.ui.components.hideFromTalkBack
import com.apex.athlete.core.ui.components.provenanceLabelRes
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.shell.DetailShell
import com.apex.athlete.core.ui.shell.SectionShell
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.state.MetricValueText
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.navigation.ApexNavigator
import com.apex.athlete.ui.common.LocalFormatter
import com.apex.athlete.ui.common.apexViewModel
import com.apex.athlete.ui.detail.BodyText
import com.apex.athlete.ui.detail.DetailLoad
import com.apex.athlete.ui.detail.FailedCard
import com.apex.athlete.ui.detail.StatBlock
import com.apex.athlete.ui.detail.readyOrNull
import com.apex.athlete.ui.health.HealthPreviewFrame
import com.apex.athlete.ui.health.HealthThemePreviews
import java.time.LocalDate
import java.time.ZoneOffset

/** The nap list shown on the Sleep screen for [day]: time range, duration and source per nap; a nap opens its detail. */
@Composable
fun NapsSectionRoute(navigator: ApexNavigator, day: LocalDate) {
    val vm = apexViewModel(key = "sleep-naps") { container, handle ->
        NapsViewModel(day.toEpochDay(), handle, NapReads(container.stores)::naps)
    }
    LaunchedEffect(day) { vm.setDay(day.toEpochDay()) }
    val load by vm.state.collectAsStateWithLifecycle()
    val formatter = LocalFormatter.current
    val rows = remember(load, formatter) { load.readyOrNull()?.let { buildNapRows(it, formatter) } }
    NapsSection(rows, failed = load is DetailLoad.Failed, onOpen = navigator::openNap)
}

/** [rows] null means still loading. An empty list is the honest "no nap recorded" state. */
@Composable
internal fun NapsSection(rows: List<NapRowUi>?, failed: Boolean, onOpen: (String) -> Unit) {
    SectionShell(stringResource(R.string.nap_section_title)) {
        when {
            failed -> FailedCard()
            rows == null -> ApexCard { SkeletonLineFill(height = 48.dp) }
            rows.isEmpty() -> ApexCard { ReasonPlaceholder(stringResource(R.string.nap_empty), ApexIcons.Info) }
            else -> rows.forEach { row -> NapRow(row, onOpen) }
        }
    }
}

@Composable
private fun NapRow(row: NapRowUi, onOpen: (String) -> Unit) {
    val source = stringResource(provenanceLabelRes(row.provenance))
    val duration = (row.duration as? MetricState.Value)?.let { "${it.numberText()} ${it.unit.orEmpty()}".trim() }.orEmpty()
    val spoken = stringResource(R.string.nap_row_cd, row.timeRange, duration, source)
    ApexCard(onClick = { onOpen(row.id) }, spokenDescription = spoken) {
        Column(Modifier.hideFromTalkBack(), verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
            Text(row.timeRange, style = ApexTheme.type.bodyStrong, color = ApexTheme.colors.foreground)
            MetricValueText(row.duration, valueStyle = ApexTheme.type.statValue)
            MetricProvenance(row.duration)
        }
    }
}

/** One nap: start, end, duration, minutes by stage when the source scored them, and where it came from. */
@Composable
fun NapDetailRoute(navigator: ApexNavigator, napId: String) {
    val vm = apexViewModel(key = "nap-$napId") { container, _ -> NapDetailViewModel(napId, NapReads(container.stores)::nap) }
    val load by vm.state.collectAsStateWithLifecycle()
    val formatter = LocalFormatter.current
    val ui = remember(load, formatter) { (load as? NapLoad.Ready)?.let { buildNapDetail(it.detail, formatter) } }
    val clock = remember(ui?.zoneOffsetSeconds, formatter) {
        ChartClock(ui?.zoneOffsetSeconds?.let { ZoneOffset.ofTotalSeconds(it) } ?: java.time.ZoneId.systemDefault(), formatter.clock24h)
    }
    NapDetailScreen(
        ui = ui,
        notFound = load is NapLoad.NotFound,
        failed = load is NapLoad.Failed,
        clock = clock,
        onBack = navigator::back,
    )
}

@Composable
internal fun NapDetailScreen(ui: NapDetailUi?, notFound: Boolean, failed: Boolean, clock: ChartClock, onBack: () -> Unit) {
    DetailShell(
        title = ui?.dayLabel ?: stringResource(R.string.nap_title),
        onBack = onBack,
        backDescription = stringResource(R.string.common_back),
        hero = {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                if (ui != null) Text(ui.timeRange, style = ApexTheme.type.sectionTitle, color = ApexTheme.colors.foreground)
                StatBlock(
                    label = stringResource(R.string.nap_hero_label),
                    state = ui?.inBed ?: if (notFound || failed) MetricState.Unavailable() else MetricState.Loading,
                    valueStyle = ApexTheme.type.statValueLarge,
                )
            }
        },
        primary = {
            if (failed) FailedCard()
            if (notFound) ApexCard { ReasonPlaceholder(stringResource(R.string.nap_not_found), ApexIcons.Info, size = ReasonSize.Medium) }
            if (ui != null) {
                ApexCard(contentPadding = PaddingValues(horizontal = ApexSpacing.cardPadding, vertical = ApexSpacing.sm)) {
                    KeyStatRow(stringResource(R.string.nap_asleep), ui.asleep)
                    KeyStatRow(stringResource(R.string.nap_awake), ui.awake)
                    KeyStatRow(stringResource(R.string.nap_to_fall_asleep), ui.toFallAsleep)
                }
                SectionShell(stringResource(R.string.nap_section_stages)) {
                    ApexCard {
                        if (ui.hasStages) {
                            SleepHypnogramChart(
                                segments = ui.segments,
                                clock = clock,
                                provenance = stringResource(provenanceLabelRes(ui.provenance)),
                            )
                        } else {
                            ReasonPlaceholder(stringResource(R.string.nap_stages_none), ApexIcons.Info)
                        }
                    }
                    if (ui.stageRows.isNotEmpty()) {
                        ApexCard(contentPadding = PaddingValues(horizontal = ApexSpacing.cardPadding, vertical = ApexSpacing.sm)) {
                            ui.stageRows.forEach { row -> KeyStatRow(stringResource(stageLabel(row.stage)), row.state) }
                        }
                    }
                }
            }
            if (ui == null && !notFound && !failed) ApexCard { SkeletonLineFill(height = 96.dp) }
        },
        secondary = {
            SectionShell(stringResource(R.string.detail_how_title)) {
                ApexCard {
                    Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                        BodyText(stringResource(R.string.nap_how_p1))
                        BodyText(stringResource(R.string.nap_how_p2))
                    }
                }
            }
        },
    )
}

private fun stageLabel(stage: SleepStage): Int = when (stage) {
    SleepStage.DEEP -> R.string.sleep_stage_deep
    SleepStage.REM -> R.string.sleep_stage_rem
    SleepStage.LIGHT -> R.string.sleep_stage_light
    else -> R.string.sleep_stage_awake
}

// --- Previews -------------------------------------------------------------------------------------

private val PreviewSensor = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API
private const val PREVIEW_START = 1_800_000_000_000L

private fun previewRows() = listOf(
    NapRowUi("a", "13:10 to 13:55", MetricState.Value(45.0, 0, "min", PreviewSensor), PreviewSensor),
    NapRowUi("b", "16:40 to 17:00", MetricState.Value(20.0, 0, "min", DataProvenance.IMPORTED_HEALTH_CONNECT), DataProvenance.IMPORTED_HEALTH_CONNECT),
)

@HealthThemePreviews
@Composable
private fun NapsSectionPreview() = HealthPreviewFrame {
    Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.xl)) {
        NapsSection(previewRows(), false) {}
        NapsSection(emptyList(), false) {}
        NapsSection(null, false) {}
    }
}

@HealthThemePreviews
@Composable
private fun NapDetailPreview() = HealthPreviewFrame {
    val minute = 60_000L
    val ui = NapDetailUi(
        "Mon, Nov 9", "13:10 to 13:55", MetricState.Value(45.0, 0, "min", PreviewSensor), MetricState.Value(40.0, 0, "min", PreviewSensor),
        MetricState.Value(5.0, 0, "min", PreviewSensor), MetricState.Unavailable(),
        listOf(
            NapStageRowUi(SleepStage.DEEP, MetricState.Value(10.0, 0, "min", PreviewSensor)),
            NapStageRowUi(SleepStage.REM, MetricState.Unavailable()),
            NapStageRowUi(SleepStage.LIGHT, MetricState.Value(30.0, 0, "min", PreviewSensor)),
        ),
        true,
        listOf(
            HypnogramSegment(PREVIEW_START, PREVIEW_START + 15 * minute, SleepStage.LIGHT),
            HypnogramSegment(PREVIEW_START + 15 * minute, PREVIEW_START + 30 * minute, SleepStage.DEEP),
            HypnogramSegment(PREVIEW_START + 30 * minute, PREVIEW_START + 45 * minute, SleepStage.LIGHT),
        ),
        0, PreviewSensor,
    )
    NapDetailScreen(ui, false, false, ChartClock(ZoneOffset.UTC, true)) {}
}

@HealthThemePreviews
@Composable
private fun NapDetailNotFoundPreview() = HealthPreviewFrame {
    NapDetailScreen(null, true, false, ChartClock()) {}
}
