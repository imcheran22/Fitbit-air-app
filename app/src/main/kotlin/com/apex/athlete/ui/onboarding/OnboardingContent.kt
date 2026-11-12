package com.apex.athlete.ui.onboarding

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.apex.athlete.R
import com.apex.athlete.core.analytics.strain.Sex
import com.apex.athlete.core.analytics.strain.ZoneMethod
import com.apex.athlete.core.data.healthconnect.HcSdkStatus
import com.apex.athlete.core.data.healthconnect.HealthConnectPermissions
import com.apex.athlete.core.data.healthconnect.HealthConnectStatus
import com.apex.athlete.core.network.auth.AuthorizationOutcome
import com.apex.athlete.core.ui.components.ApexButton
import com.apex.athlete.core.ui.components.ApexButtonStyle
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.ApexTextField
import com.apex.athlete.core.ui.components.ChipTone
import com.apex.athlete.core.ui.components.StatusChip
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.theme.ApexShapes
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.core.ui.theme.ThemePreference
import com.apex.athlete.di.SignInUiState

@Composable
private fun Heading(text: String) {
    Text(text, style = ApexTheme.type.sectionTitle, color = ApexTheme.colors.foreground)
}

@Composable
private fun Body(text: String, modifier: Modifier = Modifier) {
    Text(text, style = ApexTheme.type.body, color = ApexTheme.colors.foregroundBody, modifier = modifier)
}

@Composable
private fun Caption(text: String, modifier: Modifier = Modifier) {
    Text(text, style = ApexTheme.type.caption, color = ApexTheme.colors.mutedForeground, modifier = modifier)
}

@Composable
private fun CardTitle(text: String) {
    Text(text.uppercase(), style = ApexTheme.type.cardTitle, color = ApexTheme.colors.foregroundSecondary)
}

// ---------------------------------------------------------------- Welcome

@Composable
internal fun WelcomeContent() {
    Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.cardGap)) {
        Heading(stringResource(R.string.onboarding_welcome_title))
        Body(stringResource(R.string.onboarding_welcome_body))
        ApexCard(Modifier.fillMaxWidth()) {
            CardTitle(stringResource(R.string.onboarding_welcome_private_title))
            Body(stringResource(R.string.onboarding_welcome_private_body), Modifier.padding(top = ApexSpacing.sm))
        }
        Caption(stringResource(R.string.onboarding_welcome_companion))
    }
}

// ---------------------------------------------------------------- Profile

