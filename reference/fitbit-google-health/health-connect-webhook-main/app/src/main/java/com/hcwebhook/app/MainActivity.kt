package com.hcwebhook.app

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.BackHandler
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.Modifier
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.health.connect.client.HealthConnectClient
import androidx.lifecycle.lifecycleScope
import com.hcwebhook.app.BuildConfig
import com.hcwebhook.app.screens.AboutScreen
import com.hcwebhook.app.screens.ChangelogScreen
import com.hcwebhook.app.screens.ConfigurationScreen
import com.hcwebhook.app.screens.DashboardScreen
import com.hcwebhook.app.screens.DataTypesScreen
import com.hcwebhook.app.screens.IntegrationsScreen
import com.hcwebhook.app.screens.LocalHttpSettingsScreen
import com.hcwebhook.app.screens.LogsScreen
import com.hcwebhook.app.screens.NotificationsScreen
import com.hcwebhook.app.screens.OnboardingScreen
import com.hcwebhook.app.screens.SettingsBackupScreen
import com.hcwebhook.app.screens.WebhooksScreen
import com.hcwebhook.app.screens.WhatsNewSheet
import com.hcwebhook.app.ui.AppearanceState
import com.hcwebhook.app.ui.LockScreen
import com.hcwebhook.app.ui.theme.HCWebhookTheme
import kotlinx.coroutines.launch
import androidx.compose.ui.res.stringResource

class MainActivity : AppCompatActivity() {

    private lateinit var preferencesManager: PreferencesManager
    internal var pendingSyncCallback: (() -> Unit)? = null
    internal var permissionStatusCallback: ((Boolean) -> Unit)? = null
    private lateinit var permissionLauncher: androidx.activity.result.ActivityResultLauncher<Set<String>>
    internal val openLocalHttpRequest = mutableStateOf(false)
    private val locked = mutableStateOf(false)

