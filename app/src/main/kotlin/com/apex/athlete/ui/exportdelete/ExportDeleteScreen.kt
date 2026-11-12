package com.apex.athlete.ui.exportdelete

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.data.export.ExportCounts
import com.apex.athlete.core.data.export.ExportReport
import com.apex.athlete.core.data.export.ImportReport
import com.apex.athlete.core.data.export.ImportStatus
import com.apex.athlete.core.data.model.IngestCounts
import com.apex.athlete.core.ui.components.ApexButton
import com.apex.athlete.core.ui.components.ApexButtonStyle
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.ApexTextField
import com.apex.athlete.core.ui.components.BannerKind
import com.apex.athlete.core.ui.components.ConnectionBanner
import com.apex.athlete.core.ui.components.hideFromTalkBack
import com.apex.athlete.core.ui.shell.DetailHeader
import com.apex.athlete.core.ui.shell.SectionShell
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.core.ui.theme.ThemePreference
import com.apex.athlete.navigation.ApexNavigator
import com.apex.athlete.ui.common.apexViewModel
import kotlinx.coroutines.flow.map
import java.text.NumberFormat
import java.time.LocalDate

/** Everything the screen draws, so the content can be previewed without a ViewModel. */
data class ExportDeleteUiState(
    val demo: Boolean,
    val export: OperationState<ExportResult>,
    val importState: OperationState<ImportReport>,
    val delete: DeleteState,
)

@Composable
fun ExportDeleteRoute(navigator: ApexNavigator) {
    val appContext = LocalContext.current.applicationContext
    val vm = apexViewModel { container, handle ->
        val resolver = appContext.contentResolver
        ExportDeleteViewModel(
            handle = handle,
            demoSource = container.settings.settings.map { it.demoMode },
            openOutput = { uri -> resolver.openOutputStream(uri) },
            openInput = { uri -> resolver.openInputStream(uri) },
            exportJson = { out -> container.dataExporter().exportJson(out) },
            exportCsvZip = { out -> container.dataExporter().exportCsvZip(out) },
            importJson = { input, onProgress -> container.dataImporter().import(input, onProgress) },
            deleteEverything = { container.dataDeletion().deleteEverything() },
            // Application scope: leaving the screen must not cancel a deletion.
            deleteScope = container.appScope,
        )
    }
    val demo by vm.demoMode.collectAsStateWithLifecycle()
    val export by vm.export.collectAsStateWithLifecycle()
    val importState by vm.importState.collectAsStateWithLifecycle()
    val delete by vm.delete.collectAsStateWithLifecycle()

    val createJson = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        if (uri != null) vm.exportTo(uri, csvZip = false)
    }
    val createZip = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/zip")) { uri ->
        if (uri != null) vm.exportTo(uri, csvZip = true)
    }
    val openDoc = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) vm.importFrom(uri)
    }

    val today = LocalDate.now().toString()
    ExportDeleteContent(
        state = ExportDeleteUiState(demo, export, importState, delete),
        onBack = navigator::back,
        onExportJson = { createJson.launch("apex-export-$today.json") },
        onExportCsv = { createZip.launch("apex-export-$today.zip") },
        onDismissExport = vm::clearExport,
        onImport = { openDoc.launch(arrayOf("application/json", "text/plain", "application/octet-stream")) },
        onDismissImport = vm::clearImport,
        onStartDelete = vm::startDelete,
        onContinueDelete = vm::continueDelete,
        onTypeDelete = vm::typeDeleteWord,
        onCancelDelete = vm::cancelDelete,
        onConfirmDelete = { vm.confirmDelete() },
        onDismissDeleteReport = vm::dismissDeleteReport,
    )
}

