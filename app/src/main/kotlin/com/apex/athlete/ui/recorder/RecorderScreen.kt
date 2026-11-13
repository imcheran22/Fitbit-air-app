package com.apex.athlete.ui.recorder

import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.ble.BlePermissions
import com.apex.athlete.ble.BleStrapConnection
import com.apex.athlete.ble.StrapFailure
import com.apex.athlete.ble.StrapState
import com.apex.athlete.core.ui.components.ApexButton
import com.apex.athlete.core.ui.components.ApexButtonStyle
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.shell.DetailShell
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.recorder.RecorderController
import com.apex.athlete.recorder.RecorderPhase
import com.apex.athlete.recorder.RecorderService
import com.apex.athlete.ui.common.apexViewModel

/** Live workout recorder: elapsed time, strap heart rate and zone, start / pause / stop, then save. */
@Composable
fun RecorderRoute(onBack: () -> Unit) {
    val context = LocalContext.current
    val name = stringResource(R.string.recorder_default_name)
    val vm = apexViewModel { container, _ ->
        val app = context.applicationContext
        RecorderViewModel(
            controller = RecorderController.shared(app),
            strap = BleStrapConnection.shared(app),
            repository = container.repository,
            settings = container.settings,
            sendToService = { RecorderService.send(app, it) },
            defaultName = name,
        )
    }
    val ui by vm.ui.collectAsStateWithLifecycle()
    val saveState by vm.saveState.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { vm.ensureService() }

    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { vm.connectStrap() }
    val connect = {
        val missing = BlePermissions.missing(Build.VERSION.SDK_INT) {
            context.checkSelfPermission(it) == android.content.pm.PackageManager.PERMISSION_GRANTED
        }
        if (missing.isEmpty()) vm.connectStrap() else permissionLauncher.launch(missing.toTypedArray())
    }
    // Android 14+ starts a health foreground service only with a motion/sensor permission granted; activity
    // recognition is the least sensitive one. Start either way: if it is refused the service stops and says so.
    val activityLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { vm.start() }
    val start = {
        val perm = android.Manifest.permission.ACTIVITY_RECOGNITION
        if (Build.VERSION.SDK_INT >= 29 &&
            context.checkSelfPermission(perm) != android.content.pm.PackageManager.PERMISSION_GRANTED
        ) activityLauncher.launch(perm) else vm.start()
    }
    RecorderScreen(
        ui = ui,
        saveState = saveState,
        onBack = onBack,
        onStart = start,
        onPause = vm::pause,
        onResume = vm::resume,
        onStop = vm::stop,
        onDiscard = vm::discard,
        onSave = vm::save,
        onConnectStrap = connect,
        onDisconnectStrap = vm::disconnectStrap,
    )
}