@Composable
internal fun ProfileContent(
    draft: ProfileDraft,
    validation: ProfileValidation,
    showErrors: Boolean,
    currentYear: Int,
    onBirthYear: (String) -> Unit,
    onSex: (Sex) -> Unit,
    onHeight: (String) -> Unit,
    onWeight: (String) -> Unit,
    onMaxHeartRate: (String) -> Unit,
    onZoneMethod: (ZoneMethod) -> Unit,
) {
    fun error(field: ProfileField): Boolean = showErrors && field in validation.errors
    Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
        Heading(stringResource(R.string.onboarding_profile_title))
        Body(stringResource(R.string.onboarding_profile_body))

        ApexTextField(
            value = draft.birthYear,
            onValueChange = onBirthYear,
            label = stringResource(R.string.onboarding_profile_birth_year),
            modifier = Modifier.fillMaxWidth(),
            placeholder = stringResource(R.string.onboarding_profile_birth_year_hint),
            errorText = if (error(ProfileField.BIRTH_YEAR)) {
                stringResource(
                    R.string.onboarding_profile_error_birth_year,
                    ProfileRules.minBirthYear(currentYear),
                    ProfileRules.maxBirthYear(currentYear),
                )
            } else {
                null
            },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        )

        ChoiceGroup(
            title = stringResource(R.string.onboarding_profile_sex),
            options = listOf(
                Sex.MALE to stringResource(R.string.onboarding_profile_sex_male),
                Sex.FEMALE to stringResource(R.string.onboarding_profile_sex_female),
                Sex.UNSPECIFIED to stringResource(R.string.onboarding_profile_sex_unspecified),
            ),
            selected = draft.sex,
            onSelected = onSex,
        )

        ApexTextField(
            value = draft.heightCm,
            onValueChange = onHeight,
            label = stringResource(R.string.onboarding_profile_height),
            modifier = Modifier.fillMaxWidth(),
            errorText = if (error(ProfileField.HEIGHT)) {
                stringResource(
                    R.string.onboarding_profile_error_height,
                    ProfileRules.MIN_HEIGHT_CM.toInt(),
                    ProfileRules.MAX_HEIGHT_CM.toInt(),
                )
            } else {
                null
            },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        )
        ApexTextField(
            value = draft.weightKg,
            onValueChange = onWeight,
            label = stringResource(R.string.onboarding_profile_weight),
            modifier = Modifier.fillMaxWidth(),
            errorText = if (error(ProfileField.WEIGHT)) {
                stringResource(
                    R.string.onboarding_profile_error_weight,
                    ProfileRules.MIN_WEIGHT_KG.toInt(),
                    ProfileRules.MAX_WEIGHT_KG.toInt(),
                )
            } else {
                null
            },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        )
        ApexTextField(
            value = draft.maxHeartRate,
            onValueChange = onMaxHeartRate,
            label = stringResource(R.string.onboarding_profile_max_hr),
            modifier = Modifier.fillMaxWidth(),
            supportingText = stringResource(R.string.onboarding_profile_max_hr_hint),
            errorText = if (error(ProfileField.MAX_HEART_RATE)) {
                stringResource(
                    R.string.onboarding_profile_error_max_hr,
                    ProfileRules.MIN_MAX_HR,
                    ProfileRules.MAX_MAX_HR,
                )
            } else {
                null
            },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        )

        ChoiceGroup(
            title = stringResource(R.string.onboarding_profile_zone_method),
            options = listOf(
                ZoneMethod.PERCENT_OF_MAX_HEART_RATE to stringResource(R.string.onboarding_profile_zone_percent),
                ZoneMethod.HEART_RATE_RESERVE to stringResource(R.string.onboarding_profile_zone_reserve),
            ),
            selected = draft.zoneMethod,
            onSelected = onZoneMethod,
        )
        if (draft.zoneMethod == ZoneMethod.HEART_RATE_RESERVE) {
            Caption(stringResource(R.string.onboarding_profile_zone_reserve_note))
        }
        Caption(stringResource(R.string.onboarding_profile_provenance))
    }
}

/** A labelled radio group. Each row is a 48 dp target; selection is shown by a filled ring and read by TalkBack. */
@Composable
private fun <T> ChoiceGroup(
    title: String,
    options: List<Pair<T, String>>,
    selected: T,
    onSelected: (T) -> Unit,
) {
    val colors = ApexTheme.colors
    Column(Modifier.selectableGroup()) {
        CardTitle(title)
        options.forEach { (value, label) ->
            val isSelected = value == selected
            Row(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = ApexSpacing.minTouch)
                    .selectable(selected = isSelected, role = Role.RadioButton, onClick = { onSelected(value) }),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(ApexSpacing.md),
            ) {
                Box(
                    Modifier
                        .size(20.dp)
                        .border(2.dp, if (isSelected) colors.primary else colors.border, ApexShapes.pill)
                        .padding(4.dp)
                        .background(if (isSelected) colors.primary else colors.background, ApexShapes.pill),
                )
                Text(label, style = ApexTheme.type.body, color = colors.foreground)
            }
        }
    }
}

// ---------------------------------------------------------------- Sources

