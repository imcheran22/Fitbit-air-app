package com.apex.athlete.ui.reports

import android.content.ActivityNotFoundException
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color as AndroidColor
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.analytics.report.ReportPeriodType
import com.apex.athlete.core.ui.components.ApexButton
import com.apex.athlete.core.ui.components.ApexButtonStyle
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.ChipTone
import com.apex.athlete.core.ui.components.ChoiceOption
import com.apex.athlete.core.ui.components.ChoiceRow
import com.apex.athlete.core.ui.components.ReasonPlaceholder
import com.apex.athlete.core.ui.components.ReasonSize
import com.apex.athlete.core.ui.components.Tag
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.shell.DetailShell
import com.apex.athlete.core.ui.shell.SectionShell
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.state.metricSpoken
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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.LocalDate

/** Weekly and monthly reports: the list, and one report with sharing as an image or a PDF. */
@Composable
fun ReportsRoute(onBack: () -> Unit) {
    val vm = apexViewModel { container, handle -> ReportsViewModel(container.repository, container.localExtras, handle) }
    val list by vm.list.collectAsStateWithLifecycle()
    val detail by vm.detail.collectAsStateWithLifecycle()
    val type by vm.type.collectAsStateWithLifecycle()
    val selected by vm.selected.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val formatter = LocalFormatter.current
    val scope = rememberCoroutineScope()
    val colors = ApexTheme.colors
    var shareFailed by remember { mutableStateOf(false) }

    BackHandler(enabled = selected != null) { vm.open(null); shareFailed = false }

    fun share(image: Boolean) {
        val ui = detail ?: return
        if (ui.isDemo) return // Demo data is never exported.
        shareFailed = false
        val content = buildShareContent(ui, formatter)
        val themed = ShareColors(colors.background.toArgb(), colors.foreground.toArgb(), colors.mutedForeground.toArgb(), colors.primary.toArgb())
        val printed = ShareColors(AndroidColor.WHITE, AndroidColor.BLACK, AndroidColor.DKGRAY, AndroidColor.BLACK)
        val chooserTitle = formatter.string(R.string.reports_share_chooser)
        scope.launch {
            val intent = runCatching {
                withContext(Dispatchers.Default) {
                    val ext = if (image) "png" else "pdf"
                    val file = ReportSharer.write(context, ReportSharer.fileName(ui.type, ui.startEpochDay, ext)) { out ->
                        if (image) {
                            val bitmap = ReportRenderer.renderBitmap(content, themed)
                            try { bitmap.compress(Bitmap.CompressFormat.PNG, 100, out) } finally { bitmap.recycle() }
                        } else {
                            ReportRenderer.writePdf(content, printed, out)
                        }
                    }
                    ReportSharer.chooser(context, file, if (image) "image/png" else "application/pdf", content.subtitle, chooserTitle)
                }
            }.getOrNull()
            shareFailed = intent == null || !context.startSafely(intent)
        }
    }

    val open = detail
    if (selected != null) {
        ReportDetailScreen(
            ui = open,
            shareFailed = shareFailed,
            onBack = { vm.open(null); shareFailed = false },
            onShareImage = { share(true) },
            onSharePdf = { share(false) },
        )
    } else {
        ReportListScreen(ui = list, type = type, onBack = onBack, onType = vm::setType, onOpen = vm::open)
    }
}

private fun Context.startSafely(intent: android.content.Intent): Boolean = try {
    startActivity(intent)
    true
} catch (_: ActivityNotFoundException) {
    false
}

