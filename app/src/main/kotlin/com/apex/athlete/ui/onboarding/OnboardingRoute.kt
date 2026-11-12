package com.apex.athlete.ui.onboarding

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.activity.compose.LocalActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.foundation.clickable
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.data.healthconnect.HealthConnectPermissions
import com.apex.athlete.core.ui.components.ApexButton
import com.apex.athlete.core.ui.components.ApexButtonStyle
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.theme.ApexShapes
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.navigation.ApexNavigator
import com.apex.athlete.ui.common.LocalAppContainer
import com.apex.athlete.ui.common.apexViewModel
import java.time.LocalDate
import com.apex.athlete.core.data.worker.SyncScheduler

/**
 * First-run setup. Owns its steps (see [OnboardingSteps]); the host leaves this route by itself
 * once `onboardingDone` flips, so the route never navigates. [navigator] is unused for that reason.
 */
@Suppress("UNUSED_PARAMETER")
@Composable
fun OnboardingRoute(navigator: ApexNavigator) {
    val container = LocalAppContainer.current
    val appContext = LocalContext.current.applicationContext
    val vm = apexViewModel { c, handle ->
        OnboardingViewModel(
            settings = c.settings,
            readHealthConnect = { c.healthConnectAvailability.status() },
            authState = c.auth.authState,
            handle = handle,
            onFinishedReal = { SyncScheduler.syncNow(appContext) },
        )
    }
    val step by vm.step.collectAsStateWithLifecycle()
    val draft by vm.draft.collectAsStateWithLifecycle()
    val validation by vm.validation.collectAsStateWithLifecycle()
    val showErrors by vm.showProfileErrors.collectAsStateWithLifecycle()
    val sources by vm.sources.collectAsStateWithLifecycle()
    val healthConnect by vm.healthConnect.collectAsStateWithLifecycle()
    val notificationsOn by vm.notificationsEnabled.collectAsStateWithLifecycle()
    val signIn by container.auth.state.collectAsStateWithLifecycle()

    val context = LocalContext.current
    val activity = LocalActivity.current
    var playStoreFailed by rememberSaveable { mutableStateOf(false) }
    var notificationsDenied by rememberSaveable { mutableStateOf(false) }
    val calibration = remember { CalibrationWindows.fromEngines() }
    val currentYear = remember { LocalDate.now().year }

    val healthConnectLauncher = rememberLauncherForActivityResult(HealthConnectPermissions.requestContract()) {
        vm.refreshHealthConnect()
    }
    val notificationLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        notificationsDenied = !granted
        vm.setNotifications(granted)
    }

    LaunchedEffect(step) { if (step == OnboardingStep.SOURCES) vm.refreshHealthConnect() }
    // Back from the Play Store or the permission sheet: read the new state.
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        if (step == OnboardingStep.SOURCES) vm.refreshHealthConnect()
    }
    BackHandler(enabled = OnboardingSteps.back(step) != null) { vm.back() }

    val scroll = rememberScrollState()
    LaunchedEffect(step) { scroll.scrollTo(0) }

    Column(
        Modifier
            .fillMaxSize()
            .background(ApexTheme.colors.background)
            .windowInsetsPadding(WindowInsets.safeDrawing),
    ) {
        OnboardingHeader(step = step, onBack = { vm.back() })
        Column(
            Modifier
                .weight(1f)
                .verticalScroll(scroll)
                .padding(horizontal = ApexSpacing.gutter, vertical = ApexSpacing.md),
        ) {
            when (step) {
                OnboardingStep.WELCOME -> WelcomeContent()
                OnboardingStep.PROFILE -> ProfileContent(
                    draft = draft,
                    validation = validation,
                    showErrors = showErrors,
                    currentYear = currentYear,
                    onBirthYear = vm::setBirthYear,
                    onSex = vm::setSex,
                    onHeight = vm::setHeight,
                    onWeight = vm::setWeight,
                    onMaxHeartRate = vm::setMaxHeartRate,
                    onZoneMethod = vm::setZoneMethod,
                )
                OnboardingStep.SOURCES -> SourcesContent(
                    googleConnected = sources.googleConnected,
                    googleConfigured = container.auth.isConfigured,
                    signIn = signIn,
                    healthConnect = healthConnect,
                    takeoutChosen = sources.takeoutChosen,
                    anyChosen = sources.anyChosen,
                    playStoreFailed = playStoreFailed,
                    onSignIn = { activity?.let(container.auth::begin) },
                    onDismissSignIn = container.auth::dismiss,
                    onInstallHealthConnect = { playStoreFailed = !openPlayStore(context) },
                    onAllowHealthConnect = {
                        healthConnect?.toRequest()?.takeIf { it.isNotEmpty() }?.let { healthConnectLauncher.launch(it) }
                    },
                    onTakeoutChoice = vm::setTakeoutChosen,
                )
                OnboardingStep.NOTIFICATIONS -> NotificationsContent(
                    enabled = notificationsOn,
                    denied = notificationsDenied,
                    onEnable = {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            notificationLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                        } else {
                            notificationsDenied = false
                            vm.setNotifications(true)
                        }
                    },
                )
                OnboardingStep.CALIBRATION -> CalibrationContent(calibration)
            }
        }
        OnboardingFooter(
            step = step,
            canAdvance = OnboardingSteps.canAdvance(step, validation.isValid || !showErrors, sources),
            onNext = vm::next,
            onSkip = vm::skip,
            onDemo = vm::chooseDemo,
            onFinish = vm::finish,
        )
    }
}

