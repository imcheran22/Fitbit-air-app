package com.apex.athlete.ui.datasources

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ContextWrapper
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.data.healthconnect.HcFamily
import com.apex.athlete.core.data.healthconnect.HcSdkStatus
import com.apex.athlete.core.data.healthconnect.HealthConnectPermissions
import com.apex.athlete.core.data.worker.SyncScheduler
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.SyncSource
import com.apex.athlete.core.network.auth.ReauthReason
import com.apex.athlete.core.ui.components.ApexButton
import com.apex.athlete.core.ui.components.ApexButtonStyle
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.BannerKind
import com.apex.athlete.core.ui.components.ChipTone
import com.apex.athlete.core.ui.components.ConnectionBanner
import com.apex.athlete.core.ui.components.ProvenanceLabel
import com.apex.athlete.core.ui.components.SkeletonLineFill
import com.apex.athlete.core.ui.components.StatusChip
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.shell.ApexSheet
import com.apex.athlete.core.ui.shell.DetailHeader
import com.apex.athlete.core.ui.shell.SectionShell
import com.apex.athlete.core.ui.state.MetricFormat
import com.apex.athlete.core.ui.theme.ApexShapes
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.core.ui.theme.ThemePreference
import com.apex.athlete.navigation.ApexNavigator
import com.apex.athlete.ui.common.ApexFormatter
import com.apex.athlete.ui.common.LocalFormatter
import com.apex.athlete.ui.common.apexViewModel
import java.time.LocalDate

private const val HEALTH_CONNECT_SETTINGS_ACTION = "androidx.health.ACTION_HEALTH_CONNECT_SETTINGS"

/** What the screen can do. Plain lambdas so the content is previewable. */
class DataSourcesActions(
    val onBack: () -> Unit,
    val onConnect: () -> Unit,
    val onDisconnect: () -> Unit,
    val onDismissNotice: () -> Unit,
    val onGrantPermissions: () -> Unit,
    val onOpenHealthConnect: () -> Unit,
    val onSyncNow: () -> Unit,
    val onImportTakeout: () -> Unit,
    val onBuildReport: () -> Unit,
    val onCopyReport: (String) -> Unit,
    val onShareReport: (String) -> Unit,
)

@Composable
fun DataSourcesRoute(navigator: ApexNavigator) {
    val context = LocalContext.current
    val appContext = context.applicationContext
    val vm = apexViewModel { container, handle ->
        DataSourcesViewModel(
            repository = container.repository,
            settings = container.settings,
            auth = container.auth,
            googleHealth = container.googleHealth,
            healthConnect = container.healthConnectAvailability,
            syncRun = SyncScheduler.observe(appContext),
            diagnostics = container.diagnostics,
            handle = handle,
        )
    }
    val state by vm.state.collectAsStateWithLifecycle()
    val diagnostics by vm.diagnosticsUi.collectAsStateWithLifecycle()
    var openFailed by rememberSaveable { mutableStateOf(false) }

    // Settings screens in Health Connect can change what is granted, so look again on every resume.
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { vm.refreshHealthConnect() }

    val permissionLauncher = rememberLauncherForActivityResult(HealthConnectPermissions.requestContract()) {
        vm.refreshHealthConnect()
    }

    val actions = DataSourcesActions(
        onBack = navigator::back,
        onConnect = { context.findActivity()?.let(vm::connect) },
        onDisconnect = vm::disconnect,
        onDismissNotice = vm::dismissSignInNotice,
        onGrantPermissions = {
            val request = vm.permissionRequest()
            if (request.isNotEmpty()) permissionLauncher.launch(request)
        },
        onOpenHealthConnect = {
            openFailed = !openHealthConnect(context, state?.healthConnect?.sdk)
        },
        onSyncNow = { SyncScheduler.syncNow(appContext) },
        onImportTakeout = navigator::openTakeoutImport,
        onBuildReport = vm::buildDiagnostics,
        onCopyReport = { text -> copyReport(context, text) },
        onShareReport = { text -> shareReport(context, text) },
    )
    DataSourcesContent(state, actions, openFailed, diagnostics)
}

private fun copyReport(context: Context, text: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return
    clipboard.setPrimaryClip(ClipData.newPlainText("Apex diagnostics", text))
}

private fun shareReport(context: Context, text: String) {
    val send = Intent(Intent.ACTION_SEND)
        .setType("text/plain")
        .putExtra(Intent.EXTRA_TEXT, text)
    val chooser = Intent.createChooser(send, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
        context.startActivity(chooser)
    } catch (_: ActivityNotFoundException) {
        // No app can take plain text: Copy still works.
    }
}

