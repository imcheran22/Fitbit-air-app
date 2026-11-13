package com.apex.athlete.di

import android.app.Application
import com.apex.athlete.BuildConfig
import com.apex.athlete.core.data.DataGraph
import com.apex.athlete.core.data.alerts.AlertScheduler
import com.apex.athlete.core.data.alerts.AlertLedgerStore
import com.apex.athlete.core.data.coach.ask.AiKeyStore
import com.apex.athlete.core.data.coach.ask.AskApexClient
import com.apex.athlete.core.data.coach.ask.EncryptedAiKeyStore
import com.apex.athlete.core.data.diagnostics.DiagnosticsCollector
import com.apex.athlete.core.data.diagnostics.TakeoutDiagnosticsStore
import com.apex.athlete.core.data.export.DataDeletion
import com.apex.athlete.core.data.export.DataExporter
import com.apex.athlete.core.data.export.DataImporter
import com.apex.athlete.core.data.export.cancelAllWorkManagerWork
import com.apex.athlete.core.data.export.dataExporter
import com.apex.athlete.core.data.export.dataImporter
import com.apex.athlete.core.data.healthconnect.DataStoreChangeTokenStore
import com.apex.athlete.core.data.healthconnect.HealthConnectAvailability
import com.apex.athlete.core.data.healthconnect.SdkHealthConnectDataSource
import com.apex.athlete.core.data.repository.AthleteRepository
import com.apex.athlete.core.data.settings.SettingsStore
import com.apex.athlete.core.data.source.FitbitAirStatusReader
import com.apex.athlete.core.data.source.GoogleHealthApiSource
import com.apex.athlete.core.data.source.HealthConnectSource
import com.apex.athlete.core.data.store.ApexStores
import com.apex.athlete.core.data.sync.TriSourceSyncOrchestrator
import com.apex.athlete.core.data.worker.SyncRunContext
import com.apex.athlete.core.data.worker.SyncScheduler
import com.apex.athlete.core.network.GoogleHealthNetwork
import com.apex.athlete.core.network.NetworkModule
import com.apex.athlete.core.network.auth.EncryptedTokenStore
import com.apex.athlete.core.network.auth.OAuthClientType
import com.apex.athlete.core.data.extras.LocalExtras
import com.apex.athlete.ui.common.ApexFormatter
import com.apex.athlete.widget.WidgetPublisher
import com.apex.athlete.widget.WidgetSnapshotStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
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
 * Export, import and "delete all my data" are factories ([dataExporter], [dataImporter],
 * [dataDeletion]) because the stores they act on change with Demo mode and resets.
 */
class AppContainer(private val app: Application) : DataGraph {

    /** Application-lifetime scope for work that must outlive any screen (settings watchers, sign-in completion). */
    val appScope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override val settings: SettingsStore = SettingsStore(app)

    override val stores: ApexStores = ApexStores(app, settings, appScope)

    override val repository: AthleteRepository = AthleteRepository(stores, settings)

    /** The owner's own logs (behaviours, quick log, goals, food, blood pressure, breathe sessions, coach chats). */
    val localExtras: LocalExtras = LocalExtras(stores)

    /** Keystore-backed OAuth token and pending-authorization storage. */
    val tokenStore: EncryptedTokenStore = EncryptedTokenStore(app)

    private var cachedNetworkId: String? = null
    private var cachedNetwork: GoogleHealthNetwork? = null