    private fun initializePermissionLauncher() {
        val requestPermissionActivityContract = androidx.health.connect.client.PermissionController.createRequestPermissionResultContract()

        permissionLauncher = registerForActivityResult(requestPermissionActivityContract) { _: Set<String> ->
            lifecycleScope.launch {
                val healthConnectManager = HealthConnectManager(this@MainActivity)
                val grantedPermissions = healthConnectManager.getGrantedPermissions()
                val hasAnyPerms = grantedPermissions.isNotEmpty()

                permissionStatusCallback?.invoke(hasAnyPerms)

                if (hasAnyPerms && pendingSyncCallback != null) {
                    pendingSyncCallback?.invoke()
                    pendingSyncCallback = null
                } else if (!hasAnyPerms && pendingSyncCallback != null) {
                    android.widget.Toast.makeText(this@MainActivity, "No permissions granted", android.widget.Toast.LENGTH_LONG).show()
                    pendingSyncCallback = null
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // This will only do something if built with 'playstore' flavor.
        // It does absolutely nothing in the 'foss' flavor.
        FlavorUtils.verifyPlayStoreInstallation(this)
        
        installSplashScreen()
        enableEdgeToEdge()
        preferencesManager = PreferencesManager(this)
        initializePermissionLauncher()
        if (intent?.getBooleanExtra(LocalHttpServerService.EXTRA_OPEN_LOCAL_HTTP, false) == true) {
            openLocalHttpRequest.value = true
        }

        AppearanceState.dynamicColor.value = preferencesManager.isDynamicColor()
        locked.value = AppLock.isLocked(this)
        applyRecentsPreview(this)
        setContent {
            HCWebhookTheme(dynamicColor = AppearanceState.dynamicColor.value) {
                if (locked.value) {
                    LockScreen(onUnlock = {
                        AppLock.authenticate(this, getString(R.string.app_lock_prompt_title)) { ok -> if (ok) locked.value = false }
                    })
                    return@HCWebhookTheme
                }
                var showOnboarding by remember { mutableStateOf(!preferencesManager.hasSeenOnboarding()) }
                if (showOnboarding) {
                    OnboardingScreen(onFinish = {
                        preferencesManager.setHasSeenOnboarding()
                        showOnboarding = false
                    })
                } else {
                    MainScreenWithNav(
                        activity = this@MainActivity,
                        preferencesManager = preferencesManager,
                        permissionLauncher = permissionLauncher,
                        onRestartOnboarding = { showOnboarding = true }
                    )
                }
            }
        }
    }

    override fun onStart() {
        super.onStart()
        locked.value = AppLock.isLocked(this)
        AppLock.onForeground()
    }

    override fun onStop() {
        super.onStop()
        if (!isChangingConfigurations) AppLock.onBackground()
    }

    // Screens that the app opens itself (permissions, file picker, settings) do not lock it.
    override fun startActivity(intent: android.content.Intent?, options: Bundle?) {
        AppLock.allowNextLeave()
        super.startActivity(intent, options)
    }

    @Deprecated("Deprecated in Java")
    override fun startActivityForResult(intent: android.content.Intent, requestCode: Int, options: Bundle?) {
        AppLock.allowNextLeave()
        super.startActivityForResult(intent, requestCode, options)
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent.getBooleanExtra(LocalHttpServerService.EXTRA_OPEN_LOCAL_HTTP, false)) {
            openLocalHttpRequest.value = true
        }
    }

    @Composable
    fun MainScreenWithNav(
        activity: MainActivity,
        preferencesManager: PreferencesManager,
        permissionLauncher: androidx.activity.result.ActivityResultLauncher<Set<String>>,
        onRestartOnboarding: () -> Unit = {}
    ) {
        var selectedScreen by remember { mutableStateOf<NavigationScreen>(NavigationScreen.Home) }
        var showDashboard by remember { mutableStateOf(false) }
        var showLocalHttpSettings by remember { mutableStateOf(false) }
        var showNotificationsSettings by remember { mutableStateOf(false) }
        var showSettingsBackup by remember { mutableStateOf(false) }
        var showChangelog by remember { mutableStateOf(false) }
        var showDataTypes by remember { mutableStateOf(false) }
        var showIntegrations by remember { mutableStateOf(false) }
        var showWhatsNew by remember { mutableStateOf(false) }

        LaunchedEffect(Unit) {
            val currentCode = BuildConfig.VERSION_CODE
            val lastSeen = preferencesManager.getLastSeenVersionCode()
            when {
                lastSeen == 0 -> preferencesManager.setLastSeenVersionCode(currentCode)
                currentCode > lastSeen -> showWhatsNew = true
            }
        }

        LaunchedEffect(activity.openLocalHttpRequest.value) {
            if (activity.openLocalHttpRequest.value) {
                showLocalHttpSettings = true
                activity.openLocalHttpRequest.value = false
            }
        }

        // Hoisted permission state — survives tab switches
        var hasPermissions by remember { mutableStateOf<Boolean?>(null) }
        var grantedPermissionsSet by remember { mutableStateOf<Set<String>>(emptySet()) }
        var sdkStatus by remember { mutableIntStateOf(HealthConnectClient.SDK_UNAVAILABLE) }

        // Initial permission check
        LaunchedEffect(Unit) {
            try {
                val status = HealthConnectClient.getSdkStatus(activity)
                sdkStatus = status
                if (status == HealthConnectClient.SDK_AVAILABLE) {
                    val mgr = HealthConnectManager(activity)
                    val granted = mgr.getGrantedPermissions()
                    hasPermissions = granted.isNotEmpty()
                    grantedPermissionsSet = granted
                } else {
                    hasPermissions = false
                }
            } catch (e: Exception) {
                hasPermissions = false
            }
        }

        // Keep state fresh after the permission launcher returns
        DisposableEffect(Unit) {
            activity.permissionStatusCallback = { granted ->
                hasPermissions = granted
                if (granted) {
                    lifecycleScope.launch {
                        try {
                            grantedPermissionsSet = HealthConnectManager(activity).getGrantedPermissions()
                        } catch (_: Exception) {}
                    }
                } else {
                    grantedPermissionsSet = emptySet()
                }
            }
            onDispose { activity.permissionStatusCallback = null }
        }

        Scaffold(
            bottomBar = {
                if (!showDashboard && !showLocalHttpSettings && !showNotificationsSettings && !showSettingsBackup && !showChangelog && !showDataTypes && !showIntegrations) {
                    NavigationBar(containerColor = MaterialTheme.colorScheme.surfaceContainer) {
                        bottomNavItems.forEach { screen ->
                            NavigationBarItem(
                                icon = { Icon(screen.icon, contentDescription = stringResource(screen.titleResId)) },
                                label = { Text(stringResource(screen.titleResId)) },
                                selected = selectedScreen == screen,
                                onClick = { selectedScreen = screen }
                            )
                        }
                    }
                }
            }
        ) { padding ->
            BackHandler {
                if (showDataTypes) {
                    showDataTypes = false
                } else if (showDashboard) {
                    showDashboard = false
                } else if (showLocalHttpSettings) {
                    showLocalHttpSettings = false
                } else if (showIntegrations) {
                    showIntegrations = false
                } else if (showNotificationsSettings) {
                    showNotificationsSettings = false
                } else if (showSettingsBackup) {
                    showSettingsBackup = false
                } else if (showChangelog) {
                    showChangelog = false
                } else if (selectedScreen != NavigationScreen.Home) {
                    selectedScreen = NavigationScreen.Home
                } else {
                    activity.finish()
                }
            }
            val saveableStateHolder = rememberSaveableStateHolder()
            Box(modifier = Modifier.padding(padding)) {
                if (showDataTypes) {
                    DataTypesScreen(
                        grantedPermissionsSet = grantedPermissionsSet,
                        permissionLauncher = permissionLauncher,
                        onBack = { showDataTypes = false },
                    )
                } else if (showDashboard) {
                    DashboardScreen(
                        hasPermissions = hasPermissions,
                        grantedPermissionsSet = grantedPermissionsSet,
                        sdkStatus = sdkStatus,
                        onBack = { showDashboard = false },
                    )
                } else if (showLocalHttpSettings) {
                    LocalHttpSettingsScreen(onBack = { showLocalHttpSettings = false })
                } else if (showIntegrations) {
                    IntegrationsScreen(
                        onBack = { showIntegrations = false },
                        onOpenLocalHttpSettings = { showLocalHttpSettings = true },
                    )
                } else if (showNotificationsSettings) {
                    NotificationsScreen(onBack = { showNotificationsSettings = false })
                } else if (showSettingsBackup) {
                    SettingsBackupScreen(onBack = { showSettingsBackup = false })
                } else if (showChangelog) {
                    ChangelogScreen(onBack = { showChangelog = false })
                } else {
                    saveableStateHolder.SaveableStateProvider(selectedScreen.toString()) {
                        when (selectedScreen) {
                            is NavigationScreen.Home -> ConfigurationScreen(
                                activity = activity,
                                permissionLauncher = permissionLauncher,
                                hasPermissions = hasPermissions,
                                grantedPermissionsSet = grantedPermissionsSet,
                                sdkStatus = sdkStatus,
                                onOpenLocalHttpSettings = { showLocalHttpSettings = true },
                                onOpenDashboard = { showDashboard = true },
                                onOpenDataTypes = { showDataTypes = true },
                                onOpenIntegrations = { showIntegrations = true },
                            )
                            is NavigationScreen.Webhooks -> WebhooksScreen(
                                onOpenNotificationsSettings = { showNotificationsSettings = true }
                            )
                            is NavigationScreen.Logs -> LogsScreen()
                            is NavigationScreen.About -> AboutScreen(
                                onRestartOnboarding = onRestartOnboarding,
                                onOpenLocalHttpSettings = { showIntegrations = true },
                                onOpenNotificationsSettings = { showNotificationsSettings = true },
                                onOpenSettingsBackup = { showSettingsBackup = true },
                                onOpenChangelog = { showChangelog = true },
                            )
                        }
                    }
                }
            }
        }

        WhatsNewSheet(
            visible = showWhatsNew,
            onDismiss = {
                showWhatsNew = false
                preferencesManager.setLastSeenVersionCode(BuildConfig.VERSION_CODE)
            },
        )
    }
}