@Composable
internal fun SourcesContent(
    googleConnected: Boolean,
    googleConfigured: Boolean,
    signIn: SignInUiState,
    healthConnect: HealthConnectStatus?,
    takeoutChosen: Boolean,
    anyChosen: Boolean,
    playStoreFailed: Boolean,
    onSignIn: () -> Unit,
    onDismissSignIn: () -> Unit,
    onInstallHealthConnect: () -> Unit,
    onAllowHealthConnect: () -> Unit,
    onTakeoutChoice: (Boolean) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.cardGap)) {
        Heading(stringResource(R.string.onboarding_sources_title))
        Body(stringResource(R.string.onboarding_sources_body))
        GoogleCard(googleConnected, googleConfigured, signIn, onSignIn, onDismissSignIn)
        HealthConnectCard(healthConnect, playStoreFailed, onInstallHealthConnect, onAllowHealthConnect)
        TakeoutCard(takeoutChosen, onTakeoutChoice)
        if (!anyChosen) {
            Text(
                stringResource(R.string.onboarding_sources_needed),
                style = ApexTheme.type.caption,
                color = ApexTheme.colors.warningText,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            )
        }
    }
}

@Composable
private fun SourceHeader(title: String, chipText: String, tone: ChipTone, icon: androidx.compose.ui.graphics.vector.ImageVector? = null) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.weight(1f)) { CardTitle(title) }
        StatusChip(chipText, tone = tone, icon = icon)
    }
}

@Composable
private fun GoogleCard(
    connected: Boolean,
    configured: Boolean,
    signIn: SignInUiState,
    onSignIn: () -> Unit,
    onDismiss: () -> Unit,
) {
    val colors = ApexTheme.colors
    val busy = signIn is SignInUiState.WaitingForBrowser || signIn is SignInUiState.Completing
    val message = googleMessage(signIn, configured)
    ApexCard(Modifier.fillMaxWidth()) {
        SourceHeader(
            title = stringResource(R.string.onboarding_google_title),
            chipText = stringResource(
                if (connected) R.string.onboarding_source_status_connected else R.string.onboarding_source_status_not_connected,
            ),
            tone = if (connected) ChipTone.OPTIMAL else ChipTone.NEUTRAL,
            icon = if (connected) ApexIcons.Check else null,
        )
        Body(
            stringResource(if (connected) R.string.onboarding_google_connected else R.string.onboarding_google_body),
            Modifier.padding(top = ApexSpacing.sm),
        )
        if (message != null && !connected) {
            Text(
                message.text,
                style = ApexTheme.type.caption,
                color = if (message.isProblem) colors.recoveryRedText else colors.foregroundSecondary,
                modifier = Modifier
                    .padding(top = ApexSpacing.sm)
                    .semantics { liveRegion = LiveRegionMode.Polite },
            )
        }
        if (!connected) {
            ApexButton(
                text = stringResource(R.string.onboarding_google_signin),
                onClick = onSignIn,
                modifier = Modifier.fillMaxWidth().padding(top = ApexSpacing.md),
                enabled = configured && !busy,
            )
            if (message?.isProblem == true) {
                ApexButton(
                    text = stringResource(R.string.onboarding_google_dismiss),
                    onClick = onDismiss,
                    modifier = Modifier.fillMaxWidth().padding(top = ApexSpacing.sm),
                    style = ApexButtonStyle.Secondary,
                )
            }
        }
    }
}

private class GoogleMessage(val text: String, val isProblem: Boolean)

@Composable
private fun googleMessage(state: SignInUiState, configured: Boolean): GoogleMessage? {
    if (!configured) return GoogleMessage(stringResource(R.string.onboarding_google_not_configured), true)
    return when (state) {
        SignInUiState.Idle -> null
        SignInUiState.WaitingForBrowser -> GoogleMessage(stringResource(R.string.onboarding_google_waiting), false)
        SignInUiState.Completing -> GoogleMessage(stringResource(R.string.onboarding_google_completing), false)
        is SignInUiState.Done -> GoogleMessage(
            stringResource(
                if (state.missingScopes.isEmpty()) R.string.onboarding_google_done else R.string.onboarding_google_done_missing,
            ),
            state.missingScopes.isNotEmpty(),
        )
        SignInUiState.NotConfigured -> GoogleMessage(stringResource(R.string.onboarding_google_not_configured), true)
        is SignInUiState.RedirectSchemeMismatch -> GoogleMessage(
            stringResource(R.string.onboarding_google_mismatch, state.manifestScheme, state.neededScheme),
            true,
        )
        SignInUiState.NoBrowser -> GoogleMessage(stringResource(R.string.onboarding_google_no_browser), true)
        is SignInUiState.Failed -> GoogleMessage(
            stringResource(
                when (state.outcome) {
                    is AuthorizationOutcome.Denied -> R.string.onboarding_google_denied
                    AuthorizationOutcome.NetworkFailure -> R.string.onboarding_google_failed_network
                    else -> R.string.onboarding_google_failed_other
                },
            ),
            true,
        )
        SignInUiState.Unexpected -> GoogleMessage(stringResource(R.string.onboarding_google_unexpected), true)
    }
}

