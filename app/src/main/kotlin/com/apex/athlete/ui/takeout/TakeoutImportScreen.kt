package com.apex.athlete.ui.takeout

import android.content.Context
import android.content.Intent
import android.net.Uri
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.data.worker.TakeoutImportScheduler
import com.apex.athlete.core.data.worker.TakeoutImportState
import com.apex.athlete.core.data.worker.TakeoutImportSummary
import com.apex.athlete.core.ui.components.ApexButton
import com.apex.athlete.core.ui.components.ApexButtonStyle
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.BannerKind
import com.apex.athlete.core.ui.components.ConnectionBanner
import com.apex.athlete.core.ui.components.hideFromTalkBack
import com.apex.athlete.core.ui.shell.DetailHeader
import com.apex.athlete.core.ui.shell.SectionShell
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.core.ui.theme.ThemePreference
import com.apex.athlete.navigation.ApexNavigator
import com.apex.athlete.ui.common.ApexFormatter
import com.apex.athlete.ui.common.LocalFormatter
import com.apex.athlete.ui.common.apexViewModel
import kotlinx.coroutines.flow.map
import java.text.NumberFormat

private val ARCHIVE_MIME_TYPES = arrayOf("application/zip", "application/x-zip-compressed", "application/octet-stream")

@Composable
fun TakeoutImportRoute(navigator: ApexNavigator) {
    val context = LocalContext.current
    val appContext = context.applicationContext
    val vm = apexViewModel { container, _ ->
        TakeoutImportViewModel(
            demoSource = container.settings.settings.map { it.demoMode },
            lastImportSource = container.settings.settings.map { it.lastTakeoutImportMillis },
            importSource = TakeoutImportScheduler.observe(appContext),
        )
    }
    val state by vm.state.collectAsStateWithLifecycle()

    // UI-only flags; they survive process death.
    var confirmingForce by rememberSaveable { mutableStateOf(false) }
    var forceNextPick by rememberSaveable { mutableStateOf(false) }
    var cancelledNotice by rememberSaveable { mutableStateOf(false) }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        val force = forceNextPick
        forceNextPick = false
        if (uris.isNotEmpty() && state?.canPick == true) {
            keepReadAccess(context, uris)
            TakeoutImportScheduler.enqueue(appContext, uris, force)
            cancelledNotice = false
        }
    }

    TakeoutImportContent(
        state = state,
        confirmingForce = confirmingForce,
        cancelledNotice = cancelledNotice,
        onBack = navigator::back,
        onPick = {
            forceNextPick = false
            picker.launch(ARCHIVE_MIME_TYPES)
        },
        onAskForce = { confirmingForce = true },
        onDismissForce = { confirmingForce = false },
        onConfirmForce = {
            confirmingForce = false
            forceNextPick = true
            picker.launch(ARCHIVE_MIME_TYPES)
        },
        onCancelImport = {
            TakeoutImportScheduler.cancel(appContext)
            cancelledNotice = true
        },
    )
}

/** Takes the persistable read permission so a resumed import can still open the files. Providers that refuse are left to the worker to report. */
private fun keepReadAccess(context: Context, uris: List<Uri>) {
    for (uri in uris) {
        try {
            context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        } catch (_: SecurityException) {
            // Not offered by this provider; the import reports the file as unreadable if it needs it later.
        }
    }
}

@Composable
fun TakeoutImportContent(
    state: TakeoutUiState?,
    confirmingForce: Boolean,
    cancelledNotice: Boolean,
    onBack: () -> Unit,
    onPick: () -> Unit,
    onAskForce: () -> Unit,
    onDismissForce: () -> Unit,
    onConfirmForce: () -> Unit,
    onCancelImport: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxSize()) {
        DetailHeader(
            title = stringResource(R.string.takeout_title),
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
            if (state?.demo == true) DemoNotice()
            if (state != null) {
                StatusArea(state.panel, cancelledNotice, onCancelImport)
            }
            PickSection(
                enabled = state?.canPick == true,
                confirmingForce = confirmingForce,
                onPick = onPick,
                onAskForce = onAskForce,
                onDismissForce = onDismissForce,
                onConfirmForce = onConfirmForce,
            )
            LastImport(state)
            ExplainerSections()
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
private fun CardTitle(text: String, modifier: Modifier = Modifier) =
    Text(text, style = ApexTheme.type.bodyStrong, color = ApexTheme.colors.foreground, modifier = modifier.semantics { heading() })

@Composable
private fun Bullet(text: String, marker: String = "•") {
    Row(horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
        Text(marker, style = ApexTheme.type.body, color = ApexTheme.colors.mutedForeground, modifier = Modifier.hideFromTalkBack())
        Text(text, style = ApexTheme.type.body, color = ApexTheme.colors.foregroundBody, modifier = Modifier.weight(1f))
    }
}

@Composable
private fun DemoNotice() {
    ApexCard {
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
            CardTitle(stringResource(R.string.takeout_demo_title))
            Body(stringResource(R.string.takeout_demo_body))
        }
    }
}

// ---- Status (progress and result) ------------------------------------------------------------

@Composable
private fun StatusArea(panel: TakeoutPanel, cancelledNotice: Boolean, onCancel: () -> Unit) {
    when (panel) {
        TakeoutPanel.Idle -> if (cancelledNotice) {
            ApexCard(Modifier.semantics { liveRegion = LiveRegionMode.Polite }) {
                Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                    CardTitle(stringResource(R.string.takeout_cancelled_title))
                    Body(stringResource(R.string.takeout_cancelled_body))
                }
            }
        }
        is TakeoutPanel.Running -> RunningCard(panel, onCancel)
        is TakeoutPanel.Completed -> CompletedCard(panel)
        is TakeoutPanel.Failed -> FailedCard(panel)
    }
}