@Composable
fun ExportDeleteContent(
    state: ExportDeleteUiState,
    onBack: () -> Unit,
    onExportJson: () -> Unit,
    onExportCsv: () -> Unit,
    onDismissExport: () -> Unit,
    onImport: () -> Unit,
    onDismissImport: () -> Unit,
    onStartDelete: () -> Unit,
    onContinueDelete: () -> Unit,
    onTypeDelete: (String) -> Unit,
    onCancelDelete: () -> Unit,
    onConfirmDelete: () -> Unit,
    onDismissDeleteReport: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxSize()) {
        DetailHeader(
            title = stringResource(R.string.exportdelete_title),
            onBack = onBack,
            backDescription = stringResource(R.string.common_back),
        )
        Column(
            Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = ApexSpacing.gutter),
            verticalArrangement = Arrangement.spacedBy(ApexSpacing.sectionGap),
        ) {
            if (state.demo) DemoNotice()
            ExportSection(state.export, enabled = !state.demo, onExportJson, onExportCsv, onDismissExport)
            ImportSection(state.importState, enabled = !state.demo, onImport, onDismissImport)
            DeleteSection(state.delete, onStartDelete, onContinueDelete, onTypeDelete, onCancelDelete, onConfirmDelete, onDismissDeleteReport)
            Spacer(Modifier.height(ApexSpacing.xl))
        }
    }
}

// ---- Shared bits -----------------------------------------------------------------------------

@Composable
private fun Body(text: String, modifier: Modifier = Modifier) =
    Text(text, style = ApexTheme.type.body, color = ApexTheme.colors.foregroundBody, modifier = modifier)

@Composable
private fun Caption(text: String, modifier: Modifier = Modifier) =
    Text(text, style = ApexTheme.type.caption, color = ApexTheme.colors.mutedForeground, modifier = modifier)

@Composable
private fun CardTitle(text: String, modifier: Modifier = Modifier, destructive: Boolean = false) =
    Text(
        text,
        style = ApexTheme.type.bodyStrong,
        color = if (destructive) ApexTheme.colors.recoveryRedText else ApexTheme.colors.foreground,
        modifier = modifier.semantics { heading() },
    )

@Composable
private fun DemoNotice() {
    ApexCard {
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
            CardTitle(stringResource(R.string.exportdelete_demo_title))
            Body(stringResource(R.string.exportdelete_demo_body))
        }
    }
}

@Composable
private fun FailureBanner(reason: OperationFailure, onDismiss: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
        ConnectionBanner(
            kind = BannerKind.Stale,
            title = stringResource(failureText(reason)),
        )
        ApexButton(stringResource(R.string.exportdelete_dismiss), onDismiss, style = ApexButtonStyle.Secondary)
    }
}

// ---- Export ----------------------------------------------------------------------------------

@Composable
private fun ExportSection(
    state: OperationState<ExportResult>,
    enabled: Boolean,
    onJson: () -> Unit,
    onCsv: () -> Unit,
    onDismiss: () -> Unit,
) {
    SectionShell(stringResource(R.string.exportdelete_export_section)) {
        ApexCard {
            Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                Body(stringResource(R.string.exportdelete_export_intro))
                Text(
                    stringResource(R.string.exportdelete_export_warning),
                    style = ApexTheme.type.bodyStrong,
                    color = ApexTheme.colors.warningText,
                )
                Caption(stringResource(R.string.exportdelete_export_not_included))
                val idle = enabled && !state.isRunning
                ApexButton(stringResource(R.string.exportdelete_export_json), onJson, Modifier.fillMaxWidth(), enabled = idle)
                Caption(stringResource(R.string.exportdelete_export_json_hint))
                ApexButton(stringResource(R.string.exportdelete_export_csv), onCsv, Modifier.fillMaxWidth(), style = ApexButtonStyle.Secondary, enabled = idle)
                Caption(stringResource(R.string.exportdelete_export_csv_hint))
            }
        }
        when (state) {
            OperationState.Idle -> Unit
            is OperationState.Running -> ConnectionBanner(
                kind = BannerKind.Importing,
                title = stringResource(R.string.exportdelete_export_running),
                description = stringResource(R.string.exportdelete_export_running_body),
            )
            is OperationState.Failed -> FailureBanner(state.reason, onDismiss)
            is OperationState.Done -> ExportResultCard(state.result, onDismiss)
        }
    }
}

