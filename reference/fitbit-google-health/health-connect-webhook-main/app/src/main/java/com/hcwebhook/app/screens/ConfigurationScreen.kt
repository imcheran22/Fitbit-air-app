package com.hcwebhook.app.screens

import android.app.TimePickerDialog
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.BatteryAlert
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.Hub
import androidx.compose.material.icons.filled.Lan
import androidx.compose.material.icons.filled.Android
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import com.hcwebhook.app.*
import com.hcwebhook.app.ui.AppSwitch
import com.hcwebhook.app.ui.Group
import com.hcwebhook.app.ui.Notice
import com.hcwebhook.app.ui.NoticeTone
import com.hcwebhook.app.ui.SettingRow
import com.hcwebhook.app.ui.theme.*
import kotlinx.coroutines.launch
import java.util.Calendar
import com.hcwebhook.app.R
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConfigurationScreen(
    activity: MainActivity,
    permissionLauncher: androidx.activity.result.ActivityResultLauncher<Set<String>>,
    hasPermissions: Boolean?,
    grantedPermissionsSet: Set<String>,
    sdkStatus: Int,
    onOpenLocalHttpSettings: () -> Unit = {},
    onOpenDashboard: () -> Unit = {},
    onOpenDataTypes: () -> Unit = {},
    onOpenIntegrations: () -> Unit = {},
    @Suppress("UNUSED_PARAMETER")
    onPermissionsUpdated: (Boolean, Set<String>) -> Unit = { _, _ -> }
) {
    val context = LocalContext.current
    val preferencesManager = remember { PreferencesManager(context) }

    var syncMode by remember { mutableStateOf(preferencesManager.getSyncMode()) }
    var syncInterval by remember { mutableStateOf(preferencesManager.getSyncIntervalMinutes().toString()) }
    var scheduledSyncs by remember { mutableStateOf(preferencesManager.getScheduledSyncs()) }
    var enabledDataTypes by remember { mutableStateOf(preferencesManager.getEnabledDataTypes()) }

    // Battery optimization banner state
    var isBatteryOptimized by remember {
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        mutableStateOf(!pm.isIgnoringBatteryOptimizations(context.packageName))
    }
    var batteryBannerDismissed by remember { mutableStateOf(preferencesManager.isBatteryBannerDismissed()) }
    val showBatteryBanner = isBatteryOptimized && !batteryBannerDismissed

    var showFeedbackSheet by remember { mutableStateOf(false) }
    var showWeeklyFeedbackPrompt by remember {
        mutableStateOf(preferencesManager.shouldShowWeeklyFeedbackPrompt())
    }
    val snackbarHostState = remember { SnackbarHostState() }
    val feedbackSuccessMessage = stringResource(R.string.feedback_success)
    val scope = rememberCoroutineScope()

    // Re-check battery optimization status every time the user returns to the app
    // (e.g. after granting the exemption in the system dialog).
    DisposableEffect(activity) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
                isBatteryOptimized = !pm.isIgnoringBatteryOptimizations(context.packageName)
                showWeeklyFeedbackPrompt = preferencesManager.shouldShowWeeklyFeedbackPrompt()
            }
        }
        activity.lifecycle.addObserver(observer)
        onDispose { activity.lifecycle.removeObserver(observer) }
    }

    LaunchedEffect(Unit) {
        preferencesManager.ensureFirstOpenTime()
        showWeeklyFeedbackPrompt = preferencesManager.shouldShowWeeklyFeedbackPrompt()
    }

    var lastSyncTime by remember { mutableStateOf(preferencesManager.getLastSyncTime()) }
    var lastSyncSummary by remember { mutableStateOf(preferencesManager.getLastSyncSummary()) }
    val isLocalHttpEnabled = preferencesManager.isLocalTcpEnabled()

    val localHttpPort = preferencesManager.getLocalTcpPort()

    val missingPermissionsForEnabled = remember(enabledDataTypes, grantedPermissionsSet) {
        val baseMissing = enabledDataTypes.mapNotNull { dataType ->
            val permission = HealthPermission.getReadPermission(dataType.recordClass)
            if (permission !in grantedPermissionsSet) permission else null
        }.toMutableSet()
        
        if (baseMissing.isNotEmpty() && "android.permission.health.READ_HEALTH_DATA_HISTORY" !in grantedPermissionsSet) {
            baseMissing.add("android.permission.health.READ_HEALTH_DATA_HISTORY")
        }
        baseMissing.toSet()
    }
    val isBackgroundGranted = HealthConnectManager.BACKGROUND_PERMISSION_STR in grantedPermissionsSet

    val webhookCount = remember { preferencesManager.getWebhookConfigs().count { it.isEnabled } }
    var showScheduleSheet by remember { mutableStateOf(false) }
    val logsLast24h = remember(lastSyncTime) {
        val cutoff = System.currentTimeMillis() - 24 * 60 * 60 * 1000L
        preferencesManager.getWebhookLogs().filter { it.timestamp >= cutoff && it.syncType != "test" }
    }

    val scheduleSummary = when (syncMode) {
        SyncMode.INTERVAL -> stringResource(R.string.home_schedule_every, syncInterval.toIntOrNull() ?: preferencesManager.getSyncIntervalMinutes())
        SyncMode.SCHEDULED -> scheduledSyncs.filter { it.enabled }.joinToString(", ") { it.getDisplayTime() }
            .ifEmpty { stringResource(R.string.home_status_no_times) }
    }
    val heroTitle = when {
        sdkStatus != HealthConnectClient.SDK_AVAILABLE || hasPermissions == false -> stringResource(R.string.home_status_setup)
        webhookCount == 0 && !isLocalHttpEnabled -> stringResource(R.string.home_status_no_target)
        hasPermissions == true && !isBackgroundGranted -> stringResource(R.string.home_status_manual)
        syncMode == SyncMode.SCHEDULED && scheduledSyncs.none { it.enabled } -> stringResource(R.string.home_status_no_times)
        else -> stringResource(R.string.home_status_on)
    }
    val syncIsOn = heroTitle == stringResource(R.string.home_status_on)
    val heroSubtitle = listOfNotNull(
        scheduleSummary.takeIf { syncIsOn },
        stringResource(R.string.home_status_subtitle, webhookCount, enabledDataTypes.size),
    ).joinToString(" · ")

    Scaffold(
        contentWindowInsets = WindowInsets(0.dp),
        snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp)
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // ── Header ───────────────────────────────────────────────────────
            Row(
                modifier = Modifier.fillMaxWidth().padding(start = 8.dp, top = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    stringResource(R.string.app_name),
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = onOpenDashboard) {
                    Icon(Icons.Filled.BarChart, contentDescription = stringResource(R.string.dashboard_title))
                }
            }

            // ── Status ───────────────────────────────────────────────────────
            com.hcwebhook.app.components.SyncHero(
                title = heroTitle,
                subtitle = heroSubtitle,
                sentLast24h = logsLast24h.takeIf { it.isNotEmpty() }?.count { it.success },
                failedLast24h = logsLast24h.takeIf { it.isNotEmpty() }?.count { !it.success },
                lastSyncTime = lastSyncTime,
                syncEvents = logsLast24h.map { it.timestamp to it.success },
                canSync = webhookCount > 0 || isLocalHttpEnabled,
                onSyncCompleted = {
                    lastSyncTime = preferencesManager.getLastSyncTime()
                    lastSyncSummary = preferencesManager.getLastSyncSummary()
                },
            )

            // ── Notices: only what needs the user now ────────────────────────
            when {
                hasPermissions == null -> Row(
                    modifier = Modifier.padding(horizontal = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(stringResource(R.string.config_perms_checking), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                sdkStatus != HealthConnectClient.SDK_AVAILABLE -> Notice(
                    icon = Icons.Filled.Warning,
                    title = stringResource(R.string.config_hc_not_found_title),
                    body = stringResource(R.string.config_hc_not_found_desc),
                    tone = NoticeTone.Error,
                )
                hasPermissions == false -> Notice(
                    icon = Icons.Filled.Info,
                    title = stringResource(R.string.config_perms_zero_title),
                    body = stringResource(R.string.config_perms_zero_desc),
                    action = stringResource(R.string.config_action_select_datatypes),
                    onAction = onOpenDataTypes,
                )
            }
            if (hasPermissions == true && missingPermissionsForEnabled.isNotEmpty()) {
                Notice(
                    icon = Icons.Filled.Shield,
                    title = stringResource(R.string.home_missing_perms_title),
                    body = stringResource(R.string.home_missing_perms_desc),
                    tone = NoticeTone.Error,
                    action = stringResource(R.string.config_action_grant),
                    onAction = {
                        try {
                            permissionLauncher.launch(missingPermissionsForEnabled)
                        } catch (e: Exception) {
                            Toast.makeText(context, context.getString(R.string.config_toast_error, e.message), Toast.LENGTH_LONG).show()
                        }
                    },
                )
            }
            if (hasPermissions == true && !isBackgroundGranted) {
                Notice(
                    icon = Icons.Filled.Schedule,
                    title = stringResource(R.string.config_bg_perm_title),
                    body = stringResource(R.string.config_bg_perm_desc),
                    action = stringResource(R.string.config_action_grant_bg),
                    onAction = {
                        try { permissionLauncher.launch(setOf(HealthConnectManager.BACKGROUND_PERMISSION_STR)) } catch (e: Exception) {
                            Toast.makeText(context, context.getString(R.string.config_toast_error, e.message), Toast.LENGTH_LONG).show()
                        }
                    },
                )
            }
            if (showBatteryBanner) {
                Notice(
                    icon = Icons.Filled.BatteryAlert,
                    title = stringResource(R.string.battery_banner_title),
                    body = stringResource(R.string.battery_banner_desc),
                    tone = NoticeTone.Error,
                    action = stringResource(R.string.battery_banner_action_fix),
                    onAction = { openBatterySettings(context) },
                    secondaryAction = stringResource(R.string.battery_banner_action_dismiss),
                    onSecondaryAction = {
                        batteryBannerDismissed = true
                        preferencesManager.setBatteryBannerDismissed(true)
                    },
                )
            }
            if (showWeeklyFeedbackPrompt) {
                Notice(
                    icon = Icons.AutoMirrored.Filled.Chat,
                    title = stringResource(R.string.feedback_weekly_title),
                    body = stringResource(R.string.feedback_weekly_desc),
                    action = stringResource(R.string.feedback_weekly_cta),
                    onAction = { showFeedbackSheet = true },
                    secondaryAction = stringResource(R.string.feedback_weekly_dismiss),
                    onSecondaryAction = {
                        showWeeklyFeedbackPrompt = false
                        preferencesManager.setWeeklyFeedbackPromptDismissed(true)
                        Toast.makeText(context, context.getString(R.string.feedback_weekly_dismiss_hint), Toast.LENGTH_LONG).show()
                    },
                )
            }

            // ── Sync setup ───────────────────────────────────────────────────
            Group(title = stringResource(R.string.home_section_sync)) {
                item {
                    SettingRow(
                        title = stringResource(R.string.health_data_title),
                        summary = stringResource(R.string.health_data_count, enabledDataTypes.size),
                        icon = Icons.Filled.Checklist,
                        chevron = true,
                        onClick = onOpenDataTypes,
                    )
                }
                if (isBackgroundGranted) {
                    item {
                        SettingRow(
                            title = stringResource(R.string.config_sync_schedule_title),
                            summary = scheduleSummary,
                            icon = Icons.Filled.Schedule,
                            chevron = true,
                            onClick = { showScheduleSheet = true },
                        )
                    }
                }
                item {
                    SettingRow(
                        title = stringResource(R.string.integrations_title),
                        summary = stringResource(
                            R.string.integrations_summary,
                            stringResource(if (isLocalHttpEnabled) R.string.state_on else R.string.state_off),
                            stringResource(if (preferencesManager.isMcpEnabled()) R.string.state_on else R.string.state_off),
                        ),
                        icon = Icons.Filled.Hub,
                        chevron = true,
                        onClick = onOpenIntegrations,
                    )
                }
            }

            // The battery notice can come back after the user dismissed it.
            if (isBatteryOptimized && batteryBannerDismissed) {
                TextButton(
                    onClick = {
                        batteryBannerDismissed = false
                        preferencesManager.setBatteryBannerDismissed(false)
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Filled.Warning, contentDescription = null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.battery_banner_title), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error)
                }
            }
        }

        if (showScheduleSheet) {
            ModalBottomSheet(onDismissRequest = { showScheduleSheet = false }) {
                Column(modifier = Modifier.fillMaxWidth().padding(start = 24.dp, end = 24.dp, bottom = 32.dp)) {
                    Text(stringResource(R.string.config_sync_schedule_title), style = MaterialTheme.typography.titleLarge)
                    Spacer(modifier = Modifier.height(16.dp))
                SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                    SegmentedButton(
                        selected = syncMode == SyncMode.INTERVAL,
                        onClick = { syncMode = SyncMode.INTERVAL; preferencesManager.setSyncMode(SyncMode.INTERVAL); (activity.application as? HCWebhookApplication)?.scheduleSyncWork() },
                        shape = SegmentedButtonDefaults.itemShape(index = 0, count = 2)
                    ) { Text(stringResource(R.string.config_sync_mode_interval)) }
                    SegmentedButton(
                        selected = syncMode == SyncMode.SCHEDULED,
                        onClick = { syncMode = SyncMode.SCHEDULED; preferencesManager.setSyncMode(SyncMode.SCHEDULED); preferencesManager.setScheduledSyncs(scheduledSyncs); (activity.application as? HCWebhookApplication)?.cancelSyncWork(); ScheduledSyncManager(context).scheduleAllAlarms() },
                        shape = SegmentedButtonDefaults.itemShape(index = 1, count = 2)
                    ) { Text(stringResource(R.string.config_sync_mode_scheduled)) }
                }
                Spacer(modifier = Modifier.height(12.dp))
                AnimatedVisibility(visible = syncMode == SyncMode.INTERVAL, enter = expandVertically(), exit = shrinkVertically()) {
                    Column {
                        OutlinedTextField(
                            value = syncInterval,
                            onValueChange = { syncInterval = it },
                            label = { Text(stringResource(R.string.config_sync_interval_label)) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.fillMaxWidth()
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Button(
                            onClick = {
                                val interval = syncInterval.toIntOrNull()
                                if (interval != null && interval >= 15) {
                                    preferencesManager.setSyncIntervalMinutes(interval)
                                    (activity.application as? HCWebhookApplication)?.scheduleSyncWork()
                                    Toast.makeText(context, context.getString(R.string.config_toast_interval_saved), Toast.LENGTH_SHORT).show()
                                } else {
                                    Toast.makeText(context, context.getString(R.string.config_toast_min_interval), Toast.LENGTH_SHORT).show()
                                }
                            },
                            modifier = Modifier.align(Alignment.End)
                        ) { Text(stringResource(R.string.config_action_update_interval)) }
                    }
                }
                AnimatedVisibility(visible = syncMode == SyncMode.SCHEDULED, enter = expandVertically(), exit = shrinkVertically()) {
                    Column {
                        // Exact alarm permission warning
                        if (!ScheduledSyncManager(context).canScheduleExactAlarms()) {
                            Card(
                                colors = CardDefaults.cardColors(
                                    containerColor = MaterialTheme.colorScheme.tertiaryContainer
                                ),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(bottom = 8.dp)
                                    .clickable {
                                        try {
                                            context.startActivity(
                                                Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                                                    data = Uri.parse("package:${context.packageName}")
                                                }
                                            )
                                        } catch (e: Exception) {
                                            try {
                                                context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                                                    data = Uri.parse("package:${context.packageName}")
                                                })
                                            } catch (_: Exception) {}
                                        }
                                    }
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Filled.Warning,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.onTertiaryContainer,
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Text(
                                        text = stringResource(R.string.exact_alarm_warning),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onTertiaryContainer
                                    )
                                }
                            }
                        }
                        scheduledSyncs.forEach { schedule ->
                            Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                Text(text = schedule.getDisplayTime(), style = MaterialTheme.typography.bodyMedium)
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Switch(checked = schedule.enabled, onCheckedChange = { enabled ->
                                        val updatedList = scheduledSyncs.map { if (it.id == schedule.id) it.copy(enabled = enabled) else it }
                                        scheduledSyncs = updatedList
                                        preferencesManager.setScheduledSyncs(updatedList)
                                        val syncManager = ScheduledSyncManager(context)
                                        if (enabled) syncManager.scheduleAlarm(schedule) else syncManager.cancelAlarm(schedule.id)
                                    })
                                    IconButton(onClick = {
                                        val updatedList = scheduledSyncs.filter { it.id != schedule.id }
                                        scheduledSyncs = updatedList
                                        preferencesManager.setScheduledSyncs(updatedList)
                                        ScheduledSyncManager(context).cancelAlarm(schedule.id)
                                    }) { Icon(Icons.Filled.Delete, "Delete", modifier = Modifier.size(18.dp)) }
                                }
                            }
                            HorizontalDivider(thickness = 0.5.dp)
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        Button(onClick = {
                            val calendar = Calendar.getInstance()
                            TimePickerDialog(context, { _, hour, minute ->
                                val newSchedule = ScheduledSync.create(hour, minute)
                                val updatedList = scheduledSyncs + newSchedule
                                scheduledSyncs = updatedList
                                preferencesManager.setScheduledSyncs(updatedList)
                                ScheduledSyncManager(context).scheduleAlarm(newSchedule)
                            }, calendar.get(Calendar.HOUR_OF_DAY), calendar.get(Calendar.MINUTE), true).show()
                        }, modifier = Modifier.fillMaxWidth()) {
                            Icon(Icons.Filled.Add, null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(stringResource(R.string.config_action_add_schedule))
                        }
                    }
                }
                }
            }
        }

        FeedbackSheet(
            visible = showFeedbackSheet,
            onDismiss = { showFeedbackSheet = false },
            onSubmitted = {
                showFeedbackSheet = false
                if (showWeeklyFeedbackPrompt) {
                    showWeeklyFeedbackPrompt = false
                    preferencesManager.setWeeklyFeedbackPromptDismissed(true)
                }
                scope.launch {
                    snackbarHostState.showSnackbar(feedbackSuccessMessage)
                }
            },
        )
    }
}