private fun Context.findActivity(): Activity? {
    var c: Context? = this
    while (c is ContextWrapper) {
        if (c is Activity) return c
        c = c.baseContext
    }
    return null
}

/** Opens Health Connect's own settings, or its Play Store page when it is missing or outdated. Returns false when neither opened. */
private fun openHealthConnect(context: Context, sdk: HcSdkStatus?): Boolean {
    val intent = if (sdk == HcSdkStatus.AVAILABLE || sdk == null) {
        Intent(HEALTH_CONNECT_SETTINGS_ACTION)
    } else {
        Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=${HealthConnectPermissions.PROVIDER_PACKAGE}"))
    }
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return try {
        context.startActivity(intent)
        true
    } catch (_: ActivityNotFoundException) {
        false
    }
}

@Composable
internal fun DataSourcesContent(
    state: DataSourcesUiState?,
    actions: DataSourcesActions,
    openFailed: Boolean,
    diagnostics: DiagnosticsUi = DiagnosticsUi(),
) {
    Column(Modifier.fillMaxSize()) {
        DetailHeader(
            title = stringResource(R.string.datasources_title),
            onBack = actions.onBack,
            backDescription = stringResource(R.string.common_back),
        )
        Column(
            Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = ApexSpacing.gutter, vertical = ApexSpacing.md),
            verticalArrangement = Arrangement.spacedBy(ApexSpacing.sectionGap),
        ) {
            if (state == null) {
                LoadingCard()
            } else {
                if (state.demo) DemoCard()
                GoogleSection(state, actions)
                HealthConnectSection(state, actions, openFailed)
                SyncSection(state, actions)
                MarksSection(state)
                CountsSection(state)
                TakeoutSection(state, actions)
                DiagnosticsSection(diagnostics, actions)
            }
        }
    }
}

// --- Shared pieces ---------------------------------------------------------------------------------

@Composable
private fun LoadingCard() {
    val cd = stringResource(R.string.datasources_loading)
    ApexCard(Modifier.fillMaxWidth().semantics { contentDescription = cd }) {
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
            SkeletonLineFill(height = 20.dp)
            SkeletonLineFill(height = 20.dp)
            SkeletonLineFill(height = 20.dp)
        }
    }
}

/** Label on the left, value on the right; wraps instead of clipping; one TalkBack sentence. */
@Composable
private fun InfoRow(label: String, value: String, detail: String? = null) {
    val colors = ApexTheme.colors
    val spoken = listOfNotNull(label, value, detail).joinToString(", ")
    Column(
        Modifier
            .fillMaxWidth()
            .padding(vertical = ApexSpacing.sm)
            .semantics(mergeDescendants = true) { contentDescription = spoken },
        verticalArrangement = Arrangement.spacedBy(ApexSpacing.xxs),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
            Text(label, style = ApexTheme.type.body, color = colors.foregroundSecondary, modifier = Modifier.weight(1f))
            Text(value, style = ApexTheme.type.bodyStrong, color = colors.foreground, modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.End)
        }
        if (detail != null) Text(detail, style = ApexTheme.type.caption, color = colors.mutedForeground)
    }
}

@Composable
private fun BodyText(text: String, modifier: Modifier = Modifier) {
    Text(text, style = ApexTheme.type.body, color = ApexTheme.colors.foregroundBody, modifier = modifier)
}

@Composable
private fun CardTitle(text: String, chip: String? = null, tone: ChipTone = ChipTone.NEUTRAL) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(ApexSpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text, style = ApexTheme.type.bodyStrong, color = ApexTheme.colors.foreground, modifier = Modifier.weight(1f))
        if (chip != null) StatusChip(chip, tone = tone)
    }
}

@Composable
private fun sourceName(source: SyncSource): String = stringResource(
    when (source) {
        SyncSource.GOOGLE_HEALTH_API -> R.string.datasources_source_google
        SyncSource.HEALTH_CONNECT -> R.string.datasources_source_hc
        SyncSource.FITBIT_TAKEOUT_ARCHIVE -> R.string.datasources_source_takeout
    },
)

private fun sourceProvenance(source: SyncSource): DataProvenance = when (source) {
    SyncSource.GOOGLE_HEALTH_API -> DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API
    SyncSource.HEALTH_CONNECT -> DataProvenance.IMPORTED_HEALTH_CONNECT
    SyncSource.FITBIT_TAKEOUT_ARCHIVE -> DataProvenance.IMPORTED_FILE_ARCHIVE
}

// --- Demo ------------------------------------------------------------------------------------------

@Composable
private fun DemoCard() {
    ConnectionBanner(
        kind = BannerKind.Demo,
        title = stringResource(R.string.datasources_demo_title),
        description = stringResource(R.string.datasources_demo_body),
    )
}