@Composable
private fun ExportResultCard(result: ExportResult, onDismiss: () -> Unit) {
    val nf = NumberFormat.getIntegerInstance()
    val title = stringResource(
        if (result.format == ExportReport.Format.CSV_ZIP) R.string.exportdelete_export_done_csv else R.string.exportdelete_export_done_json,
    )
    ApexCard(Modifier.semantics { liveRegion = LiveRegionMode.Polite }) {
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
            CardTitle(title)
            val rows = exportCountRows(result.counts)
            if (result.counts.totalRows == 0L) Body(stringResource(R.string.exportdelete_export_empty))
            for (row in rows) {
                CountLine(stringResource(row.label), nf.format(row.count))
            }
            if (result.counts.skipped > 0) {
                Caption(stringResource(R.string.exportdelete_export_skipped, nf.format(result.counts.skipped)))
            }
            Caption(stringResource(R.string.exportdelete_provenance))
            ApexButton(stringResource(R.string.exportdelete_dismiss), onDismiss, style = ApexButtonStyle.Secondary)
        }
    }
}

@Composable
private fun CountLine(label: String, value: String) {
    val spoken = stringResource(R.string.exportdelete_count_row, label, value)
    Row(
        Modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = spoken },
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, style = ApexTheme.type.body, color = ApexTheme.colors.foregroundBody, modifier = Modifier.weight(1f))
        Spacer(Modifier.padding(horizontal = ApexSpacing.xs))
        Text(value, style = ApexTheme.type.statSubValue, color = ApexTheme.colors.foreground)
    }
}

// ---- Import ----------------------------------------------------------------------------------

@Composable
private fun ImportSection(
    state: OperationState<ImportReport>,
    enabled: Boolean,
    onImport: () -> Unit,
    onDismiss: () -> Unit,
) {
    SectionShell(stringResource(R.string.exportdelete_import_section)) {
        ApexCard {
            Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                Body(stringResource(R.string.exportdelete_import_intro))
                Caption(stringResource(R.string.exportdelete_import_safe))
                ApexButton(
                    stringResource(R.string.exportdelete_import_action),
                    onImport,
                    Modifier.fillMaxWidth(),
                    enabled = enabled && !state.isRunning,
                )
            }
        }
        when (state) {
            OperationState.Idle -> Unit
            is OperationState.Running -> {
                val rows = state.progress
                ConnectionBanner(
                    kind = BannerKind.Importing,
                    title = stringResource(R.string.exportdelete_import_running),
                    description = if (rows == null || rows == 0L) {
                        stringResource(R.string.exportdelete_import_running_start)
                    } else {
                        stringResource(R.string.exportdelete_import_running_body, NumberFormat.getIntegerInstance().format(rows))
                    },
                )
            }
            is OperationState.Failed -> FailureBanner(state.reason, onDismiss)
            is OperationState.Done -> ImportResultCard(state.result, onDismiss)
        }
    }
}

@Composable
private fun ImportResultCard(report: ImportReport, onDismiss: () -> Unit) {
    val copy = importStatusCopy(report.status)
    val summary = report.summary()
    val nf = NumberFormat.getIntegerInstance()
    ApexCard(Modifier.semantics { liveRegion = LiveRegionMode.Polite }) {
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
            CardTitle(stringResource(copy.title))
            Body(stringResource(copy.body))
            if (copy.imported) {
                CountLine(stringResource(R.string.exportdelete_import_ingested_label), nf.format(summary.ingested))
                CountLine(stringResource(R.string.exportdelete_import_quarantined_label), nf.format(summary.quarantined))
                CountLine(stringResource(R.string.exportdelete_import_replayed_label), nf.format(summary.replayedDays.toLong()))
                if (summary.quarantined > 0) {
                    Caption(stringResource(R.string.exportdelete_import_quarantined_note, nf.format(summary.computedSkipped)))
                }
                Caption(stringResource(R.string.exportdelete_provenance))
            }
            ApexButton(stringResource(R.string.exportdelete_dismiss), onDismiss, style = ApexButtonStyle.Secondary)
        }
    }
}