@Composable
internal fun resolutionChipOptions(family: DataResolutionFamily): List<Pair<Int, String>> {
    val full = stringResource(R.string.config_hr_resolution_full)
    val oneMin = stringResource(R.string.config_hr_resolution_1m)
    val fiveMin = stringResource(R.string.config_hr_resolution_5m)
    val fifteenMin = stringResource(R.string.config_hr_resolution_15m)
    val daily = stringResource(R.string.config_steps_resolution_daily)
    val sleepFull = stringResource(R.string.config_sleep_resolution_full)
    val sleepSummary = stringResource(R.string.config_sleep_resolution_summary)
    val intervalBuckets = listOf(
        1 to oneMin,
        5 to fiveMin,
        15 to fifteenMin,
    )
    return when (family) {
        DataResolutionFamily.INTERVAL_WITH_DAILY -> listOf(
            RESOLUTION_DAILY to daily,
            RESOLUTION_FULL to full,
        ) + intervalBuckets
        DataResolutionFamily.INTERVAL_RAW_DEFAULT -> listOf(
            RESOLUTION_FULL to full,
            RESOLUTION_DAILY to daily,
        ) + intervalBuckets
        DataResolutionFamily.SAMPLE_SERIES -> listOf(RESOLUTION_FULL to full) + intervalBuckets
        DataResolutionFamily.SLEEP_SESSION -> listOf(
            RESOLUTION_FULL to sleepFull,
            SLEEP_SUMMARY to sleepSummary,
        )
    }
}

