package com.apex.athlete.ui.settings

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.data.alerts.AlertScheduler
import com.apex.athlete.core.data.settings.AppSettings
import com.apex.athlete.core.data.settings.ThemeChoice
import com.apex.athlete.core.data.settings.UnitSystem
import com.apex.athlete.core.data.worker.SyncScheduler
import com.apex.athlete.core.ui.components.ApexButton
import com.apex.athlete.core.ui.components.ApexButtonStyle
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.ApexTextField
import com.apex.athlete.core.ui.components.SettingNavRow
import com.apex.athlete.core.ui.components.SettingToggleRow
import com.apex.athlete.core.ui.components.SettingValueRow
import com.apex.athlete.core.ui.components.hideFromTalkBack
import com.apex.athlete.core.ui.components.apexClickable
import com.apex.athlete.core.ui.components.minTouchTarget
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.shell.ApexSheet
import com.apex.athlete.core.ui.shell.DetailHeader
import com.apex.athlete.core.ui.shell.SectionShell
import com.apex.athlete.core.ui.theme.ApexShapes
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.core.ui.theme.ThemePreference
import com.apex.athlete.di.SignInUiState
import com.apex.athlete.navigation.ApexNavigator
import com.apex.athlete.ui.common.apexViewModel

/** Every action the Settings content can raise; the route fills it from the ViewModel. */
internal class SettingsActions(
    val onTheme: (ThemeChoice) -> Unit = {},
    val onUnits: (UnitSystem) -> Unit = {},
    val onClock24h: (Boolean) -> Unit = {},
    val onNotificationsRequested: (Boolean) -> Unit = {},
    val onNotifyRecovery: (Boolean) -> Unit = {},
    val onNotifyFatigue: (Boolean) -> Unit = {},
    val onNotifyStale: (Boolean) -> Unit = {},
    val onQuietStart: (Int) -> Unit = {},
    val onQuietEnd: (Int) -> Unit = {},
    val onBackgroundSync: (Boolean) -> Unit = {},
    val onTakeoutDays: (Int) -> Unit = {},
    val onSaveClientId: (String) -> Unit = {},
    val onAiCoach: (Boolean) -> Unit = {},
    val onEditAiKey: (() -> Unit)? = null,
    val onTurnOffDemo: () -> Unit = {},
    val onOpenHowItWorks: () -> Unit = {},
    val onOpenPrivacy: () -> Unit = {},
    val onOpenLicences: () -> Unit = {},
)

@Composable
fun SettingsRoute(navigator: ApexNavigator) {
    val context = LocalContext.current.applicationContext
    val vm = apexViewModel { container, _ ->
        SettingsViewModel(
            store = container.settings,
            stores = container.stores,
            auth = container.auth,
            onAlertsChanged = { enabled -> AlertScheduler.schedule(context, enabled) },
            onBackgroundSyncChanged = { enabled -> SyncScheduler.schedulePeriodic(context, enabled) },
            onEditAiKey = null, // the screen routes key editing to Coach (see below)
        )
    }
    val settings by vm.settings.collectAsStateWithLifecycle()
    val signIn by vm.signIn.collectAsStateWithLifecycle()

    var notificationsDenied by rememberSaveable { mutableStateOf(false) }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        notificationsDenied = !granted
        if (granted) vm.setNotifications(true)
    }
    val activityContext = LocalContext.current

    val actions = SettingsActions(
        onTheme = vm::setTheme,
        onUnits = vm::setUnits,
        onClock24h = vm::setClock24h,
        onNotificationsRequested = { on ->
            if (!on) {
                notificationsDenied = false
                vm.setNotifications(false)
            } else if (needsNotificationPermission(activityContext)) {
                permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            } else {
                notificationsDenied = false
                vm.setNotifications(true)
            }
        },
        onNotifyRecovery = vm::setNotifyRecovery,
        onNotifyFatigue = vm::setNotifyFatigue,
        onNotifyStale = vm::setNotifyStale,
        onQuietStart = vm::setQuietStart,
        onQuietEnd = vm::setQuietEnd,
        onBackgroundSync = vm::setBackgroundSync,
        onTakeoutDays = vm::setTakeoutNudgeDays,
        onSaveClientId = vm::saveClientId,
        onAiCoach = vm::setAiCoachEnabled,
        // The key is entered on the Coach screen (it owns the key store UI).
        onEditAiKey = navigator::openCoach,
        onTurnOffDemo = vm::turnOffDemo,
        onOpenHowItWorks = navigator::openHowItWorks,
        onOpenPrivacy = navigator::openPrivacy,
        onOpenLicences = navigator::openLicences,
    )

    SettingsContent(
        settings = settings,
        signIn = signIn,
        notificationsDenied = notificationsDenied,
        actions = actions,
        onBack = navigator::back,
    )
}