@Composable
internal fun RecorderScreen(
    ui: RecorderUi,
    saveState: RecorderSaveState,
    onBack: () -> Unit,
    onStart: () -> Unit,
    onPause: () -> Unit,
    onResume: () -> Unit,
    onStop: () -> Unit,
    onDiscard: () -> Unit,
    onSave: (Int) -> Unit,
    onConnectStrap: () -> Unit,
    onDisconnectStrap: () -> Unit,
) {
    val colors = ApexTheme.colors
    DetailShell(
        title = stringResource(R.string.recorder_title),
        onBack = onBack,
        backDescription = stringResource(R.string.common_back),
        hero = {
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                val spoken = stringResource(R.string.recorder_elapsed_spoken, ui.elapsedText)
                Text(
                    stringResource(R.string.recorder_elapsed_label),
                    style = ApexTheme.type.cardTitle,
                    color = colors.mutedForeground,
                )
                Text(
                    ui.elapsedText,
                    style = ApexTheme.type.dialHero,
                    color = colors.foreground,
                    modifier = Modifier.semantics { contentDescription = spoken },
                )
                if (ui.phase == RecorderPhase.PAUSED) {
                    Text(stringResource(R.string.recorder_paused), style = ApexTheme.type.bodyStrong, color = colors.mutedForeground)
                }
            }
        },
        primary = {
            ApexCard {
                Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                    Text(stringResource(R.string.recorder_hr_label), style = ApexTheme.type.cardTitle, color = colors.mutedForeground)
                    Text(
                        ui.bpm?.let { stringResource(R.string.recorder_hr_value, it) } ?: stringResource(R.string.recorder_hr_none),
                        style = ApexTheme.type.statValueLarge,
                        color = colors.foreground,
                    )
                    val zoneText = when {
                        !ui.zonesAvailable -> stringResource(R.string.recorder_zone_unknown)
                        ui.zone == null -> null
                        ui.zone == 0 -> stringResource(R.string.recorder_zone_rest)
                        else -> stringResource(R.string.recorder_zone, ui.zone)
                    }
                    if (zoneText != null) Text(zoneText, style = ApexTheme.type.body, color = colors.foregroundBody)
                    if (ui.zonesAvailable) Text(stringResource(R.string.recorder_zone_note), style = ApexTheme.type.caption, color = colors.mutedForeground)
                    val avg = ui.averageBpm
                    val max = ui.maxBpm
                    if (avg != null && max != null) {
                        Text(stringResource(R.string.recorder_avg_max, avg, max), style = ApexTheme.type.caption, color = colors.mutedForeground)
                    }
                }
            }
            Controls(ui, saveState, onStart, onPause, onResume, onStop, onDiscard)
            if (ui.phase == RecorderPhase.STOPPED) SavePanel(ui, saveState, onSave)
            if (saveState == RecorderSaveState.DemoRefused || ui.demo) {
                Text(stringResource(R.string.recorder_demo_refused), style = ApexTheme.type.body, color = colors.foregroundBody)
            }
        },
        secondary = {
            StrapCard(ui.strap, onConnectStrap, onDisconnectStrap)
        },
    )
}

@Composable
private fun Controls(
    ui: RecorderUi,
    saveState: RecorderSaveState,
    onStart: () -> Unit,
    onPause: () -> Unit,
    onResume: () -> Unit,
    onStop: () -> Unit,
    onDiscard: () -> Unit,
) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
        when (ui.phase) {
            null -> ApexButton(stringResource(R.string.recorder_start), onStart, Modifier.weight(1f), enabled = !ui.demo)
            RecorderPhase.RUNNING -> {
                ApexButton(stringResource(R.string.recorder_pause), onPause, Modifier.weight(1f), ApexButtonStyle.Secondary)
                ApexButton(stringResource(R.string.recorder_stop), onStop, Modifier.weight(1f))
            }
            RecorderPhase.PAUSED -> {
                ApexButton(stringResource(R.string.recorder_resume), onResume, Modifier.weight(1f))
                ApexButton(stringResource(R.string.recorder_stop), onStop, Modifier.weight(1f), ApexButtonStyle.Secondary)
            }
            RecorderPhase.STOPPED -> ApexButton(
                stringResource(R.string.recorder_discard), onDiscard, Modifier.weight(1f), ApexButtonStyle.Destructive,
                enabled = saveState != RecorderSaveState.Saving,
            )
        }
    }
}