    /** One network stack per effective client ID, so the initial value and the first settings emission share it. */
    @Synchronized
    private fun networkFor(clientId: String?): GoogleHealthNetwork {
        val cached = cachedNetwork
        if (cached != null && cachedNetworkId == clientId) return cached
        return NetworkModule.create(
            clientId, tokenStore, tokenStore,
            clientType = OAuthClientType.parse(BuildConfig.OAUTH_CLIENT_TYPE),
            applicationId = BuildConfig.APPLICATION_ID,
        ).also {
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

    /** Fitbit Air model, battery and last sync from Google Health `pairedDevices.list`: on demand, cached in memory only. */
    val airStatus: FitbitAirStatusReader = FitbitAirStatusReader(network = { googleHealth.value })

    val auth: AuthController = AuthController(app, googleHealth, tokenStore, settings, appScope)

    /** Health Connect reader (read-only), the third pull source next to Google Health. */
    val healthConnectSource: HealthConnectSource = HealthConnectSource.create(app, ZoneId.systemDefault())

    /** Reports whether Health Connect is installed, current and permitted; for the Data Sources screen and onboarding. */
    val healthConnectAvailability: HealthConnectAvailability =
        HealthConnectAvailability(SdkHealthConnectDataSource(app))

    /** Builds the redacted diagnostics report for the Data sources screen (read-only). */
    val diagnostics: DiagnosticsCollector = DiagnosticsCollector(
        context = app,
        stores = stores,
        settings = settings,
        healthConnect = healthConnectAvailability,
        healthConnectData = SdkHealthConnectDataSource(app),
        appVersion = BuildConfig.VERSION_NAME,
        buildType = BuildConfig.BUILD_TYPE,
    )

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

    /**
     * Home-screen widgets: a background publisher writes a small snapshot file (never from the demo store) and the
     * widgets read only that file. See `com.apex.athlete.widget` and `startWidgetWiring`.
     */
    val widgetPublisher: WidgetPublisher = WidgetPublisher(app, repository, settings, WidgetSnapshotStore.forContext(app))

    /** The owner's own Anthropic API key for "Ask Apex" (Keystore-encrypted, never logged). */
    val aiKeyStore: AiKeyStore = EncryptedAiKeyStore(app)

    /**
     * "Ask Apex": answers only while the AI coach is enabled in Settings and a key is stored. Sends
     * exactly the payload preview the Coach screen shows before each question.
     */
    val askApexClient: AskApexClient = AskApexClient(
        keys = aiKeyStore,
        isEnabled = { aiCoachEnabled.value },
    )

    private val aiCoachEnabled: StateFlow<Boolean> =
        settings.settings.map { it.aiCoachEnabled }.distinctUntilChanged()
            .stateIn(appScope, SharingStarted.Eagerly, false)

    /** Exporter for the real store. Throws `DemoStoreRefusedException` while Demo mode is active. */
    fun dataExporter(): DataExporter = stores.dataExporter(BuildConfig.VERSION_NAME)

    /** Importer of an Apex export into the real store (idempotent; refuses the demo store). */
    fun dataImporter(): DataImporter = stores.dataImporter()

    /**
     * "Delete all my data": stops background work, revokes Google access (best effort), clears
     * every local token, key, alert record, both stores and the settings. Nothing in Health Connect
     * or the Google account is deleted (Apex has read-only access).
     */
    fun dataDeletion(): DataDeletion = DataDeletion(
        cancelAllWork = { cancelAllWorkManagerWork(app) },
        revokeGoogleAccess = { (googleHealth.value as? GoogleHealthNetwork.Ready)?.pkce?.signOut(revokeAtGoogle = true) },
        clearGoogleTokens = { tokenStore.wipe() },
        clearHealthConnectTokens = { DataStoreChangeTokenStore(app).clearAll() },
        clearAiKey = { aiKeyStore.clear() },
        clearAlertRecord = {
            AlertLedgerStore(app).clear()
            TakeoutDiagnosticsStore(app).clear()
            widgetPublisher.clear()
        },
        resetRealStore = { stores.resetRealStore() },
        discardDemoStore = { stores.discardDemo() },
        clearSettings = { settings.clear() },
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
        startWidgetWiring()
    }

    /**
     * Keeps the widget snapshot in step with the app. Two collectors, both on [appScope]:
     *  - Leaving live data (Demo mode on, onboarding reset by "Delete all my data") removes the snapshot at once, so
     *    no widget keeps showing the owner's numbers and none ever shows demo numbers.
     *  - After every completed sync, pipeline run or import ([ApexStores.dataVersion] bumps; the sync worker also
     *    sets `lastSyncMillis`) the snapshot is republished, debounced so a burst of writes costs one publish.
     * The first emission also publishes once at process start. The publisher skips the work when no widget is installed.
     */
    @OptIn(FlowPreview::class)
    private fun startWidgetWiring() {
        appScope.launch {
            settings.settings
                .map { it.onboardingDone && !it.demoMode }
                .distinctUntilChanged()
                .collect { live -> if (!live) widgetPublisher.clear() }
        }
        appScope.launch {
            combine(
                stores.dataVersion,
                settings.settings.map { it.lastSyncMillis }.distinctUntilChanged(),
            ) { version, lastSync -> version to lastSync }
                .debounce(WIDGET_PUBLISH_DEBOUNCE_MILLIS)
                .collect { widgetPublisher.publish() }
        }
    }

    private data class WorkPlan(val live: Boolean, val backgroundSync: Boolean, val notifications: Boolean)

    private companion object {
        const val WIDGET_PUBLISH_DEBOUNCE_MILLIS = 2_000L
    }

    private fun effectiveClientId(fromSettings: String?): String? =
        fromSettings?.trim()?.takeIf { it.isNotEmpty() }
            ?: BuildConfig.GOOGLE_CLIENT_ID.takeIf { it.isNotBlank() }
}