private fun needsNotificationPermission(context: Context): Boolean =
    Build.VERSION.SDK_INT >= 33 &&
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED

private const val SHEET_NONE = 0
private const val SHEET_QUIET_START = 1
private const val SHEET_QUIET_END = 2
private const val SHEET_TAKEOUT = 3
private const val SHEET_DEMO = 4

@Composable
internal fun SettingsContent(
    settings: AppSettings?,
    signIn: SignInUiState,
    notificationsDenied: Boolean,
    actions: SettingsActions,
    onBack: () -> Unit,
) {
    Column(Modifier.fillMaxSize()) {
        DetailHeader(
            title = stringResource(R.string.settings_title),
            onBack = onBack,
            backDescription = stringResource(R.string.common_back),
        )
        if (settings == null) return@Column // first read pending; nothing editable to show yet

        var sheet by rememberSaveable { mutableIntStateOf(SHEET_NONE) }
        val close = { sheet = SHEET_NONE }

        Column(
            Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = ApexSpacing.gutter),
            verticalArrangement = Arrangement.spacedBy(ApexSpacing.sectionGap),
        ) {
            AppearanceSection(settings, actions)
            NotificationsSection(
                settings = settings,
                denied = notificationsDenied,
                actions = actions,
                onPickQuietStart = { sheet = SHEET_QUIET_START },
                onPickQuietEnd = { sheet = SHEET_QUIET_END },
            )
            DataSection(settings, actions, onPickTakeout = { sheet = SHEET_TAKEOUT })
            GoogleSection(settings, signIn, actions)
            CoachSection(settings, actions)
            DemoSection(settings, onTurnOff = { sheet = SHEET_DEMO })
            AboutSection(actions)
            Spacer(Modifier.height(ApexSpacing.xl))
        }

        when (sheet) {
            SHEET_QUIET_START -> TimeSheet(
                title = stringResource(R.string.settings_time_sheet_start),
                initialMinute = settings.quietStartMinute,
                clock24h = settings.clock24h,
                onConfirm = { actions.onQuietStart(it); close() },
                onDismiss = close,
            )
            SHEET_QUIET_END -> TimeSheet(
                title = stringResource(R.string.settings_time_sheet_end),
                initialMinute = settings.quietEndMinute,
                clock24h = settings.clock24h,
                onConfirm = { actions.onQuietEnd(it); close() },
                onDismiss = close,
            )
            SHEET_TAKEOUT -> TakeoutSheet(
                current = settings.takeoutNudgeDays,
                onPick = { actions.onTakeoutDays(it); close() },
                onDismiss = close,
            )
            SHEET_DEMO -> DemoConfirmSheet(
                onConfirm = { actions.onTurnOffDemo(); close() },
                onDismiss = close,
            )
        }
    }
}

@Composable
private fun AppearanceSection(settings: AppSettings, actions: SettingsActions) {
    SectionShell(stringResource(R.string.settings_section_appearance)) {
        ApexCard {
            Segmented(
                label = stringResource(R.string.settings_theme_label),
                options = listOf(
                    ThemeChoice.SYSTEM to stringResource(R.string.settings_theme_system),
                    ThemeChoice.LIGHT to stringResource(R.string.settings_theme_light),
                    ThemeChoice.DARK to stringResource(R.string.settings_theme_dark),
                ),
                selected = settings.theme,
                onSelect = actions.onTheme,
            )
            Spacer(Modifier.height(ApexSpacing.md))
            Segmented(
                label = stringResource(R.string.settings_units_label),
                options = listOf(
                    UnitSystem.METRIC to stringResource(R.string.settings_units_metric),
                    UnitSystem.IMPERIAL to stringResource(R.string.settings_units_imperial),
                ),
                selected = settings.units,
                onSelect = actions.onUnits,
            )
            SettingToggleRow(
                title = stringResource(R.string.settings_clock24h_title),
                subtitle = stringResource(R.string.settings_clock24h_subtitle),
                checked = settings.clock24h,
                onCheckedChange = actions.onClock24h,
            )
        }
    }
}