// --- Google Health ---------------------------------------------------------------------------------

@Composable
private fun GoogleSection(state: DataSourcesUiState, actions: DataSourcesActions) {
    val g = state.google
    var confirming by rememberSaveable { mutableStateOf(false) }
    SectionShell(stringResource(R.string.datasources_google_section)) {
        ApexCard(Modifier.fillMaxWidth()) {
            val (chip, tone) = when (g.connection) {
                GoogleConnection.LOADING -> stringResource(R.string.datasources_google_loading) to ChipTone.NEUTRAL
                GoogleConnection.NOT_CONFIGURED -> stringResource(R.string.datasources_google_not_configured) to ChipTone.WARNING
                GoogleConnection.SIGNED_OUT -> stringResource(R.string.datasources_google_signed_out) to ChipTone.NEUTRAL
                GoogleConnection.SIGNED_IN -> stringResource(R.string.datasources_google_connected) to ChipTone.OPTIMAL
                GoogleConnection.NEEDS_REAUTH -> stringResource(R.string.datasources_google_needs_reauth) to ChipTone.WARNING
            }
            CardTitle(stringResource(R.string.datasources_google_status_label), chip, tone)
            Spacer8()
            BodyText(
                when (g.connection) {
                    GoogleConnection.NOT_CONFIGURED -> stringResource(R.string.datasources_google_not_configured_body)
                    GoogleConnection.SIGNED_IN -> stringResource(R.string.datasources_google_connected_body)
                    GoogleConnection.NEEDS_REAUTH -> stringResource(reauthRes(g.reauth))
                    else -> stringResource(R.string.datasources_google_signed_out_body)
                },
            )
            Spacer8()
            ProvenanceLabel(DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API)

            val notice = noticeText(g)
            if (notice != null) {
                Spacer8()
                ConnectionBanner(
                    kind = if (g.notice == SignInNotice.DONE || g.notice == SignInNotice.WAITING_FOR_BROWSER || g.notice == SignInNotice.COMPLETING) BannerKind.NotConnected else BannerKind.AuthRevoked,
                    title = notice,
                    actionLabel = stringResource(R.string.datasources_notice_dismiss),
                    onAction = actions.onDismissNotice,
                )
            }

            if (g.canConnect) {
                Spacer8()
                ApexButton(
                    text = stringResource(if (g.connection == GoogleConnection.NEEDS_REAUTH) R.string.datasources_google_reconnect else R.string.datasources_google_connect),
                    onClick = actions.onConnect,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            if (g.canDisconnect) {
                Spacer8()
                ApexButton(
                    text = stringResource(R.string.datasources_google_disconnect),
                    onClick = { confirming = true },
                    modifier = Modifier.fillMaxWidth(),
                    style = ApexButtonStyle.Secondary,
                )
            }
        }
        state.rateLimit?.let { RateLimitCard(it, state.nowMillis) }
    }
    if (confirming) {
        ApexSheet(onDismiss = { confirming = false }, title = stringResource(R.string.datasources_google_disconnect_title)) {
            BodyText(stringResource(R.string.datasources_google_disconnect_body), Modifier.padding(horizontal = ApexSpacing.gutter))
            Column(
                Modifier.padding(ApexSpacing.gutter),
                verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm),
            ) {
                ApexButton(
                    text = stringResource(R.string.datasources_google_disconnect_confirm),
                    onClick = {
                        confirming = false
                        actions.onDisconnect()
                    },
                    modifier = Modifier.fillMaxWidth(),
                    style = ApexButtonStyle.Destructive,
                )
                ApexButton(
                    text = stringResource(R.string.datasources_google_disconnect_cancel),
                    onClick = { confirming = false },
                    modifier = Modifier.fillMaxWidth(),
                    style = ApexButtonStyle.Secondary,
                )
            }
        }
    }
}

@Composable
private fun Spacer8() = Box(Modifier.height(ApexSpacing.sm))

@StringRes
private fun reauthRes(reason: ReauthReason?): Int = when (reason) {
    ReauthReason.REFRESH_TOKEN_REJECTED -> R.string.datasources_google_reauth_refresh_rejected
    ReauthReason.ACCESS_REJECTED -> R.string.datasources_google_reauth_access_rejected
    ReauthReason.NO_REFRESH_TOKEN -> R.string.datasources_google_reauth_no_refresh
    ReauthReason.CLIENT_CHANGED -> R.string.datasources_google_reauth_client_changed
    ReauthReason.CLIENT_REJECTED -> R.string.datasources_google_reauth_client_rejected
    null -> R.string.datasources_google_signed_out_body
}

@Composable
private fun noticeText(g: GoogleCardModel): String? = when (g.notice) {
    SignInNotice.NONE -> null
    SignInNotice.WAITING_FOR_BROWSER -> stringResource(R.string.datasources_notice_waiting)
    SignInNotice.COMPLETING -> stringResource(R.string.datasources_notice_completing)
    SignInNotice.DONE -> stringResource(R.string.datasources_notice_done)
    SignInNotice.DONE_MISSING_SCOPES -> pluralStringResource(R.plurals.datasources_notice_done_missing, g.missingScopeCount, g.missingScopeCount)
    SignInNotice.NO_BROWSER -> stringResource(R.string.datasources_notice_no_browser)
    SignInNotice.DENIED -> stringResource(R.string.datasources_notice_denied)
    SignInNotice.NETWORK -> stringResource(R.string.datasources_notice_network)
    SignInNotice.REFUSED -> stringResource(R.string.datasources_notice_refused)
    SignInNotice.UNEXPECTED -> stringResource(R.string.datasources_notice_unexpected)
    SignInNotice.REDIRECT_MISMATCH -> stringResource(R.string.datasources_notice_mismatch, g.manifestScheme.orEmpty(), g.neededScheme.orEmpty())
}

@Composable
private fun RateLimitCard(rate: RateLimitUi, now: Long) {
    val fmt = LocalFormatter.current
    val colors = ApexTheme.colors
    val value = if (rate.used != null && rate.limit != null) {
        stringResource(R.string.datasources_rate_used, fmt.number(rate.used.toDouble()), fmt.number(rate.limit.toDouble()))
    } else {
        stringResource(R.string.datasources_rate_unknown)
    }
    val source = stringResource(if (rate.reportedByServer) R.string.datasources_rate_source_server else R.string.datasources_rate_source_local)
    val resets = rate.resetAtMillis?.let {
        stringResource(R.string.datasources_rate_resets, stringResource(R.string.datasources_rate_resets_in, minutesLeft(it, now)))
    }
    val coolDown = rate.coolDownUntilMillis?.let { stringResource(R.string.datasources_rate_cooldown, minutesLeft(it, now)) }
    val label = stringResource(R.string.datasources_rate_label)
    val cd = stringResource(R.string.datasources_rate_cd, listOfNotNull(value, resets, coolDown, source).joinToString(", "))
    ApexCard(Modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = cd }) {
        Text(label, style = ApexTheme.type.cardTitle, color = colors.mutedForeground)
        Spacer8()
        Text(value, style = ApexTheme.type.bodyStrong, color = colors.foreground)
        rate.fraction?.let { f ->
            Spacer8()
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(8.dp)
                    .clip(ApexShapes.bar)
                    .background(colors.dialTrack),
            ) {
                Box(
                    Modifier
                        .fillMaxWidth(f.coerceIn(0f, 1f))
                        .height(8.dp)
                        .clip(ApexShapes.bar)
                        .background(if (coolDown != null) colors.warning else colors.coach),
                )
            }
        }
        if (resets != null) {
            Spacer8()
            Text(resets, style = ApexTheme.type.caption, color = colors.mutedForeground)
        }
        if (coolDown != null) {
            Spacer8()
            Text(coolDown, style = ApexTheme.type.body, color = colors.warningText)
        }
        Spacer8()
        Text(source, style = ApexTheme.type.caption, color = colors.mutedForeground)
    }
}