@Composable
private fun SavePanel(ui: RecorderUi, saveState: RecorderSaveState, onSave: (Int) -> Unit) {
    val colors = ApexTheme.colors
    var rpe by rememberSaveable { mutableStateOf(0) }
    ApexCard {
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
            Text(stringResource(R.string.recorder_save_title), style = ApexTheme.type.cardTitle, color = colors.mutedForeground, modifier = Modifier.semantics { heading() })
            Text(stringResource(R.string.recorder_save_summary, ui.elapsedText), style = ApexTheme.type.bodyStrong, color = colors.foreground)
            if (!ui.savable) {
                Text(stringResource(R.string.recorder_save_too_short), style = ApexTheme.type.body, color = colors.foregroundBody)
            } else {
                Text(stringResource(R.string.recorder_save_rpe), style = ApexTheme.type.body, color = colors.foregroundBody)
                listOf(1..5, 6..10).forEach { range ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                        range.forEach { v ->
                            val selected = v == rpe
                            val spoken = stringResource(if (selected) R.string.recorder_save_rpe_selected else R.string.recorder_save_rpe_option, v)
                            ApexButton(
                                text = v.toString(),
                                onClick = { rpe = v },
                                modifier = Modifier.weight(1f).semantics { contentDescription = spoken },
                                style = if (selected) ApexButtonStyle.Primary else ApexButtonStyle.Secondary,
                            )
                        }
                    }
                }
                ApexButton(
                    text = stringResource(if (saveState == RecorderSaveState.Saving) R.string.recorder_saving else R.string.recorder_save_button),
                    onClick = { onSave(rpe) },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = rpe in 1..10 && saveState != RecorderSaveState.Saving && !ui.demo,
                )
                if (saveState == RecorderSaveState.Failed) {
                    Text(stringResource(R.string.recorder_save_failed), style = ApexTheme.type.caption, color = colors.recoveryRedText)
                }
                Text(stringResource(R.string.recorder_save_provenance), style = ApexTheme.type.caption, color = colors.mutedForeground)
            }
        }
    }
}

@Composable
private fun StrapCard(state: StrapState, onConnect: () -> Unit, onDisconnect: () -> Unit) {
    val colors = ApexTheme.colors
    ApexCard {
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
            Text(stringResource(R.string.recorder_strap_title), style = ApexTheme.type.cardTitle, color = colors.mutedForeground, modifier = Modifier.semantics { heading() })
            Text(strapStatusText(state), style = ApexTheme.type.bodyStrong, color = colors.foreground)
            Text(stringResource(R.string.recorder_strap_rationale), style = ApexTheme.type.caption, color = colors.mutedForeground)
            val active = state is StrapState.Connected || state == StrapState.Scanning || state == StrapState.Connecting
            if (active) {
                ApexButton(stringResource(R.string.recorder_strap_disconnect), onDisconnect, Modifier.fillMaxWidth(), ApexButtonStyle.Secondary)
            } else if (state != StrapState.Failed(StrapFailure.UNSUPPORTED_ANDROID)) {
                ApexButton(stringResource(R.string.recorder_strap_connect), onConnect, Modifier.fillMaxWidth(), ApexButtonStyle.Secondary)
            }
        }
    }
}

@Composable
private fun strapStatusText(state: StrapState): String = when (state) {
    StrapState.Idle -> stringResource(R.string.recorder_strap_idle)
    StrapState.Scanning -> stringResource(R.string.recorder_strap_scanning)
    StrapState.Connecting -> stringResource(R.string.recorder_strap_connecting)
    is StrapState.Connected -> state.deviceName?.let { stringResource(R.string.recorder_strap_connected_named, it) } ?: stringResource(R.string.recorder_strap_connected)
    is StrapState.Failed -> stringResource(
        when (state.reason) {
            StrapFailure.UNSUPPORTED_ANDROID -> R.string.recorder_strap_fail_unsupported
            StrapFailure.NO_BLUETOOTH -> R.string.recorder_strap_fail_no_bluetooth
            StrapFailure.BLUETOOTH_OFF -> R.string.recorder_strap_fail_off
            StrapFailure.PERMISSION_MISSING -> R.string.recorder_strap_fail_permission
            StrapFailure.NOT_FOUND -> R.string.recorder_strap_fail_not_found
            StrapFailure.CONNECTION_LOST -> R.string.recorder_strap_fail_lost
            StrapFailure.NO_HEART_RATE_SERVICE -> R.string.recorder_strap_fail_service
        },
    )
}