@Composable
internal fun ReportListScreen(
    ui: ReportsUi,
    type: ReportPeriodType,
    onBack: () -> Unit,
    onType: (ReportPeriodType) -> Unit,
    onOpen: (Long) -> Unit,
) {
    DetailShell(
        title = stringResource(R.string.reports_title),
        onBack = onBack,
        backDescription = stringResource(R.string.common_back),
        hero = { BodyText(stringResource(R.string.reports_intro)) },
        primary = {
            ChoiceRow(
                options = listOf(
                    ChoiceOption(ReportPeriodType.WEEK.name, stringResource(R.string.reports_type_week)),
                    ChoiceOption(ReportPeriodType.MONTH.name, stringResource(R.string.reports_type_month)),
                ),
                selectedKey = type.name,
                onSelect = { key -> onType(ReportPeriodType.valueOf(key)) },
                groupDescription = stringResource(R.string.reports_type_group),
            )
            when (ui) {
                ReportsUi.Loading -> LoadingCard()
                is ReportsUi.Ready -> if (ui.items.isEmpty()) {
                    ApexCard { ReasonPlaceholder(stringResource(R.string.reports_empty), ApexIcons.Info, size = ReasonSize.Medium) }
                } else {
                    ui.items.forEach { item -> ReportItemCard(item, onOpen = { onOpen(item.startEpochDay) }) }
                }
            }
        },
    )
}

@Composable
private fun ReportItemCard(item: ReportItemUi, onOpen: () -> Unit) {
    val f = LocalFormatter.current
    val title = periodTitle(item.type, item.startEpochDay, item.endEpochDay, f)
    val coverage = stringResource(R.string.reports_item_coverage, item.coverageDays, item.daysInPeriod)
    val recoveryLabel = stringResource(R.string.reports_metric_recovery)
    val sleepLabel = stringResource(R.string.reports_metric_sleep)
    val spoken = listOfNotNull(
        title,
        if (item.partial) stringResource(R.string.reports_in_progress) else null,
        if (item.sparse) stringResource(R.string.reports_sparse_tag) else null,
        metricSpoken(recoveryLabel, item.recovery),
        metricSpoken(sleepLabel, item.sleep),
        coverage,
    ).joinToString(". ")
    ApexCard(onClick = onOpen, onClickLabel = stringResource(R.string.reports_item_open), spokenDescription = spoken) {
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
            Text2(title)
            Row(horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm), verticalAlignment = Alignment.CenterVertically) {
                if (item.partial) Tag(stringResource(R.string.reports_in_progress), tone = ChipTone.INFO)
                if (item.sparse) Tag(stringResource(R.string.reports_sparse_tag), tone = ChipTone.WARNING)
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(ApexSpacing.lg)) {
                StatBlock(recoveryLabel, item.recovery, Modifier.weight(1f))
                StatBlock(sleepLabel, item.sleep, Modifier.weight(1f))
            }
            Caption(coverage)
        }
    }
}

@Composable
private fun Text2(text: String) =
    androidx.compose.material3.Text(text, style = ApexTheme.type.bodyStrong, color = ApexTheme.colors.foreground)

@Composable
internal fun ReportDetailScreen(
    ui: ReportDetailUi?,
    shareFailed: Boolean,
    onBack: () -> Unit,
    onShareImage: () -> Unit,
    onSharePdf: () -> Unit,
) {
    val f = LocalFormatter.current
    DetailShell(
        title = ui?.let { periodTitle(it.type, it.startEpochDay, it.endEpochDay, f) } ?: stringResource(R.string.reports_title),
        onBack = onBack,
        backDescription = stringResource(R.string.reports_all_reports),
        hero = {
            if (ui != null) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                    Caption(stringResource(R.string.reports_coverage_value, ui.coverageDays, ui.daysInPeriod, ui.coveragePercent))
                    Row(horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                        if (ui.partial) Tag(stringResource(R.string.reports_in_progress), tone = ChipTone.INFO)
                        if (ui.sparse) Tag(stringResource(R.string.reports_sparse_tag), tone = ChipTone.WARNING)
                    }
                }
            }
        },
        primary = {
            if (ui == null) {
                LoadingCard()
            } else {
                if (ui.sparse) ApexCard { BodyText(stringResource(R.string.reports_sparse_note)) }
                if (ui.partial) ApexCard { BodyText(stringResource(R.string.reports_partial_note)) }
                SectionShell(stringResource(R.string.reports_section_summary)) {
                    ApexCard {
                        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.lg)) {
                            ui.metrics.forEach { MetricBlock(it, ui) }
                        }
                    }
                }
                SectionShell(stringResource(R.string.reports_section_training)) { TrainingCard(ui) }
                SectionShell(stringResource(R.string.reports_section_goals)) { GoalsCard(ui) }
                SectionShell(stringResource(R.string.reports_section_coverage)) {
                    ApexCard {
                        BodyText(stringResource(R.string.reports_coverage_value, ui.coverageDays, ui.daysInPeriod, ui.coveragePercent))
                    }
                }
                ShareCard(ui.isDemo, shareFailed, onShareImage, onSharePdf)
            }
        },
        secondary = {
            SectionShell(stringResource(R.string.reports_how_title)) {
                ApexCard {
                    Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                        BodyText(stringResource(R.string.reports_how_p1))
                        BodyText(stringResource(R.string.reports_how_p2))
                        BodyText(stringResource(R.string.reports_how_p3))
                        BodyText(stringResource(R.string.reports_how_p4))
                    }
                }
            }
        },
    )
}