// --- Health Connect --------------------------------------------------------------------------------

@StringRes
private fun familyRes(f: HcFamily): Int = when (f) {
    HcFamily.HEART_RATE -> R.string.datasources_hc_family_heart_rate
    HcFamily.RESTING_HEART_RATE -> R.string.datasources_hc_family_resting_heart_rate
    HcFamily.HRV_RMSSD -> R.string.datasources_hc_family_hrv
    HcFamily.SLEEP -> R.string.datasources_hc_family_sleep
    HcFamily.OXYGEN_SATURATION -> R.string.datasources_hc_family_oxygen
    HcFamily.RESPIRATORY_RATE -> R.string.datasources_hc_family_respiratory
    HcFamily.SKIN_TEMPERATURE -> R.string.datasources_hc_family_skin_temperature
    HcFamily.STEPS -> R.string.datasources_hc_family_steps
    HcFamily.EXERCISE -> R.string.datasources_hc_family_exercise
    HcFamily.TOTAL_CALORIES -> R.string.datasources_hc_family_calories
    HcFamily.VO2_MAX -> R.string.datasources_hc_family_vo2
    HcFamily.FLOORS -> R.string.datasources_hc_family_floors
    HcFamily.DISTANCE -> R.string.datasources_hc_family_distance
}

@Composable
private fun HealthConnectSection(state: DataSourcesUiState, actions: DataSourcesActions, openFailed: Boolean) {
    val hc = state.healthConnect
    SectionShell(stringResource(R.string.datasources_hc_section)) {
        ApexCard(Modifier.fillMaxWidth()) {
            if (hc == null) {
                val cd = stringResource(R.string.datasources_hc_loading)
                Column(Modifier.semantics { contentDescription = cd }) { SkeletonLineFill(height = 20.dp) }
                return@ApexCard
            }
            val sdkText = stringResource(
                when (hc.sdk) {
                    HcSdkStatus.AVAILABLE -> R.string.datasources_hc_sdk_available
                    HcSdkStatus.UNAVAILABLE -> R.string.datasources_hc_sdk_unavailable
                    HcSdkStatus.UPDATE_REQUIRED -> R.string.datasources_hc_sdk_update
                },
            )
            CardTitle(
                stringResource(R.string.datasources_hc_sdk_label),
                sdkText,
                if (hc.sdk == HcSdkStatus.AVAILABLE) ChipTone.OPTIMAL else ChipTone.WARNING,
            )
            when (hc.sdk) {
                HcSdkStatus.UNAVAILABLE -> { Spacer8(); BodyText(stringResource(R.string.datasources_hc_unavailable_body)) }
                HcSdkStatus.UPDATE_REQUIRED -> { Spacer8(); BodyText(stringResource(R.string.datasources_hc_update_body)) }
                HcSdkStatus.AVAILABLE -> {
                    val permissions = if (hc.missing.isEmpty()) {
                        stringResource(R.string.datasources_hc_permissions_all)
                    } else {
                        stringResource(R.string.datasources_hc_permissions_count, hc.grantedCount, hc.missing.size)
                    }
                    val missingLabel = stringResource(R.string.datasources_hc_missing_label)
                    val familyNames = hc.missing.map { stringResource(familyRes(it)) }
                    val missingNames = if (familyNames.isEmpty()) null else
                        missingLabel + ": " + familyNames.joinToString(", ")
                    InfoRow(stringResource(R.string.datasources_hc_permissions_label), permissions, missingNames)
                    InfoRow(stringResource(R.string.datasources_hc_history_label), featureText(hc.history, R.string.datasources_hc_history_granted, R.string.datasources_hc_history_missing))
                    InfoRow(stringResource(R.string.datasources_hc_background_label), featureText(hc.background, R.string.datasources_hc_background_granted, R.string.datasources_hc_background_missing))
                }
            }
            Spacer8()
            ProvenanceLabel(DataProvenance.IMPORTED_HEALTH_CONNECT)
            Spacer8()
            Text(stringResource(R.string.datasources_hc_read_only), style = ApexTheme.type.caption, color = ApexTheme.colors.mutedForeground)
            if (hc.canRequest) {
                Spacer8()
                ApexButton(stringResource(R.string.datasources_hc_grant), actions.onGrantPermissions, Modifier.fillMaxWidth())
            }
            Spacer8()
            ApexButton(
                text = stringResource(R.string.datasources_hc_open),
                onClick = actions.onOpenHealthConnect,
                modifier = Modifier.fillMaxWidth(),
                style = ApexButtonStyle.Secondary,
            )
            if (openFailed) {
                Spacer8()
                Text(stringResource(R.string.datasources_hc_open_failed), style = ApexTheme.type.caption, color = ApexTheme.colors.warningText)
            }
        }
    }
}