@Composable
private fun NotificationsSection(
    settings: AppSettings,
    denied: Boolean,
    actions: SettingsActions,
    onPickQuietStart: () -> Unit,
    onPickQuietEnd: () -> Unit,
) {
    SectionShell(stringResource(R.string.settings_section_notifications)) {
        ApexCard {
            SettingToggleRow(
                title = stringResource(R.string.settings_notifications_title),
                subtitle = stringResource(R.string.settings_notifications_subtitle),
                checked = settings.notificationsEnabled,
                onCheckedChange = actions.onNotificationsRequested,
            )
            if (denied && !settings.notificationsEnabled) {
                Text(
                    stringResource(R.string.settings_notifications_denied),
                    style = ApexTheme.type.caption,
                    color = ApexTheme.colors.warningText,
                    modifier = Modifier.padding(bottom = 8.dp),
                )
            }
            val on = settings.notificationsEnabled
            SettingToggleRow(
                title = stringResource(R.string.settings_notify_recovery_title),
                subtitle = stringResource(R.string.settings_notify_recovery_subtitle),
                checked = settings.notifyRecovery,
                onCheckedChange = actions.onNotifyRecovery,
                enabled = on,
            )
            SettingToggleRow(
                title = stringResource(R.string.settings_notify_fatigue_title),
                subtitle = stringResource(R.string.settings_notify_fatigue_subtitle),
                checked = settings.notifyFatigue,
                onCheckedChange = actions.onNotifyFatigue,
                enabled = on,
            )
            SettingToggleRow(
                title = stringResource(R.string.settings_notify_stale_title),
                subtitle = stringResource(R.string.settings_notify_stale_subtitle),
                checked = settings.notifyStale,
                onCheckedChange = actions.onNotifyStale,
                enabled = on,
            )
            if (on) {
                SettingNavRow(
                    title = stringResource(R.string.settings_quiet_start_title),
                    subtitle = stringResource(R.string.settings_quiet_subtitle),
                    value = formatMinuteOfDay(settings.quietStartMinute, settings.clock24h),
                    onClick = onPickQuietStart,
                )
                SettingNavRow(
                    title = stringResource(R.string.settings_quiet_end_title),
                    value = formatMinuteOfDay(settings.quietEndMinute, settings.clock24h),
                    onClick = onPickQuietEnd,
                )
            }
        }
    }
}

@Composable
private fun DataSection(settings: AppSettings, actions: SettingsActions, onPickTakeout: () -> Unit) {
    SectionShell(stringResource(R.string.settings_section_data)) {
        ApexCard {
            SettingToggleRow(
                title = stringResource(R.string.settings_sync_title),
                subtitle = stringResource(R.string.settings_sync_subtitle),
                checked = settings.backgroundSync,
                onCheckedChange = actions.onBackgroundSync,
                icon = ApexIcons.Sync,
            )
            SettingNavRow(
                title = stringResource(R.string.settings_takeout_title),
                subtitle = stringResource(R.string.settings_takeout_subtitle),
                value = takeoutLabel(settings.takeoutNudgeDays),
                onClick = onPickTakeout,
            )
        }
    }
}

@Composable
private fun takeoutLabel(days: Int): String =
    if (days <= 0) stringResource(R.string.settings_takeout_off)
    else pluralStringResource(R.plurals.settings_takeout_every_days, days, days)