// ---- Delete ----------------------------------------------------------------------------------

@Composable
private fun DeleteSection(
    state: DeleteState,
    onStart: () -> Unit,
    onContinue: () -> Unit,
    onType: (String) -> Unit,
    onCancel: () -> Unit,
    onConfirm: () -> Unit,
    onDismissReport: () -> Unit,
) {
    SectionShell(stringResource(R.string.exportdelete_delete_section)) {
        when (state) {
            DeleteState.Idle -> DeleteOverview(onStart)
            DeleteState.ConfirmFirst -> ApexCard {
                Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                    CardTitle(stringResource(R.string.exportdelete_delete_confirm1_title), destructive = true)
                    Body(stringResource(R.string.exportdelete_delete_confirm1_body))
                    ApexButton(stringResource(R.string.exportdelete_delete_continue), onContinue, Modifier.fillMaxWidth(), style = ApexButtonStyle.Destructive)
                    ApexButton(stringResource(R.string.exportdelete_cancel), onCancel, Modifier.fillMaxWidth(), style = ApexButtonStyle.Secondary)
                }
            }
            is DeleteState.ConfirmTyped -> ApexCard {
                Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                    CardTitle(stringResource(R.string.exportdelete_delete_confirm2_title), destructive = true)
                    ApexTextField(
                        value = state.typed,
                        onValueChange = onType,
                        label = stringResource(R.string.exportdelete_delete_field_label),
                        placeholder = stringResource(R.string.exportdelete_delete_field_hint),
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters, imeAction = ImeAction.Done),
                        keyboardActions = KeyboardActions(onDone = { if (isDeleteConfirmed(state.typed)) onConfirm() }),
                    )
                    ApexButton(
                        stringResource(R.string.exportdelete_delete_final),
                        onConfirm,
                        Modifier.fillMaxWidth(),
                        style = ApexButtonStyle.Destructive,
                        enabled = isDeleteConfirmed(state.typed),
                    )
                    ApexButton(stringResource(R.string.exportdelete_cancel), onCancel, Modifier.fillMaxWidth(), style = ApexButtonStyle.Secondary)
                }
            }
            DeleteState.Running -> ConnectionBanner(
                kind = BannerKind.AuthRevoked,
                title = stringResource(R.string.exportdelete_delete_running),
                description = stringResource(R.string.exportdelete_delete_running_body),
            )
            is DeleteState.Done -> if (state.failedSteps.isEmpty()) {
                ConnectionBanner(
                    kind = BannerKind.Importing,
                    title = stringResource(R.string.exportdelete_delete_done_title),
                    description = stringResource(R.string.exportdelete_delete_done_body),
                )
            } else {
                ApexCard(Modifier.semantics { liveRegion = LiveRegionMode.Assertive }) {
                    Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                        CardTitle(stringResource(R.string.exportdelete_delete_failed_title), destructive = true)
                        Body(stringResource(R.string.exportdelete_delete_failed_body))
                        for (step in state.failedSteps) Bullet(stringResource(stepName(step)))
                        ApexButton(stringResource(R.string.exportdelete_delete_retry), onStart, Modifier.fillMaxWidth(), style = ApexButtonStyle.Destructive)
                        ApexButton(stringResource(R.string.exportdelete_delete_close_report), onDismissReport, Modifier.fillMaxWidth(), style = ApexButtonStyle.Secondary)
                    }
                }
            }
        }
    }
}