@Composable
private fun featureText(state: FeatureState, @StringRes granted: Int, @StringRes missing: Int): String = stringResource(
    when (state) {
        FeatureState.GRANTED -> granted
        FeatureState.NOT_GRANTED -> missing
        FeatureState.UNSUPPORTED -> R.string.datasources_hc_unsupported
    },
)

// --- Sync ------------------------------------------------------------------------------------------

@Composable
private fun SyncSection(state: DataSourcesUiState, actions: DataSourcesActions) {
    val fmt = LocalFormatter.current
    val s = state.sync
    SectionShell(stringResource(R.string.datasources_sync_section)) {
        ApexCard(Modifier.fillMaxWidth()) {
            val text = when (s.kind) {
                SyncKind.LOADING -> stringResource(R.string.datasources_sync_loading)
                SyncKind.IDLE -> stringResource(R.string.datasources_sync_idle)
                SyncKind.RUNNING -> stringResource(R.string.datasources_sync_running)
                SyncKind.SUCCEEDED -> stringResource(R.string.datasources_sync_succeeded, fmt.relativeTime(s.succeededAtMillis))
                SyncKind.NEEDS_SIGN_IN -> stringResource(R.string.datasources_sync_needs_sign_in)
                SyncKind.FAILED -> stringResource(syncFailureRes(s.failure))
            }
            InfoRow(stringResource(R.string.datasources_sync_status_label), text)
            val last = if (s.lastSyncMillis != null) fmt.relativeTime(s.lastSyncMillis) else MetricFormat.MISSING
            InfoRow(stringResource(R.string.datasources_sync_last_label), last, stringResource(R.string.datasources_sync_source_note))
            Spacer8()
            ApexButton(
                text = stringResource(R.string.datasources_sync_now),
                onClick = actions.onSyncNow,
                modifier = Modifier.fillMaxWidth(),
                enabled = s.canSyncNow,
            )
            if (state.demo) {
                Spacer8()
                Text(stringResource(R.string.datasources_sync_now_demo), style = ApexTheme.type.caption, color = ApexTheme.colors.mutedForeground)
            }
        }
    }
}