@Composable
private fun HealthConnectCard(
    status: HealthConnectStatus?,
    playStoreFailed: Boolean,
    onInstall: () -> Unit,
    onAllow: () -> Unit,
) {
    val readable = status?.isReadable == true
    ApexCard(Modifier.fillMaxWidth()) {
        SourceHeader(
            title = stringResource(R.string.onboarding_hc_title),
            chipText = stringResource(
                if (readable) R.string.onboarding_source_status_connected else R.string.onboarding_source_status_not_connected,
            ),
            tone = if (readable) ChipTone.OPTIMAL else ChipTone.NEUTRAL,
            icon = if (readable) ApexIcons.Check else null,
        )
        Body(stringResource(R.string.onboarding_hc_body), Modifier.padding(top = ApexSpacing.sm))
        Column(Modifier.padding(top = ApexSpacing.sm), verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
            when {
                status == null -> Caption(stringResource(R.string.onboarding_hc_checking))
                status.sdk == HcSdkStatus.UNAVAILABLE || status.sdk == HcSdkStatus.UPDATE_REQUIRED -> {
                    Text(
                        stringResource(
                            if (status.sdk == HcSdkStatus.UPDATE_REQUIRED) R.string.onboarding_hc_update else R.string.onboarding_hc_unavailable,
                        ),
                        style = ApexTheme.type.caption,
                        color = ApexTheme.colors.warningText,
                    )
                    ApexButton(
                        text = stringResource(R.string.onboarding_hc_install),
                        onClick = onInstall,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    if (playStoreFailed) Caption(stringResource(R.string.onboarding_hc_play_store_missing))
                }
                else -> HealthConnectPermissionList(status, onAllow)
            }
            Caption(stringResource(R.string.onboarding_hc_provenance))
        }
    }
}

@Composable
private fun HealthConnectPermissionList(status: HealthConnectStatus, onAllow: () -> Unit) {
    if (!status.isReadable) Caption(stringResource(R.string.onboarding_hc_none_granted))
    val shown = HealthConnectPermissions.recordPermissions.filter {
        it in status.grantedRecordPermissions || it in status.missingRecordPermissions
    }
    shown.forEach { permission ->
        val label = permissionLabel(permission) ?: return@forEach
        val granted = permission in status.grantedRecordPermissions
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.weight(1f)) {
                Text(stringResource(label), style = ApexTheme.type.body, color = ApexTheme.colors.foreground)
            }
            StatusChip(
                text = stringResource(
                    if (granted) R.string.onboarding_hc_granted_heading else R.string.onboarding_hc_missing_heading,
                ),
                tone = if (granted) ChipTone.OPTIMAL else ChipTone.NEUTRAL,
                icon = if (granted) ApexIcons.Check else null,
            )
        }
    }
    Caption(
        stringResource(
            when {
                status.historyGranted -> R.string.onboarding_hc_history_on
                status.historyFeatureAvailable -> R.string.onboarding_hc_history_off
                else -> R.string.onboarding_hc_history_unavailable
            },
        ),
    )
    Caption(
        stringResource(
            when {
                status.backgroundGranted -> R.string.onboarding_hc_background_on
                status.backgroundFeatureAvailable -> R.string.onboarding_hc_background_off
                else -> R.string.onboarding_hc_background_unavailable
            },
        ),
    )
    if (status.toRequest().isNotEmpty()) {
        ApexButton(
            text = stringResource(
                if (status.grantedRecordPermissions.isEmpty()) R.string.onboarding_hc_allow else R.string.onboarding_hc_allow_more,
            ),
            onClick = onAllow,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@StringRes
private fun permissionLabel(permission: String): Int? = when (permission) {
    HealthConnectPermissions.heartRate -> R.string.onboarding_perm_heart_rate
    HealthConnectPermissions.restingHeartRate -> R.string.onboarding_perm_resting_heart_rate
    HealthConnectPermissions.hrv -> R.string.onboarding_perm_hrv
    HealthConnectPermissions.sleep -> R.string.onboarding_perm_sleep
    HealthConnectPermissions.oxygenSaturation -> R.string.onboarding_perm_oxygen
    HealthConnectPermissions.respiratoryRate -> R.string.onboarding_perm_respiratory
    HealthConnectPermissions.skinTemperature -> R.string.onboarding_perm_skin_temperature
    HealthConnectPermissions.steps -> R.string.onboarding_perm_steps
    HealthConnectPermissions.exercise -> R.string.onboarding_perm_exercise
    HealthConnectPermissions.totalCalories -> R.string.onboarding_perm_calories
    HealthConnectPermissions.vo2Max -> R.string.onboarding_perm_vo2_max
    HealthConnectPermissions.floors -> R.string.onboarding_perm_floors
    HealthConnectPermissions.distance -> R.string.onboarding_perm_distance
    else -> null
}

@Composable
private fun TakeoutCard(chosen: Boolean, onChoice: (Boolean) -> Unit) {
    ApexCard(Modifier.fillMaxWidth()) {
        SourceHeader(
            title = stringResource(R.string.onboarding_takeout_title),
            chipText = stringResource(
                if (chosen) R.string.onboarding_source_status_chosen else R.string.onboarding_source_status_not_connected,
            ),
            tone = if (chosen) ChipTone.INFO else ChipTone.NEUTRAL,
            icon = if (chosen) ApexIcons.Check else null,
        )
        Body(stringResource(R.string.onboarding_takeout_body), Modifier.padding(top = ApexSpacing.sm))
        if (chosen) Caption(stringResource(R.string.onboarding_takeout_chosen), Modifier.padding(top = ApexSpacing.sm))
        ApexButton(
            text = stringResource(if (chosen) R.string.onboarding_takeout_undo else R.string.onboarding_takeout_choose),
            onClick = { onChoice(!chosen) },
            modifier = Modifier.fillMaxWidth().padding(top = ApexSpacing.md),
            style = ApexButtonStyle.Secondary,
        )
    }
}

// ---------------------------------------------------------------- Notifications

@Composable
internal fun NotificationsContent(enabled: Boolean, denied: Boolean, onEnable: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.cardGap)) {
        Heading(stringResource(R.string.onboarding_notifications_title))
        Body(stringResource(R.string.onboarding_notifications_body))
        if (enabled) {
            StatusChip(
                stringResource(R.string.onboarding_notifications_on),
                tone = ChipTone.OPTIMAL,
                icon = ApexIcons.Check,
            )
        } else {
            ApexButton(
                text = stringResource(R.string.onboarding_notifications_enable),
                onClick = onEnable,
                modifier = Modifier.fillMaxWidth(),
            )
            if (denied) {
                Text(
                    stringResource(R.string.onboarding_notifications_denied),
                    style = ApexTheme.type.caption,
                    color = ApexTheme.colors.warningText,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
            }
        }
    }
}

// ---------------------------------------------------------------- Calibration

@Composable
internal fun CalibrationContent(windows: CalibrationWindows) {
    Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.cardGap)) {
        Heading(stringResource(R.string.onboarding_calibration_title))
        Body(stringResource(R.string.onboarding_calibration_body))
        ApexCard(Modifier.fillMaxWidth()) {
            Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                Body(
                    stringResource(
                        R.string.onboarding_calibration_baseline,
                        windows.baselineMinDays,
                        windows.baselineWindowDays,
                    ),
                )
                Body(stringResource(R.string.onboarding_calibration_sleep, windows.sleepNeedNights))
                Body(stringResource(R.string.onboarding_calibration_workload, windows.workloadDays))
                Caption(stringResource(R.string.onboarding_calibration_provenance))
            }
        }
        Caption(stringResource(R.string.onboarding_calibration_missing))
    }
}

