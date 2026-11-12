package com.apex.athlete.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.apex.athlete.core.data.settings.AppSettings
import com.apex.athlete.core.data.settings.SettingsStore
import com.apex.athlete.core.data.settings.ThemeChoice
import com.apex.athlete.core.data.settings.UnitSystem
import com.apex.athlete.core.data.store.ApexStores
import com.apex.athlete.di.AuthController
import com.apex.athlete.di.SignInUiState
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Reads and writes [AppSettings]. Scheduling side effects are injected so the wiring (WorkManager) stays
 * outside the ViewModel: [onAlertsChanged] starts or stops the alert jobs, [onBackgroundSyncChanged] the
 * periodic sync. [onEditAiKey] is null until the key store is wired; the key row is hidden then.
 */
class SettingsViewModel(
    private val store: SettingsStore,
    private val stores: ApexStores,
    private val auth: AuthController,
    private val onAlertsChanged: (Boolean) -> Unit,
    private val onBackgroundSyncChanged: (Boolean) -> Unit,
    val onEditAiKey: (() -> Unit)? = null,
    /** Forgets the stored AI key; called when the AI coach is switched off (the key store documents this). */
    private val clearAiKey: () -> Unit = {},
) : ViewModel() {

    /** Null until the first read from the store: render nothing editable meanwhile. */
    val settings: StateFlow<AppSettings?> = store.settings
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val signIn: StateFlow<SignInUiState> = auth.state

    private fun edit(transform: (AppSettings) -> AppSettings) {
        viewModelScope.launch { store.update(transform) }
    }

    fun setTheme(choice: ThemeChoice) = edit { it.copy(theme = choice) }
    fun setUnits(units: UnitSystem) = edit { it.copy(units = units) }
    fun setClock24h(on: Boolean) = edit { it.copy(clock24h = on) }

    /** Called with true only once the system permission (API 33+) is granted. */
    fun setNotifications(enabled: Boolean) {
        edit { it.copy(notificationsEnabled = enabled) }
        onAlertsChanged(enabled)
    }

    fun setNotifyRecovery(on: Boolean) = edit { it.copy(notifyRecovery = on) }
    fun setNotifyFatigue(on: Boolean) = edit { it.copy(notifyFatigue = on) }
    fun setNotifyStale(on: Boolean) = edit { it.copy(notifyStale = on) }
    fun setQuietStart(minuteOfDay: Int) = edit { it.copy(quietStartMinute = minuteOfDay) }
    fun setQuietEnd(minuteOfDay: Int) = edit { it.copy(quietEndMinute = minuteOfDay) }

    fun setBackgroundSync(enabled: Boolean) {
        edit { it.copy(backgroundSync = enabled) }
        onBackgroundSyncChanged(enabled)
    }

    fun setTakeoutNudgeDays(days: Int) = edit { it.copy(takeoutNudgeDays = days) }

    fun saveClientId(raw: String) {
        edit { it.copy(googleClientId = normalizeClientId(raw)) }
        // A stale mismatch message belongs to the previous ID.
        auth.dismiss()
    }

    fun setAiCoachEnabled(on: Boolean) {
        edit { it.copy(aiCoachEnabled = on) }
        // Off means off: the key is forgotten too, so nothing can be sent until the owner enters it again.
        if (!on) viewModelScope.launch(Dispatchers.IO) { runCatching { clearAiKey() } }
    }

    /**
     * Leaves Demo mode. The setting flips first so the app moves off the demo store, then the demo
     * store is thrown away (closing it while screens still read it would fail those reads).
     */
    fun turnOffDemo() {
        viewModelScope.launch {
            store.update { it.copy(demoMode = false) }
            stores.discardDemo()
        }
    }
}