/** Opens the Play Store page of Health Connect. Returns false when no store app could handle it. */
private fun openPlayStore(context: Context): Boolean {
    val id = HealthConnectPermissions.PROVIDER_PACKAGE
    val targets = listOf("market://details?id=$id", "https://play.google.com/store/apps/details?id=$id")
    for (target in targets) {
        try {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(target)))
            return true
        } catch (_: ActivityNotFoundException) {
            // try the next target
        }
    }
    return false
}

@Composable
private fun OnboardingHeader(step: OnboardingStep, onBack: () -> Unit) {
    val position = OnboardingSteps.position(step) ?: return
    val total = OnboardingSteps.counted.size
    val colors = ApexTheme.colors
    val title = stringResource(
        when (step) {
            OnboardingStep.PROFILE -> R.string.onboarding_profile_title
            OnboardingStep.SOURCES -> R.string.onboarding_sources_title
            OnboardingStep.NOTIFICATIONS -> R.string.onboarding_notifications_title
            else -> R.string.onboarding_calibration_title
        },
    )
    val spoken = stringResource(R.string.onboarding_step_of_spoken, position, total, title)
    val backLabel = stringResource(R.string.onboarding_back)
    Column(Modifier.padding(horizontal = ApexSpacing.gutter)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .size(ApexSpacing.minTouch)
                    .clickable(role = Role.Button, onClickLabel = backLabel, onClick = onBack),
                contentAlignment = Alignment.Center,
            ) {
                Icon(ApexIcons.Back, contentDescription = backLabel, tint = colors.foreground)
            }
            Text(
                stringResource(R.string.onboarding_step_of, position, total).uppercase(),
                style = ApexTheme.type.cardTitle,
                color = colors.foregroundSecondary,
                modifier = Modifier.padding(start = ApexSpacing.sm),
            )
        }
        Row(
            Modifier
                .fillMaxWidth()
                .semantics(mergeDescendants = true) { contentDescription = spoken },
            horizontalArrangement = Arrangement.spacedBy(ApexSpacing.xs),
        ) {
            for (index in 1..total) {
                Box(
                    Modifier
                        .weight(1f)
                        .height(4.dp)
                        .background(if (index <= position) colors.primary else colors.border, ApexShapes.pill),
                )
            }
        }
    }
}

@Composable
private fun OnboardingFooter(
    step: OnboardingStep,
    canAdvance: Boolean,
    onNext: () -> Unit,
    onSkip: () -> Unit,
    onDemo: () -> Unit,
    onFinish: () -> Unit,
) {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = ApexSpacing.gutter, vertical = ApexSpacing.md),
        verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm),
    ) {
        when (step) {
            OnboardingStep.WELCOME -> {
                ApexButton(stringResource(R.string.onboarding_welcome_setup), onNext, Modifier.fillMaxWidth())
                ApexButton(
                    stringResource(R.string.onboarding_welcome_demo),
                    onDemo,
                    Modifier.fillMaxWidth(),
                    style = ApexButtonStyle.Secondary,
                )
            }
            OnboardingStep.CALIBRATION ->
                ApexButton(stringResource(R.string.onboarding_finish), onFinish, Modifier.fillMaxWidth())
            else -> {
                ApexButton(stringResource(R.string.onboarding_continue), onNext, Modifier.fillMaxWidth(), enabled = canAdvance)
                if (OnboardingSteps.canSkip(step)) {
                    ApexButton(
                        stringResource(R.string.onboarding_skip),
                        onSkip,
                        Modifier.fillMaxWidth(),
                        style = ApexButtonStyle.Secondary,
                    )
                }
            }
        }
    }
}
