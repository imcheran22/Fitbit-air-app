package com.apex.athlete.ui.profile

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.apex.athlete.core.analytics.strain.Sex
import com.apex.athlete.core.data.settings.SettingsStore
import com.apex.athlete.core.data.settings.UnitSystem
import com.apex.athlete.core.data.settings.UserProfile
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** What is stored and the units to show it in. */
data class StoredProfile(val profile: UserProfile, val units: UnitSystem)

enum class ProfileSaveStatus { IDLE, SAVED, ERROR }

class ProfileViewModel(
    private val settings: SettingsStore,
    private val handle: SavedStateHandle,
    /** Recomputes the stored history (the repository does this off the main thread, under the write mutex). */
    private val recompute: suspend () -> Unit = {},
) : ViewModel() {

    val stored: StateFlow<StoredProfile?> = combine(
        settings.profile,
        settings.settings.map { it.units }.distinctUntilChanged(),
    ) { p, u -> StoredProfile(p, u) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    private val inputState = MutableStateFlow(readInput())

    /** The edited text; null until the stored profile has been read once. Survives process death. */
    val input: StateFlow<ProfileInput?> = inputState.asStateFlow()

    private val statusState = MutableStateFlow(ProfileSaveStatus.IDLE)
    val status: StateFlow<ProfileSaveStatus> = statusState.asStateFlow()

    init {
        if (inputState.value == null) {
            viewModelScope.launch {
                val s = stored.filterNotNull().first()
                if (inputState.value == null) write(ProfileInput.from(s.profile, s.units))
            }
        }
    }

    fun edit(transform: (ProfileInput) -> ProfileInput) {
        val current = inputState.value ?: return
        statusState.value = ProfileSaveStatus.IDLE
        write(transform(current))
    }

    fun save(currentYear: Int) {
        val s = stored.value ?: return
        val i = inputState.value ?: return
        val profile = evaluateProfile(s.profile, i, s.units, currentYear).profile ?: return
        viewModelScope.launch {
            statusState.value = try {
                settings.updateProfile(profile)
                if (profileChangeNeedsRecompute(s.profile, profile)) {
                    // The profile is saved either way; a failed recompute is retried by the next full recompute.
                    try { recompute() } catch (e: CancellationException) { throw e } catch (e: Exception) { /* kept stale until next recompute */ }
                }
                ProfileSaveStatus.SAVED
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                ProfileSaveStatus.ERROR
            }
        }
    }

    private fun write(i: ProfileInput) {
        handle[K_INIT] = true
        handle[K_BIRTH] = i.birthYear
        handle[K_SEX] = i.sex.name
        handle[K_HEIGHT] = i.height
        handle[K_WEIGHT] = i.weight
        handle[K_MAXHR] = i.maxHeartRate
        inputState.value = i
    }

    private fun readInput(): ProfileInput? {
        if (handle.get<Boolean>(K_INIT) != true) return null
        return ProfileInput(
            birthYear = handle.get<String>(K_BIRTH).orEmpty(),
            sex = handle.get<String>(K_SEX)?.let { n -> Sex.entries.firstOrNull { it.name == n } } ?: Sex.UNSPECIFIED,
            height = handle.get<String>(K_HEIGHT).orEmpty(),
            weight = handle.get<String>(K_WEIGHT).orEmpty(),
            maxHeartRate = handle.get<String>(K_MAXHR).orEmpty(),
        )
    }

    private companion object {
        const val K_INIT = "init"
        const val K_BIRTH = "birth"
        const val K_SEX = "sex"
        const val K_HEIGHT = "height"
        const val K_WEIGHT = "weight"
        const val K_MAXHR = "maxhr"
    }
}