@Composable
private fun MetricBlock(row: MetricRowUi, ui: ReportDetailUi) {
    val f = LocalFormatter.current
    Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
        StatBlock(stringResource(metricLabelRes(row.metric)), row.mean)
        Caption(stringResource(R.string.reports_recorded_days, row.recordedDays, ui.daysInPeriod))
        if (row.mean is MetricState.Value) Caption(changeText(row, f))
        row.best?.let { Caption(stringResource(R.string.reports_best_day, f.shortDate(LocalDate.ofEpochDay(it.epochDay)), com.apex.athlete.core.ui.state.MetricFormat.withUnit(it.value, 0, it.unit, f.locale))) }
        row.worst?.let { Caption(stringResource(R.string.reports_worst_day, f.shortDate(LocalDate.ofEpochDay(it.epochDay)), com.apex.athlete.core.ui.state.MetricFormat.withUnit(it.value, 0, it.unit, f.locale))) }
    }
}

@Composable
private fun TrainingCard(ui: ReportDetailUi) {
    ApexCard {
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.lg)) {
            StatBlock(stringResource(R.string.reports_workouts_label), ui.workouts)
            Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
                StatBlock(stringResource(R.string.reports_workout_strain_label), ui.meanStrainOnWorkoutDays)
                if (ui.meanStrainOnWorkoutDays is MetricState.Value) Caption(stringResource(R.string.reports_workout_strain_days, ui.workoutDaysWithStrain))
            }
            val zone = ui.loadAtEnd.zone
            Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
                Caption(stringResource(R.string.reports_load_label).uppercase())
                if (zone != null) {
                    BodyText(stringResource(loadZoneRes(zone)))
                    Caption(stringResource(R.string.reports_load_note))
                } else {
                    BodyText(com.apex.athlete.core.ui.state.MetricFormat.MISSING)
                    Caption(stringResource(loadMissingRes(ui.loadAtEnd.reason)))
                }
            }
        }
    }
}

@Composable
private fun GoalsCard(ui: ReportDetailUi) {
    val f = LocalFormatter.current
    ApexCard {
        if (ui.goals.isEmpty()) {
            BodyText(stringResource(R.string.reports_goals_none))
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                ui.goals.forEach { BodyText(goalText(it, ui.type, f)) }
            }
        }
    }
}

@Composable
private fun ShareCard(demo: Boolean, failed: Boolean, onImage: () -> Unit, onPdf: () -> Unit) {
    ApexCard {
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
            if (demo) {
                BodyText(stringResource(R.string.reports_share_demo))
            } else {
                Caption(stringResource(R.string.reports_share_note))
                val imageCd = stringResource(R.string.reports_share_image_cd)
                val pdfCd = stringResource(R.string.reports_share_pdf_cd)
                ApexButton(
                    text = stringResource(R.string.reports_share_image),
                    onClick = onImage,
                    modifier = Modifier.fillMaxWidth().padding(top = ApexSpacing.xs).semanticsLabel(imageCd),
                )
                ApexButton(
                    text = stringResource(R.string.reports_share_pdf),
                    onClick = onPdf,
                    modifier = Modifier.fillMaxWidth().semanticsLabel(pdfCd),
                    style = ApexButtonStyle.Secondary,
                )
                if (failed) BodyText(stringResource(R.string.reports_share_failed))
            }
        }
    }
}

