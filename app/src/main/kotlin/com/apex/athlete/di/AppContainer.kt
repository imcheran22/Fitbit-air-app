package com.apex.athlete.di

import android.app.Application
import com.apex.athlete.BuildConfig
import com.apex.athlete.core.data.DataGraph
import com.apex.athlete.core.data.alerts.AlertScheduler
import com.apex.athlete.core.data.healthconnect.HealthConnectAvailability
import com.apex.athlete.core.data.healthconnect.SdkHealthConnectDataSource
import com.apex.athlete.core.data.repository.AthleteRepository
import com.apex.athlete.core.data.settings.SettingsStore
import com.apex.athlete.core.data.source.GoogleHealthApiSource
import com.apex.athlete.core.data.source.HealthConnectSource
import com.apex.athlete.core.data.store.ApexStores
import com.apex.athlete.core.data.sync.TriSourceSyncOrchestrator
import com.apex.athlete.core.data.worker.SyncRunContext
import com.apex.athlete.core.data.worker.SyncScheduler
import com.apex.athlete.core.network.GoogleHealthNetwork
import com.apex.athlete.core.network.NetworkModule
import com.apex.athlete.core.network.auth.EncryptedTokenStore
import com.apex.athlete.ui.common.ApexFormatter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.ZoneId

/**
 * The long-lived objects of the app, built once by [com.apex.athlete.ApexAthleteApplication].
 * Shared by screens (through `LocalAppContainer`) and by WorkManager workers (through
 * `Context.dataGraph()`, since [DataGraph] is implemented here).
 *
 * Deliberately absent for now: data export and "delete all my data". Their collaborators are wired
 * in once those components exist.
 */
class AppContainer(private val app: Application) : DataGraph {

    /** Application-lifetime scope for work that must outlive any screen (settings watchers, sign-in completion). */
    val appScope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override val settings: SettingsStore = SettingsStore(app)

    override val stores: ApexStores = ApexStores(app, settings, appScope)

    override val repository: AthleteRepository = AthleteRepository(stores, settings)

    /** Keystore-backed OAuth token and pending-authorization storage. */
    val tokenStore: EncryptedTokenStore = EncryptedTokenStore(app)

    private var cachedNetworkId: String? = null
    private var cachedNetwork: GoogleHealthNetwork? = null

    /** One network stack per effective client ID, so the initial value and the first settings emission share it. */
    @Synchronized
    private fun networkFor(clientId: String?): GoogleHealthNetwork {
        val cached = cachedNetwork
        if (cached != null && cachedNetworkId == clientId) return cached
        return NetworkModule.create(clientId, tokenStore, tokenStore).also {
            cachedNetworkId = clientId
            cachedNetwork = it
        }
    }

    /**
     * The Google Health network stack. Rebuilt when the effective client ID changes: the value the
     * owner pasted in Settings wins, otherwise the one compiled into the build; with neither it is
     * [GoogleHealthNetwork.NotConfigured].
     */
    val googleHealth: StateFlow<GoogleHealthNetwork> =
        settings.settings
            .map { effectiveClientId(it.googleClientId) }
            .distinctUntilChanged()
            .map(::networkFor)
            .stateIn(appScope, SharingStarted.Eagerly, networkFor(effectiveClientId(null)))

    val auth: AuthController = AuthController(app, googleHealth, tokenStore, settings, appScope)

    /** Health Connect reader (read-only), the third pull source next to Google Health. */
    val healthConnectSource: HealthConnectSource = HealthConnectSource.create(app, ZoneId.systemDefault())

    /** Reports whether Health Connect is installed, current and permitted; for the Data Sources screen and onboarding. */
    val healthConnectAvailability: HealthConnectAvailability =
        HealthConnectAvailability(SdkHealthConnectDataSource(app))

    override val syncOrchestrator: TriSourceSyncOrchestrator = TriSourceSyncOrchestrator(
        sources = listOf(
            GoogleHealthApiSource(
                network = { googleHealth.value },
                zone = ZoneId::systemDefault,
                priority = SyncRunContext::currentPriority,
            ),
            healthConnectSource,
        ),
        writeMutex = stores.writeMutex,
        // Intraday heart rate is read in 24 h windows; three per run keeps a run inside the
        // hourly request budget (master prompt Alert A). Later runs continue from the watermark.
        config = TriSourceSyncOrchestrator.Config(maxWindowsPerStream = 3),
    )

    /** Formatter for the current units, clock style and locale; re-emits when settings change. */
    val formatter: Flow<ApexFormatter> =
        settings.settings
            .map { ApexFormatter(app, it.units, it.clock24h) }
            .distinctUntilChanged { a, b -> a.units == b.units && a.clock24h == b.clock24h }

    /**
     * Keeps WorkManager in step with the settings: periodic sync and alerts run only after
     * onboarding, never in Demo mode (the demo store takes no live data), and only when enabled.
     */
    fun startBackgroundWiring() {
        appScope.launch {
            settings.settings
                .map { WorkPlan(it.onboardingDone && !it.demoMode, it.backgroundSync, it.notificationsEnabled) }
                .distinctUntilChanged()
                .collect { plan ->
                    SyncScheduler.schedulePeriodic(app, enabled = plan.live && plan.backgroundSync)
                    AlertScheduler.schedule(app, enabled = plan.live && plan.notifications)
                }
        }
    }

    private data class WorkPlan(val live: Boolean, val backgroundSync: Boolean, val notifications: Boolean)

    private fun effectiveClientId(fromSettings: String?): String? =
        fromSettings?.trim()?.takeIf { it.isNotEmpty() }
            ?: BuildConfig.GOOGLE_CLIENT_ID.takeIf { it.isNotBlank() }
}