@Composable
private fun RunningCard(panel: TakeoutPanel.Running, onCancel: () -> Unit) {
    val nf = NumberFormat.getIntegerInstance()
    val stage = stringResource(panel.stage)
    val listing = panel.filesTotal == 0
    val files = if (listing) "" else stringResource(R.string.takeout_running_files, nf.format(panel.filesDone), nf.format(panel.filesTotal))
    val rows = stringResource(R.string.takeout_running_rows, nf.format(panel.rowsWritten))
    val stageLine = stringResource(R.string.takeout_running_stage, stage)
    val spoken = if (listing) {
        stringResource(R.string.takeout_running_listing_cd)
    } else {
        stringResource(R.string.takeout_running_cd, files, rows, stageLine)
    }
    Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
        ConnectionBanner(
            kind = BannerKind.Importing,
            title = stringResource(R.string.takeout_running_title),
            modifier = Modifier.semantics(mergeDescendants = true) {
                contentDescription = spoken
                liveRegion = LiveRegionMode.Polite
            },
            description = if (listing) stringResource(R.string.takeout_running_listing) else "$files. $rows. $stageLine",
            progress = panel.fraction,
        )
        ApexButton(stringResource(R.string.takeout_cancel), onCancel, Modifier.fillMaxWidth(), style = ApexButtonStyle.Secondary)
    }
}

@Composable
private fun CompletedCard(panel: TakeoutPanel.Completed) {
    val fmt = LocalFormatter.current
    val nf = NumberFormat.getIntegerInstance()
    val rangeText = if (panel.firstDay != null && panel.lastDay != null) {
        stringResource(
            R.string.takeout_range,
            fmt.shortDate(panel.firstDay, withYear = true),
            fmt.shortDate(panel.lastDay, withYear = true),
        )
    } else {
        stringResource(R.string.takeout_range_missing, fmt.number(null))
    }
    ApexCard(Modifier.semantics { liveRegion = LiveRegionMode.Polite }) {
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
            CardTitle(stringResource(panel.headline))
            if (panel.summary.nothingNew) {
                Body(stringResource(R.string.takeout_done_nothing_new_body))
            } else if (panel.summary.hasWarnings) {
                Body(stringResource(R.string.takeout_done_warnings_body))
            }
            for (row in countRows(panel.summary)) {
                CountLine(stringResource(row.label), nf.format(row.count))
            }
            Body(rangeText)
            Caption(stringResource(R.string.takeout_provenance))
            Caption(stringResource(R.string.takeout_dismiss_hint))
        }
    }
}

@Composable
private fun CountLine(label: String, value: String) {
    val spoken = stringResource(R.string.takeout_count_row_cd, label, value)
    Row(
        Modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = spoken },
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, style = ApexTheme.type.body, color = ApexTheme.colors.foregroundBody, modifier = Modifier.weight(1f))
        Spacer(Modifier.padding(horizontal = ApexSpacing.xs))
        Text(value, style = ApexTheme.type.statSubValue, color = ApexTheme.colors.foreground)
    }
}

@Composable
private fun FailedCard(panel: TakeoutPanel.Failed) {
    ApexCard(Modifier.semantics { liveRegion = LiveRegionMode.Polite }) {
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
            CardTitle(stringResource(R.string.takeout_fail_title))
            Body(stringResource(panel.message))
        }
    }
}

// ---- Pick ------------------------------------------------------------------------------------