/**
 * Nested resolution picker shown under an enabled data type in the sheet.
 * [options] maps each stored value to its label; [selected] is the current value.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun ResolutionChipRow(
    subtitle: String,
    options: List<Pair<Int, String>>,
    selected: Int,
    onSelect: (Int) -> Unit,
    /** Shown when non-null and a time bucket is selected: the "count apps once" switch. */
    bucketDedup: Boolean? = null,
    onBucketDedupChange: (Boolean) -> Unit = {},
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 32.dp, top = 2.dp, bottom = 12.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerHigh)
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        Text(
            text = stringResource(R.string.config_resolution_label),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
        )
        Text(
            text = subtitle,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(8.dp))
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            options.forEach { (value, label) ->
                FilterChip(
                    selected = selected == value,
                    onClick = { onSelect(value) },
                    label = { Text(label) },
                )
            }
        }
        if (bucketDedup != null && selected > 0) {
            Spacer(modifier = Modifier.height(12.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f).padding(end = 8.dp)) {
                    Text(
                        text = stringResource(R.string.config_bucket_dedup_title),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                    )
                    Text(
                        text = stringResource(R.string.config_bucket_dedup_hint),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                AppSwitch(bucketDedup, onBucketDedupChange)
            }
        }
    }
}

/**
 * Opens the screen where the user can turn off battery optimization: the system dialog, then the
 * OEM screen (Samsung Device Care and others), then the generic list. Do not use resolveActivity():
 * on Android 11+ it returns null for system intents because of package visibility filtering.
 */
private fun openBatterySettings(context: Context) {
    val intents = listOfNotNull(
        BatteryOptimizationHelper.buildRequestExemptionIntent(context),
        BatteryOptimizationHelper.buildOemDeepLinkIntent(),
        Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
    )
    val opened = intents.any { intent ->
        try {
            context.startActivity(intent)
            true
        } catch (_: Exception) {
            false
        }
    }
    if (!opened) {
        Toast.makeText(context, context.getString(R.string.battery_toast_open_failed), Toast.LENGTH_LONG).show()
    }
}