@Composable
private fun GoogleSection(settings: AppSettings, signIn: SignInUiState, actions: SettingsActions) {
    var draft by rememberSaveable { mutableStateOf<String?>(null) }
    val shown = draft ?: settings.googleClientId.orEmpty()
    val changed = draft != null && clientIdChanged(draft.orEmpty(), settings.googleClientId)
    val mismatch = (signIn as? SignInUiState.RedirectSchemeMismatch)?.let {
        stringResource(R.string.settings_client_id_mismatch, it.manifestScheme, it.neededScheme)
    }
    SectionShell(stringResource(R.string.settings_section_google)) {
        ApexCard {
            ApexTextField(
                value = shown,
                onValueChange = { draft = it },
                label = stringResource(R.string.settings_client_id_label),
                placeholder = stringResource(R.string.settings_client_id_placeholder),
                supportingText = stringResource(R.string.settings_client_id_support),
                errorText = mismatch,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            )
            Spacer(Modifier.height(ApexSpacing.md))
            ApexButton(
                text = stringResource(R.string.settings_client_id_save),
                onClick = {
                    actions.onSaveClientId(shown)
                    draft = null
                },
                enabled = changed,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun CoachSection(settings: AppSettings, actions: SettingsActions) {
    SectionShell(stringResource(R.string.settings_section_coach)) {
        ApexCard {
            SettingToggleRow(
                title = stringResource(R.string.settings_coach_title),
                subtitle = stringResource(R.string.settings_coach_subtitle),
                checked = settings.aiCoachEnabled,
                onCheckedChange = actions.onAiCoach,
            )
            val editKey = actions.onEditAiKey
            if (editKey != null && settings.aiCoachEnabled) {
                SettingNavRow(
                    title = stringResource(R.string.settings_coach_key_title),
                    subtitle = stringResource(R.string.settings_coach_key_subtitle),
                    onClick = editKey,
                )
            }
        }
    }
}

@Composable
private fun DemoSection(settings: AppSettings, onTurnOff: () -> Unit) {
    SectionShell(stringResource(R.string.settings_section_demo)) {
        ApexCard {
            SettingValueRow(
                title = stringResource(R.string.settings_demo_title),
                value = stringResource(if (settings.demoMode) R.string.settings_demo_on else R.string.settings_demo_off),
            )
            Text(
                stringResource(if (settings.demoMode) R.string.settings_demo_body_on else R.string.settings_demo_body_off),
                style = ApexTheme.type.caption,
                color = ApexTheme.colors.mutedForeground,
            )
            if (settings.demoMode) {
                Spacer(Modifier.height(ApexSpacing.md))
                ApexButton(
                    text = stringResource(R.string.settings_demo_turn_off),
                    onClick = onTurnOff,
                    style = ApexButtonStyle.Secondary,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

@Composable
private fun AboutSection(actions: SettingsActions) {
    SectionShell(stringResource(R.string.settings_section_about)) {
        ApexCard {
            SettingNavRow(stringResource(R.string.settings_about_how), onClick = actions.onOpenHowItWorks)
            SettingNavRow(stringResource(R.string.settings_about_privacy), onClick = actions.onOpenPrivacy)
            SettingNavRow(stringResource(R.string.settings_about_licences), onClick = actions.onOpenLicences)
        }
    }
}

/** A row of mutually exclusive options. Each is a 48 dp radio target; selection is not colour only (filled pill). */
@Composable
private fun <T> Segmented(
    label: String,
    options: List<Pair<T, String>>,
    selected: T,
    onSelect: (T) -> Unit,
) {
    val colors = ApexTheme.colors
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label.uppercase(), style = ApexTheme.type.statLabel, color = colors.mutedForeground, modifier = Modifier.semantics { heading() })
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            options.forEach { (value, text) ->
                val isSelected = value == selected
                val spoken = stringResource(
                    if (isSelected) R.string.settings_choice_selected else R.string.settings_choice_not_selected,
                    text,
                )
                Row(
                    Modifier
                        .weight(1f)
                        .minTouchTarget()
                        .background(if (isSelected) colors.accent else colors.field, ApexShapes.button)
                        .selectable(selected = isSelected, role = Role.RadioButton, onClick = { onSelect(value) })
                        .semantics { contentDescription = spoken }
                        .padding(horizontal = 8.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text,
                        style = if (isSelected) ApexTheme.type.bodyStrong else ApexTheme.type.body,
                        color = if (isSelected) colors.foreground else colors.foregroundSecondary,
                        modifier = Modifier.hideFromTalkBack(),
                    )
                }
            }
        }
    }
}

@Composable
private fun TakeoutSheet(current: Int, onPick: (Int) -> Unit, onDismiss: () -> Unit) {
    ApexSheet(onDismiss = onDismiss, title = stringResource(R.string.settings_takeout_sheet_title)) {
        takeoutChoices(current).forEach { days ->
            val label = takeoutLabel(days)
            val isSelected = days == current
            val spoken = stringResource(
                if (isSelected) R.string.settings_choice_selected else R.string.settings_choice_not_selected,
                label,
            )
            Row(
                Modifier
                    .fillMaxWidth()
                    .minTouchTarget()
                    .selectable(selected = isSelected, role = Role.RadioButton, onClick = { onPick(days) })
                    .semantics { contentDescription = spoken }
                    .padding(vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    label,
                    style = if (isSelected) ApexTheme.type.bodyStrong else ApexTheme.type.body,
                    color = ApexTheme.colors.foreground,
                    modifier = Modifier.weight(1f).hideFromTalkBack(),
                )
                if (isSelected) {
                    Icon(
                        ApexIcons.Check,
                        contentDescription = null,
                        tint = ApexTheme.colors.optimalText,
                        modifier = Modifier.padding(end = 4.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun DemoConfirmSheet(onConfirm: () -> Unit, onDismiss: () -> Unit) {
    ApexSheet(onDismiss = onDismiss, title = stringResource(R.string.settings_demo_confirm_title)) {
        Text(
            stringResource(R.string.settings_demo_confirm_body),
            style = ApexTheme.type.body,
            color = ApexTheme.colors.foregroundBody,
        )
        ApexButton(
            text = stringResource(R.string.settings_demo_confirm_action),
            onClick = onConfirm,
            style = ApexButtonStyle.Destructive,
            modifier = Modifier.fillMaxWidth(),
        )
        ApexButton(
            text = stringResource(R.string.common_cancel),
            onClick = onDismiss,
            style = ApexButtonStyle.Secondary,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/** Hour and minute steppers (minutes in steps of 5). Shows the result in the user's clock style. */
@Composable
private fun TimeSheet(
    title: String,
    initialMinute: Int,
    clock24h: Boolean,
    onConfirm: (Int) -> Unit,
    onDismiss: () -> Unit,
) {
    var minute by rememberSaveable { mutableIntStateOf(initialMinute) }
    val shown = formatMinuteOfDay(minute, clock24h)
    ApexSheet(onDismiss = onDismiss, title = title) {
        Text(
            shown,
            style = ApexTheme.type.statValueLarge,
            color = ApexTheme.colors.foreground,
            modifier = Modifier
                .fillMaxWidth()
                .semantics { contentDescription = shownDescription(shown) },
        )
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(ApexSpacing.lg)) {
            Stepper(
                label = stringResource(R.string.settings_time_hours_label),
                upDescription = stringResource(R.string.settings_time_hour_up),
                downDescription = stringResource(R.string.settings_time_hour_down),
                onUp = { minute = stepHour(minute, 1) },
                onDown = { minute = stepHour(minute, -1) },
                modifier = Modifier.weight(1f),
            )
            Stepper(
                label = stringResource(R.string.settings_time_minutes_label),
                upDescription = stringResource(R.string.settings_time_minute_up),
                downDescription = stringResource(R.string.settings_time_minute_down),
                onUp = { minute = stepMinutePart(minute, 1) },
                onDown = { minute = stepMinutePart(minute, -1) },
                modifier = Modifier.weight(1f),
            )
        }
        ApexButton(
            text = stringResource(R.string.settings_time_save),
            onClick = { onConfirm(minute) },
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun shownDescription(shown: String): String = stringResource(R.string.settings_time_selected, shown)

@Composable
private fun Stepper(
    label: String,
    upDescription: String,
    downDescription: String,
    onUp: () -> Unit,
    onDown: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = ApexTheme.colors
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label.uppercase(), style = ApexTheme.type.statLabel, color = colors.mutedForeground)
        StepButton(ApexIcons.ChevronUp, upDescription, onUp)
        StepButton(ApexIcons.ChevronDown, downDescription, onDown)
    }
}

@Composable
private fun StepButton(icon: androidx.compose.ui.graphics.vector.ImageVector, description: String, onClick: () -> Unit) {
    val colors = ApexTheme.colors
    Row(
        Modifier
            .fillMaxWidth()
            .minTouchTarget()
            .background(colors.field, ApexShapes.button)
            .apexClickable(onClick = onClick, role = Role.Button)
            .semantics { contentDescription = description },
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = colors.foreground, modifier = Modifier.padding(12.dp))
    }
}

@Preview(name = "Settings dark", heightDp = 1400)
@Composable
private fun SettingsPreviewDark() = ApexTheme(ThemePreference.DARK) { SettingsPreviewBody() }

@Preview(name = "Settings light", heightDp = 1400)
@Composable
private fun SettingsPreviewLight() = ApexTheme(ThemePreference.LIGHT) { SettingsPreviewBody() }

@Composable
private fun SettingsPreviewBody() {
    Column(Modifier.background(ApexTheme.colors.background)) {
        SettingsContent(
            settings = AppSettings(notificationsEnabled = true, demoMode = true, takeoutNudgeDays = 30, googleClientId = "example.apps"),
            signIn = SignInUiState.RedirectSchemeMismatch("com.example.a", "com.example.b"),
            notificationsDenied = false,
            actions = SettingsActions(),
            onBack = {},
        )
    }
}