private fun Modifier.semanticsLabel(description: String): Modifier =
    this.then(Modifier.semantics { contentDescription = description })

// --- Previews -------------------------------------------------------------------------------------

private fun previewDetail(sparse: Boolean): ReportDetailUi {
    val src = com.apex.athlete.core.domain.DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API
    val derived = com.apex.athlete.core.domain.DataProvenance.MATHEMATICALLY_DERIVED
    fun v(x: Double, d: Int, u: String?, p: com.apex.athlete.core.domain.DataProvenance) = MetricState.Value(x, d, u, p, isProvisional = true)
    return ReportDetailUi(
        type = ReportPeriodType.WEEK, startEpochDay = 19_723L, endEpochDay = 19_729L, partial = true, daysInPeriod = 4,
        coverageDays = if (sparse) 1 else 4, coveragePercent = if (sparse) 25 else 100, sparse = sparse,
        metrics = listOf(
            MetricRowUi(ReportMetric.RECOVERY, v(71.0, 0, "%", derived), 4, ChangeUi.Delta(3.0, 0), DayStat(19_724L, 82.0, "%"), DayStat(19_725L, 58.0, "%")),
            MetricRowUi(ReportMetric.SLEEP, MetricState.Unavailable(), 0, ChangeUi.Missing(com.apex.athlete.core.analytics.report.ChangeMissingReason.INSUFFICIENT_BOTH), null, null),
            MetricRowUi(ReportMetric.STRAIN, v(9.4, 1, null, derived), 4, ChangeUi.Delta(-0.8, 1), null, null),
            MetricRowUi(ReportMetric.HRV, v(62.0, 0, "ms", src), 4, ChangeUi.Delta(2.0, 0), null, null),
            MetricRowUi(ReportMetric.RESTING_HR, v(52.0, 0, "bpm", src), 4, ChangeUi.Delta(-1.0, 0), null, null),
        ),
        workouts = v(3.0, 0, null, src), meanStrainOnWorkoutDays = v(12.1, 1, null, derived), workoutDaysWithStrain = 3,
        loadAtEnd = com.apex.athlete.core.analytics.report.LoadAtEnd(com.apex.athlete.core.analytics.load.WorkloadZone.SWEET_SPOT, null),
        goals = emptyList(), isDemo = false,
    )
}

@HealthThemePreviews
@Composable
private fun ReportDetailPreview() = HealthPreviewFrame { ReportDetailScreen(previewDetail(false), false, {}, {}, {}) }

@HealthThemePreviews
@Composable
private fun ReportDetailSparsePreview() = HealthPreviewFrame { ReportDetailScreen(previewDetail(true), true, {}, {}, {}) }

@HealthThemePreviews
@Composable
private fun ReportListPreview() = HealthPreviewFrame {
    val src = com.apex.athlete.core.domain.DataProvenance.MATHEMATICALLY_DERIVED
    val items = listOf(
        ReportItemUi(ReportPeriodType.WEEK, 19_723L, 19_729L, true, 4, 4, false, MetricState.Value(71.0, 0, "%", src, isProvisional = true), MetricState.Unavailable()),
        ReportItemUi(ReportPeriodType.WEEK, 19_716L, 19_722L, false, 7, 2, true, MetricState.Value(64.0, 0, "%", src), MetricState.Value(78.0, 0, "%", src)),
    )
    ReportListScreen(ReportsUi.Ready(ReportPeriodType.WEEK, items, false), ReportPeriodType.WEEK, {}, {}, {})
}

@HealthThemePreviews
@Composable
private fun ReportListLoadingPreview() = HealthPreviewFrame {
    ReportListScreen(ReportsUi.Loading, ReportPeriodType.MONTH, {}, {}, {})
}