@Composable
private fun PickSection(
    enabled: Boolean,
    confirmingForce: Boolean,
    onPick: () -> Unit,
    onAskForce: () -> Unit,
    onDismissForce: () -> Unit,
    onConfirmForce: () -> Unit,
) {
    SectionShell(stringResource(R.string.takeout_pick_section)) {
        ApexCard {
            Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                ApexButton(stringResource(R.string.takeout_pick_action), onPick, Modifier.fillMaxWidth(), enabled = enabled)
                Caption(stringResource(R.string.takeout_pick_hint))
                if (confirmingForce && enabled) {
                    CardTitle(stringResource(R.string.takeout_force_title))
                    Body(stringResource(R.string.takeout_force_body))
                    ApexButton(stringResource(R.string.takeout_force_confirm), onConfirmForce, Modifier.fillMaxWidth(), style = ApexButtonStyle.Destructive)
                    ApexButton(stringResource(R.string.takeout_force_back), onDismissForce, Modifier.fillMaxWidth(), style = ApexButtonStyle.Secondary)
                } else {
                    ApexButton(stringResource(R.string.takeout_force_action), onAskForce, Modifier.fillMaxWidth(), style = ApexButtonStyle.Secondary, enabled = enabled)
                }
            }
        }
    }
}

@Composable
private fun LastImport(state: TakeoutUiState?) {
    val fmt = LocalFormatter.current
    val text = fmt.relativeTime(state?.lastImportMillis)
    val spoken = stringResource(R.string.takeout_last_import_cd, text)
    Text(
        stringResource(R.string.takeout_last_import, text),
        style = ApexTheme.type.caption,
        color = ApexTheme.colors.mutedForeground,
        modifier = Modifier.semantics { contentDescription = spoken },
    )
}

// ---- Explainer -------------------------------------------------------------------------------

@Composable
private fun ExplainerSections() {
    SectionShell(stringResource(R.string.takeout_how_section)) {
        ApexCard {
            Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                val steps = listOf(
                    R.string.takeout_how_1, R.string.takeout_how_2, R.string.takeout_how_3,
                    R.string.takeout_how_4, R.string.takeout_how_5,
                )
                steps.forEachIndexed { i, id -> Bullet(stringResource(id), marker = "${i + 1}.") }
            }
        }
    }
    SectionShell(stringResource(R.string.takeout_what_section)) {
        ApexCard {
            Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                Bullet(stringResource(R.string.takeout_what_local))
                Bullet(stringResource(R.string.takeout_what_long))
                Bullet(stringResource(R.string.takeout_what_safe))
                Caption(stringResource(R.string.takeout_provenance))
            }
        }
    }
}

// ---- Previews --------------------------------------------------------------------------------

private val previewSummary = TakeoutImportSummary(
    filesImported = 412, filesSkipped = 3, rowsImported = 1_240_000, rowsDropped = 5_100, rowsQuarantined = 12,
    unknownEntries = 40, recomputedDays = 730, firstEpochDay = 18_300, lastEpochDay = 20_400,
    hasWarnings = false, nothingNew = false,
)

private val previewStates = listOf(
    uiStateOf(false, 1_799_000_000_000L, TakeoutImportState.Running(120, 412, 310_000, "sleep")),
    uiStateOf(false, null, TakeoutImportState.Completed(previewSummary)),
    uiStateOf(true, null, TakeoutImportState.Idle),
    uiStateOf(false, 1_799_000_000_000L, TakeoutImportState.Failed("unsupported_format")),
)

@Composable
private fun PreviewBody(dark: Boolean, index: Int, confirming: Boolean = false) {
    ApexTheme(if (dark) ThemePreference.DARK else ThemePreference.LIGHT) {
        CompositionLocalProvider(LocalFormatter provides ApexFormatter(LocalContext.current, nowMillis = { 1_800_000_000_000L })) {
            Box(Modifier.fillMaxSize().background(ApexTheme.colors.background)) {
                TakeoutImportContent(
                    state = previewStates[index],
                    confirmingForce = confirming,
                    cancelledNotice = false,
                    onBack = {}, onPick = {}, onAskForce = {}, onDismissForce = {}, onConfirmForce = {}, onCancelImport = {},
                )
            }
        }
    }
}

@Preview(name = "Takeout running dark", heightDp = 1500)
@Composable
private fun TakeoutRunningDark() = PreviewBody(dark = true, index = 0)

@Preview(name = "Takeout running light", heightDp = 1500)
@Composable
private fun TakeoutRunningLight() = PreviewBody(dark = false, index = 0)

@Preview(name = "Takeout done dark", heightDp = 1500)
@Composable
private fun TakeoutDoneDark() = PreviewBody(dark = true, index = 1, confirming = true)

@Preview(name = "Takeout done light", heightDp = 1500)
@Composable
private fun TakeoutDoneLight() = PreviewBody(dark = false, index = 1)

@Preview(name = "Takeout demo dark", heightDp = 1500)
@Composable
private fun TakeoutDemoDark() = PreviewBody(dark = true, index = 2)

@Preview(name = "Takeout failed light", heightDp = 1500)
@Composable
private fun TakeoutFailedLight() = PreviewBody(dark = false, index = 3)