@StringRes
private fun syncFailureRes(f: SyncFailure?): Int = when (f) {
    SyncFailure.NETWORK -> R.string.datasources_sync_failed_network
    SyncFailure.RATE_LIMITED -> R.string.datasources_sync_failed_rate
    SyncFailure.PERMISSION_MISSING -> R.string.datasources_sync_failed_permission
    SyncFailure.NO_SOURCE -> R.string.datasources_sync_failed_no_source
    SyncFailure.STORE_UNAVAILABLE -> R.string.datasources_sync_failed_store
    SyncFailure.OTHER, null -> R.string.datasources_sync_failed_other
}

// --- Watermarks ------------------------------------------------------------------------------------

@Composable
private fun MarksSection(state: DataSourcesUiState) {
    val sections = state.sections
    SectionShell(stringResource(R.string.datasources_marks_section)) {
        when {
            sections == null -> LoadingCard()
            sections.isEmpty() -> ApexCard(Modifier.fillMaxWidth()) {
                BodyText(stringResource(if (state.demo) R.string.datasources_marks_demo else R.string.datasources_marks_empty))
            }
            else -> sections.forEach { SourceCard(it) }
        }
    }
}

@Composable
private fun SourceCard(section: SourceSection) {
    val fmt = LocalFormatter.current
    val newest = section.rows.mapNotNull { it.lastSuccessMillis }.maxOrNull()
    ApexCard(Modifier.fillMaxWidth()) {
        Text(sourceName(section.source), style = ApexTheme.type.bodyStrong, color = ApexTheme.colors.foreground)
        Spacer8()
        ProvenanceLabel(sourceProvenance(section.source), asOf = newest?.let(fmt::relativeTime))
        section.rows.forEach { row ->
            Box(
                Modifier
                    .padding(top = ApexSpacing.sm)
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(ApexTheme.colors.border),
            )
            StreamRow(row, fmt)
        }
    }
}

@Composable
private fun StreamRow(row: WatermarkRow, fmt: ApexFormatter) {
    val (statusText, tone) = when (row.health) {
        WatermarkHealth.NEVER -> stringResource(R.string.datasources_mark_never_synced) to ChipTone.NEUTRAL
        WatermarkHealth.OK -> stringResource(R.string.datasources_mark_ok) to ChipTone.OPTIMAL
        WatermarkHealth.PARTIAL -> stringResource(R.string.datasources_mark_partial) to ChipTone.WARNING
        WatermarkHealth.FAILED -> stringResource(R.string.datasources_mark_failed) to ChipTone.ALERT
        WatermarkHealth.PERMISSION_MISSING -> stringResource(R.string.datasources_mark_permission) to ChipTone.WARNING
    }
    val colors = ApexTheme.colors
    val upTo = row.windowEndMillis?.let { stringResource(R.string.datasources_mark_up_to, fmt.relativeTime(it)) }
        ?: stringResource(R.string.datasources_mark_never_synced)
    val success = row.lastSuccessMillis?.let { stringResource(R.string.datasources_mark_success, fmt.relativeTime(it)) }
    val attempt = row.lastAttemptMillis?.let { stringResource(R.string.datasources_mark_attempt, fmt.relativeTime(it)) }
    val failure = if (row.failure == FailureKind.NONE) null else stringResource(
        when (row.failure) {
            FailureKind.PERMISSION -> R.string.datasources_mark_fail_permission
            FailureKind.RATE_LIMITED -> R.string.datasources_mark_fail_rate
            FailureKind.SIGN_IN_EXPIRED -> R.string.datasources_mark_fail_sign_in
            else -> R.string.datasources_mark_fail_other
        },
    )
    val streak = if (row.consecutiveFailures > 1) pluralStringResource(R.plurals.datasources_mark_failures, row.consecutiveFailures, row.consecutiveFailures) else null
    val spoken = listOfNotNull(row.stream, statusText, upTo, success, attempt, failure, streak).joinToString(", ")
    Column(
        Modifier
            .fillMaxWidth()
            .padding(top = ApexSpacing.sm)
            .semantics(mergeDescendants = true) { contentDescription = spoken },
        verticalArrangement = Arrangement.spacedBy(ApexSpacing.xxs),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(ApexSpacing.md), verticalAlignment = Alignment.CenterVertically) {
            Text(row.stream, style = ApexTheme.type.bodyStrong, color = colors.foreground, modifier = Modifier.weight(1f))
            StatusChip(statusText, tone = tone)
        }
        Text(upTo, style = ApexTheme.type.caption, color = colors.foregroundSecondary)
        if (success != null) Text(success, style = ApexTheme.type.caption, color = colors.foregroundSecondary)
        if (attempt != null) Text(attempt, style = ApexTheme.type.caption, color = colors.foregroundSecondary)
        if (failure != null) Text(failure, style = ApexTheme.type.caption, color = colors.warningText)
        if (streak != null) Text(streak, style = ApexTheme.type.caption, color = colors.warningText)
    }
}