// ---------------------------------------------------------------- Previews

@Composable
private fun PreviewFrame(dark: Boolean, content: @Composable () -> Unit) {
    ApexTheme(if (dark) ThemePreference.DARK else ThemePreference.LIGHT) {
        Box(Modifier.background(ApexTheme.colors.background).padding(ApexSpacing.lg)) { content() }
    }
}

private val previewStatus = HealthConnectStatus(
    sdk = HcSdkStatus.AVAILABLE,
    grantedRecordPermissions = setOf(HealthConnectPermissions.heartRate, HealthConnectPermissions.sleep),
    missingRecordPermissions = setOf(HealthConnectPermissions.steps),
    historyGranted = false,
    historyFeatureAvailable = true,
    backgroundGranted = true,
    backgroundFeatureAvailable = true,
    skinTemperatureSupported = false,
)

@Composable
private fun SourcesPreviewBody() = SourcesContent(
    googleConnected = false,
    googleConfigured = false,
    signIn = SignInUiState.Idle,
    healthConnect = previewStatus,
    takeoutChosen = false,
    anyChosen = true,
    playStoreFailed = false,
    onSignIn = {},
    onDismissSignIn = {},
    onInstallHealthConnect = {},
    onAllowHealthConnect = {},
    onTakeoutChoice = {},
)

