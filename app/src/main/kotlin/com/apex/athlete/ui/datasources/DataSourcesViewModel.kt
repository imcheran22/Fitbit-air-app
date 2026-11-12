package com.apex.athlete.ui.datasources

import android.app.Activity
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.apex.athlete.core.data.healthconnect.HealthConnectAvailability
import com.apex.athlete.core.data.healthconnect.HealthConnectStatus
import com.apex.athlete.core.data.repository.AthleteRepository
import com.apex.athlete.core.data.settings.SettingsStore
import com.apex.athlete.core.data.worker.SyncRunState
import com.apex.athlete.core.network.GoogleHealthNetwork
import com.apex.athlete.core.network.auth.AuthState
import com.apex.athlete.core.network.rate.RateLimitState
import com.apex.athlete.di.AuthController
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onStart
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * Feeds the Data Sources screen. Reads only the repository, the settings, the auth controller, the
 * Health Connect availability check and the sync observer; never a DAO or an engine. UI-only state
 * (the open confirmation) lives in the composable's rememberSaveable.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class DataSourcesViewModel(
    repository: AthleteRepository,
    settings: SettingsStore,
    private val auth: AuthController,
    googleHealth: StateFlow<GoogleHealthNetwork>,
    private val healthConnect: HealthConnectAvailability,
    syncRun: Flow<SyncRunState>,
    @Suppress("UNUSED_PARAMETER") handle: SavedStateHandle,
    private val nowMillis: () -> Long = System::currentTimeMillis,
) : ViewModel() {

    private val healthConnectStatus = MutableStateFlow<HealthConnectStatus?>(null)

    private val google: Flow<GoogleCardModel> = combine(
        auth.authState.map<AuthState, AuthState?> { it }.onStart { emit(null) },
        auth.state,
        googleHealth,
    ) { authState, signIn, network ->
        googleCardModel(network is GoogleHealthNetwork.Ready, authState, signIn)
    }

    private val rate: Flow<RateLimitState?> = googleHealth.flatMapLatest { network ->
        (network as? GoogleHealthNetwork.Ready)?.rateLimiter?.state ?: flowOf(null)
    }

    private val ticker: Flow<Long> = flow {
        while (true) {
            emit(nowMillis())
            delay(TICK_MILLIS)
        }
    }

    private data class Head(
        val settings: com.apex.athlete.core.data.settings.AppSettings,
        val sources: com.apex.athlete.core.data.repository.DataSourcesState?,
        val google: GoogleCardModel,
        val rate: RateLimitState?,
        val hc: HealthConnectStatus?,
    )

    private val head: Flow<Head> = combine(
        settings.settings,
        repository.dataSources(),
        google,
        rate,
        healthConnectStatus,
    ) { s, ds, g, r, hc -> Head(s, ds, g, r, hc) }

    val state: StateFlow<DataSourcesUiState?> = combine(
        head,
        syncRun.map<SyncRunState, SyncRunState?> { it }.onStart { emit(null) },
        ticker,
    ) { h, run, now ->
        val demo = h.settings.demoMode || h.sources?.isDemo == true
        DataSourcesUiState(
            nowMillis = now,
            demo = demo,
            google = h.google,
            rateLimit = h.rate?.let { rateLimitUi(it, now) },
            healthConnect = h.hc?.let(::healthConnectUi),
            sync = syncUi(run, h.settings.lastSyncMillis, demo),
            sections = h.sources?.let { watermarkSections(it.watermarks) },
            counts = h.sources?.let(::countRows),
            earliestDay = h.sources?.earliestDay,
            takeout = takeoutUi(h.settings, demo, now),
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    /** The permission list the dialog should ask for, from the last check. */
    fun permissionRequest(): Set<String> = healthConnectStatus.value?.toRequest().orEmpty()

    /** Called on every resume and after the permission dialog closes. */
    fun refreshHealthConnect() {
        viewModelScope.launch { healthConnectStatus.value = healthConnect.status() }
    }

    fun connect(activity: Activity) = auth.begin(activity)

    fun disconnect() = auth.signOut()

    fun dismissSignInNotice() = auth.dismiss()

    private companion object {
        const val TICK_MILLIS = 15_000L
    }
}