// --- Counts ----------------------------------------------------------------------------------------

@Composable
private fun CountsSection(state: DataSourcesUiState) {
    val fmt = LocalFormatter.current
    SectionShell(stringResource(R.string.datasources_counts_section)) {
        val counts = state.counts
        if (counts == null) {
            LoadingCard()
            return@SectionShell
        }
        ApexCard(Modifier.fillMaxWidth()) {
            counts.forEach { row ->
                val label = stringResource(
                    when (row.kind) {
                        CountKind.HEART_RATE_MINUTES -> R.string.datasources_counts_hr
                        CountKind.DAILY_VALUES -> R.string.datasources_counts_daily
                        CountKind.SAMPLES -> R.string.datasources_counts_samples
                    },
                )
                val value = if (row.count > 0) fmt.number(row.count.toDouble()) else stringResource(R.string.datasources_counts_none)
                InfoRow(label, value)
            }
            val earliest = state.earliestDay?.let { fmt.shortDate(LocalDate.ofEpochDay(it), withYear = true) } ?: MetricFormat.MISSING
            InfoRow(stringResource(R.string.datasources_counts_earliest), earliest)
            Spacer8()
            Text(stringResource(R.string.datasources_counts_source), style = ApexTheme.type.caption, color = ApexTheme.colors.mutedForeground)
        }
    }
}

// --- Takeout ---------------------------------------------------------------------------------------

@Composable
private fun TakeoutSection(state: DataSourcesUiState, actions: DataSourcesActions) {
    val fmt = LocalFormatter.current
    val t = state.takeout
    SectionShell(stringResource(R.string.datasources_takeout_section)) {
        ApexCard(Modifier.fillMaxWidth()) {
            val last = if (t.lastImportMillis != null) fmt.relativeTime(t.lastImportMillis) else stringResource(R.string.common_time_never)
            InfoRow(stringResource(R.string.datasources_takeout_last_label), last)
            val reminder = if (t.reminderDays > 0) {
                pluralStringResource(R.plurals.datasources_takeout_reminder_days, t.reminderDays, t.reminderDays)
            } else {
                stringResource(R.string.datasources_takeout_reminder_off)
            }
            InfoRow(stringResource(R.string.datasources_takeout_reminder_label), reminder)
            Spacer8()
            ProvenanceLabel(DataProvenance.IMPORTED_FILE_ARCHIVE, asOf = t.lastImportMillis?.let(fmt::relativeTime))
            Spacer8()
            if (t.overdue) {
                Text(stringResource(R.string.datasources_takeout_overdue), style = ApexTheme.type.body, color = ApexTheme.colors.warningText)
                Spacer8()
            }
            if (t.canImport) {
                BodyText(stringResource(R.string.datasources_takeout_body))
                Spacer8()
                ApexButton(stringResource(R.string.datasources_takeout_import), actions.onImportTakeout, Modifier.fillMaxWidth())
            } else {
                BodyText(stringResource(R.string.datasources_takeout_demo))
            }
        }
    }
}

// --- Diagnostics -----------------------------------------------------------------------------------

