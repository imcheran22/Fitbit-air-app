package com.apex.athlete

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.os.SystemClock
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.createSavedStateHandle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.apex.athlete.core.data.settings.ThemeChoice
import com.apex.athlete.core.data.worker.SyncScheduler
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.core.ui.theme.ThemePreference
import com.apex.athlete.navigation.ApexNavHost
import com.apex.athlete.ui.common.ApexFormatter
import com.apex.athlete.widget.WidgetDeepLink
import com.apex.athlete.ui.common.LocalAppContainer
import com.apex.athlete.ui.common.LocalFormatter
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.time.LocalDate

/** Keeps the selected day across process death. Null means "follow today". */
class SelectedDayViewModel(private val handle: SavedStateHandle) : ViewModel() {
    val epochDay = handle.getStateFlow<Long?>(KEY, null)

    fun select(day: LocalDate, today: LocalDate) {
        handle[KEY] = if (day == today) null else day.toEpochDay()
    }

    private companion object {
        const val KEY = "selected_day"
    }
}

/** Single activity: edge-to-edge Compose host. */
class MainActivity : ComponentActivity() {

    private var privacyRequest by mutableStateOf(false)
    private var widgetRoute by mutableStateOf<String?>(null)

    @Volatile
    private var settingsLoaded = false

    /**
     * Pulls fresh data when the owner opens the app (the promise in SyncScheduler's KDoc), at most once
     * every 15 minutes per process so rotation and quick app switches do not spend the request budget.
     * Never in Demo mode or before onboarding: the demo store takes no live data.
     */
    override fun onStart() {
        super.onStart()
        val now = SystemClock.elapsedRealtime()
        if (lastOpenSyncAt != 0L && now - lastOpenSyncAt < OPEN_SYNC_INTERVAL_MS) return
        val container = (application as ApexAthleteApplication).container
        lifecycleScope.launch {
            val settings = runCatching { container.settings.settings.first() }.getOrNull() ?: return@launch
            if (!settings.onboardingDone || settings.demoMode) return@launch
            lastOpenSyncAt = now
            SyncScheduler.syncNow(applicationContext)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        splash.setKeepOnScreenCondition { !settingsLoaded }

        val container = (application as ApexAthleteApplication).container
        if (savedInstanceState == null && isPermissionsIntent(intent)) privacyRequest = true
        if (savedInstanceState == null) widgetRoute = WidgetDeepLink.routeFrom(intent)

        lifecycleScope.launch {
            // Never hold the splash if the preferences file is unreadable.
            runCatching { container.settings.settings.first() }
            settingsLoaded = true
        }

        setContent {
            val settings by container.settings.settings.collectAsStateWithLifecycle(initialValue = null)
            val loaded = settings
            val preference = when (loaded?.theme) {
                ThemeChoice.SYSTEM -> ThemePreference.SYSTEM
                ThemeChoice.LIGHT -> ThemePreference.LIGHT
                ThemeChoice.DARK, null -> ThemePreference.DARK
            }
            val systemDark = isSystemInDarkTheme()
            val dark = when (preference) {
                ThemePreference.SYSTEM -> systemDark
                ThemePreference.DARK -> true
                ThemePreference.LIGHT -> false
            }
            DisposableEffect(dark) {
                val style = if (dark) {
                    SystemBarStyle.dark(Color.TRANSPARENT)
                } else {
                    SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
                }
                enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
                onDispose { }
            }

            ApexTheme(preference) {
                val context = LocalContext.current
                val configuration = LocalConfiguration.current
                val formatter = remember(loaded?.units, loaded?.clock24h, configuration) {
                    ApexFormatter(context, loaded?.units ?: com.apex.athlete.core.data.settings.UnitSystem.METRIC, loaded?.clock24h ?: true)
                }
                CompositionLocalProvider(LocalAppContainer provides container, LocalFormatter provides formatter) {
                    if (loaded == null) {
                        Box(Modifier.fillMaxSize().background(ApexTheme.colors.background))
                    } else {
                        val dayModel = viewModel<SelectedDayViewModel>(
                            factory = viewModelFactory { initializer { SelectedDayViewModel(createSavedStateHandle()) } },
                        )
                        val saved by dayModel.epochDay.collectAsStateWithLifecycle()
                        var today by remember { mutableStateOf(LocalDate.now()) }
                        LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { today = LocalDate.now() }
                        val selected = saved?.let { LocalDate.ofEpochDay(it) } ?: today
                        ApexNavHost(
                            container = container,
                            settings = loaded,
                            selectedDay = selected,
                            onSelectedDayChange = { dayModel.select(it, today) },
                            openPrivacyRequest = privacyRequest,
                            onOpenPrivacyHandled = { privacyRequest = false },
                            openRoute = widgetRoute,
                            onOpenRouteHandled = { widgetRoute = null },
                        )
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (isPermissionsIntent(intent)) privacyRequest = true
        WidgetDeepLink.routeFrom(intent)?.let { widgetRoute = it }
    }

    private fun isPermissionsIntent(intent: Intent?): Boolean =
        intent?.action == ACTION_SHOW_PERMISSIONS_RATIONALE || intent?.action == ACTION_VIEW_PERMISSION_USAGE

    private companion object {
        const val ACTION_SHOW_PERMISSIONS_RATIONALE = "androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE"
        const val ACTION_VIEW_PERMISSION_USAGE = "android.intent.action.VIEW_PERMISSION_USAGE"
        const val OPEN_SYNC_INTERVAL_MS = 15 * 60 * 1000L

        @Volatile
        var lastOpenSyncAt = 0L
    }
}