@Composable
private fun ProfilePreviewBody() = ProfileContent(
    draft = ProfileDraft(birthYear = "1890", heightCm = "178"),
    validation = ProfileRules.validate(ProfileDraft(birthYear = "1890", heightCm = "178"), 2026),
    showErrors = true,
    currentYear = 2026,
    onBirthYear = {}, onSex = {}, onHeight = {}, onWeight = {}, onMaxHeartRate = {}, onZoneMethod = {},
)

@Preview(name = "Welcome dark", widthDp = 360)
@Composable
private fun WelcomeDark() = PreviewFrame(true) { WelcomeContent() }

@Preview(name = "Welcome light", widthDp = 360)
@Composable
private fun WelcomeLight() = PreviewFrame(false) { WelcomeContent() }

@Preview(name = "Profile dark", widthDp = 360, heightDp = 900)
@Composable
private fun ProfileDark() = PreviewFrame(true) { ProfilePreviewBody() }

@Preview(name = "Profile light", widthDp = 360, heightDp = 900)
@Composable
private fun ProfileLight() = PreviewFrame(false) { ProfilePreviewBody() }

@Preview(name = "Sources dark", widthDp = 360, heightDp = 1000)
@Composable
private fun SourcesDark() = PreviewFrame(true) { SourcesPreviewBody() }

@Preview(name = "Sources light", widthDp = 360, heightDp = 1000)
@Composable
private fun SourcesLight() = PreviewFrame(false) { SourcesPreviewBody() }

@Preview(name = "Notifications dark", widthDp = 360)
@Composable
private fun NotificationsDark() = PreviewFrame(true) { NotificationsContent(enabled = false, denied = true, onEnable = {}) }

@Preview(name = "Notifications light", widthDp = 360)
@Composable
private fun NotificationsLight() = PreviewFrame(false) { NotificationsContent(enabled = false, denied = true, onEnable = {}) }

@Preview(name = "Calibration dark", widthDp = 360)
@Composable
private fun CalibrationDark() = PreviewFrame(true) { CalibrationContent(CalibrationWindows(7, 30, 14, 14)) }

@Preview(name = "Calibration light", widthDp = 360)
@Composable
private fun CalibrationLight() = PreviewFrame(false) { CalibrationContent(CalibrationWindows(7, 30, 14, 14)) }