@Composable
private fun DiagnosticsSection(diagnostics: DiagnosticsUi, actions: DataSourcesActions) {
    var copied by rememberSaveable { mutableStateOf(false) }
    SectionShell(stringResource(R.string.datasources_diag_section)) {
        ApexCard(Modifier.fillMaxWidth()) {
            BodyText(stringResource(R.string.datasources_diag_body))
            Spacer8()
            val text = diagnostics.text
            if (text == null) {
                if (diagnostics.failed) {
                    Text(stringResource(R.string.datasources_diag_failed), style = ApexTheme.type.body, color = ApexTheme.colors.warningText)
                    Spacer8()
                }
                ApexButton(
                    text = stringResource(
                        if (diagnostics.loading) R.string.datasources_diag_building else R.string.datasources_diag_build,
                    ),
                    onClick = {
                        copied = false
                        actions.onBuildReport()
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !diagnostics.loading,
                )
            } else {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(max = 320.dp)
                        .clip(ApexShapes.card)
                        .background(ApexTheme.colors.muted)
                        .verticalScroll(rememberScrollState())
                        .padding(ApexSpacing.md),
                ) {
                    Text(text, style = ApexTheme.type.caption, color = ApexTheme.colors.foregroundBody)
                }
                Spacer8()
                ApexButton(
                    text = stringResource(R.string.datasources_diag_copy),
                    onClick = {
                        copied = true
                        actions.onCopyReport(text)
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer8()
                ApexButton(
                    text = stringResource(R.string.datasources_diag_share),
                    onClick = { actions.onShareReport(text) },
                    modifier = Modifier.fillMaxWidth(),
                    style = ApexButtonStyle.Secondary,
                )
                Spacer8()
                ApexButton(
                    text = stringResource(R.string.datasources_diag_refresh),
                    onClick = {
                        copied = false
                        actions.onBuildReport()
                    },
                    modifier = Modifier.fillMaxWidth(),
                    style = ApexButtonStyle.Secondary,
                )
                if (copied) {
                    Spacer8()
                    Text(stringResource(R.string.datasources_diag_copied), style = ApexTheme.type.caption, color = ApexTheme.colors.mutedForeground)
                }
            }
        }
    }
}

// --- Previews --------------------------------------------------------------------------------------

private fun previewState(demo: Boolean): DataSourcesUiState {
    val now = 1_800_000_000_000L
    val hour = 3_600_000L
    return DataSourcesUiState(
        nowMillis = now,
        demo = demo,
        google = GoogleCardModel(
            if (demo) GoogleConnection.SIGNED_OUT else GoogleConnection.SIGNED_IN,
            SignInNotice.NONE, null, 0, null, null,
        ),
        rateLimit = RateLimitUi(used = 42, limit = 150, fraction = 0.28f, resetAtMillis = now + 25 * 60_000L, coolDownUntilMillis = null, reportedByServer = false),
        healthConnect = HealthConnectUi(HcSdkStatus.AVAILABLE, listOf(HcFamily.VO2_MAX), 12, FeatureState.GRANTED, FeatureState.NOT_GRANTED, canRequest = true),
        sync = SyncUi(SyncKind.SUCCEEDED, now - hour, null, now - hour, canSyncNow = !demo),
        sections = if (demo) emptyList() else listOf(
            SourceSection(
                SyncSource.GOOGLE_HEALTH_API,
                listOf(
                    WatermarkRow(SyncSource.GOOGLE_HEALTH_API, "heart-rate", WatermarkHealth.OK, now - hour, now - hour, now - hour, FailureKind.NONE, 0),
                    WatermarkRow(SyncSource.GOOGLE_HEALTH_API, "sleep", WatermarkHealth.FAILED, now - 30 * hour, now - 30 * hour, now - hour, FailureKind.RATE_LIMITED, 3),
                ),
            ),
        ),
        counts = listOf(CountRow(CountKind.HEART_RATE_MINUTES, 40_210), CountRow(CountKind.DAILY_VALUES, 0), CountRow(CountKind.SAMPLES, 812)),
        earliestDay = 20_000L,
        takeout = TakeoutUi(lastImportMillis = null, reminderDays = 30, overdue = !demo, canImport = !demo),
    )
}

private val noActions = DataSourcesActions({}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {})

@Composable
private fun PreviewBody(theme: ThemePreference, demo: Boolean) = ApexTheme(theme) {
    CompositionLocalProvider(LocalFormatter provides ApexFormatter(LocalContext.current, nowMillis = { 1_800_000_000_000L })) {
        Box(Modifier.background(ApexTheme.colors.background)) {
            DataSourcesContent(previewState(demo), noActions, openFailed = false)
        }
    }
}

@Preview(name = "Data sources light", heightDp = 1800)
@Composable
private fun DataSourcesLight() = PreviewBody(ThemePreference.LIGHT, demo = false)

@Preview(name = "Data sources dark", heightDp = 1800)
@Composable
private fun DataSourcesDark() = PreviewBody(ThemePreference.DARK, demo = false)

@Preview(name = "Data sources demo dark", heightDp = 1800)
@Composable
private fun DataSourcesDemoDark() = PreviewBody(ThemePreference.DARK, demo = true)