@Composable
private fun DeleteOverview(onStart: () -> Unit) {
    val warning = stringResource(R.string.exportdelete_a11y_destructive)
    ApexCard {
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
            Body(stringResource(R.string.exportdelete_delete_intro))
            CardTitle(stringResource(R.string.exportdelete_delete_removes_title))
            Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
                for (id in removedItems) Bullet(stringResource(id))
            }
            CardTitle(stringResource(R.string.exportdelete_delete_kept_title))
            Body(stringResource(R.string.exportdelete_delete_kept_body))
            ApexButton(
                stringResource(R.string.exportdelete_delete_action),
                onStart,
                Modifier.fillMaxWidth().semantics { contentDescription = warning },
                style = ApexButtonStyle.Destructive,
            )
        }
    }
}

/** One entry per DataDeletion step group, in the order they run. */
private val removedItems = listOf(
    R.string.exportdelete_delete_removes_1,
    R.string.exportdelete_delete_removes_2,
    R.string.exportdelete_delete_removes_3,
    R.string.exportdelete_delete_removes_4,
    R.string.exportdelete_delete_removes_5,
    R.string.exportdelete_delete_removes_6,
    R.string.exportdelete_delete_removes_7,
    R.string.exportdelete_delete_removes_8,
)

@Composable
private fun Bullet(text: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
        Text("•", style = ApexTheme.type.body, color = ApexTheme.colors.mutedForeground, modifier = Modifier.hideFromTalkBack())
        Text(text, style = ApexTheme.type.body, color = ApexTheme.colors.foregroundBody, modifier = Modifier.weight(1f))
    }
}

// ---- Previews --------------------------------------------------------------------------------

private val previewReport = ImportReport(
    status = ImportStatus.COMPLETED,
    fileSchemaVersion = 1,
    rowsRead = ExportCounts(daily = 120, heartRateMinutes = 40_000),
    ingested = IngestCounts(dailyWritten = 120, heartRateMinutesWritten = 40_000),
    quarantined = emptyMap(),
    replayedDays = 120,
    declaredCounts = null,
)

private val previewStates = listOf(
    ExportDeleteUiState(false, OperationState.Done(ExportResult(ExportReport.Format.JSON, ExportCounts(daily = 900, heartRateMinutes = 52_000, workouts = 31))), OperationState.Done(previewReport), DeleteState.Idle),
    ExportDeleteUiState(true, OperationState.Idle, OperationState.Idle, DeleteState.ConfirmTyped("DEL")),
)

@Composable
private fun PreviewBody(dark: Boolean, index: Int) {
    ApexTheme(if (dark) ThemePreference.DARK else ThemePreference.LIGHT) {
        Box(Modifier.fillMaxSize().background(ApexTheme.colors.background)) {
            ExportDeleteContent(
                state = previewStates[index],
                onBack = {}, onExportJson = {}, onExportCsv = {}, onDismissExport = {}, onImport = {}, onDismissImport = {},
                onStartDelete = {}, onContinueDelete = {}, onTypeDelete = {}, onCancelDelete = {}, onConfirmDelete = {},
                onDismissDeleteReport = {},
            )
        }
    }
}

@Preview(name = "Export delete dark", heightDp = 1400)
@Composable
private fun ExportDeletePreviewDark() = PreviewBody(dark = true, index = 0)

@Preview(name = "Export delete light", heightDp = 1400)
@Composable
private fun ExportDeletePreviewLight() = PreviewBody(dark = false, index = 0)

@Preview(name = "Export delete demo dark", heightDp = 1400)
@Composable
private fun ExportDeleteDemoPreviewDark() = PreviewBody(dark = true, index = 1)

@Preview(name = "Export delete demo light", heightDp = 1400)
@Composable
private fun ExportDeleteDemoPreviewLight() = PreviewBody(dark = false, index = 1)
