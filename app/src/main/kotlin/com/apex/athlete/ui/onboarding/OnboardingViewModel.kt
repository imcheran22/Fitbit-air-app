package com.apex.athlete.ui.onboarding

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.apex.athlete.core.analytics.strain.Sex
import com.apex.athlete.core.analytics.strain.ZoneMethod
import com.apex.athlete.core.data.healthconnect.HealthConnectStatus
import com.apex.athlete.core.data.settings.SettingsStore
import com.apex.athlete.core.data.settings.UserProfile
import com.apex.athlete.core.network.auth.AuthState
import java.time.LocalDate
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * Holds the current step and the typed profile in [SavedStateHandle] so first-run setup survives
 * process death. Settings are written only through [SettingsStore]; nothing here touches a DAO.
 */
class OnboardingViewModel(
    private val settings: SettingsStore,
    private val readHealthConnect: suspend () -> HealthConnectStatus,
    authState: Flow<AuthState>,
    private val handle: SavedStateHandle,
    private val currentYear: () -> Int = { LocalDate.now().year },
) : ViewModel() {

    val step: StateFlow<OnboardingStep> = handle.getStateFlow(KEY_STEP, OnboardingSteps.first.name)
        .map(OnboardingSteps::parse)
        .stateIn(viewModelScope, SharingStarted.Eagerly, OnboardingSteps.parse(handle[KEY_STEP]))

    private val birthYear = handle.getStateFlow(KEY_BIRTH_YEAR, "")
    private val height = handle.getStateFlow(KEY_HEIGHT, "")
    private val weight = handle.getStateFlow(KEY_WEIGHT, "")
    private val maxHr = handle.getStateFlow(KEY_MAX_HR, "")
    private val sex = handle.getStateFlow(KEY_SEX, Sex.UNSPECIFIED.name)
    private val zone = handle.getStateFlow(KEY_ZONE, ZoneMethod.PERCENT_OF_MAX_HEART_RATE.name)

    val draft: StateFlow<ProfileDraft> = combine(birthYear, height, weight, maxHr, sex, zone) { values ->
        ProfileDraft(
            birthYear = values[0],
            heightCm = values[1],
            weightKg = values[2],
            maxHeartRate = values[3],
            sex = Sex.entries.firstOrNull { it.name == values[4] } ?: Sex.UNSPECIFIED,
            zoneMethod = ZoneMethod.entries.firstOrNull { it.name == values[5] }
                ?: ZoneMethod.PERCENT_OF_MAX_HEART_RATE,
        )
    }.stateIn(viewModelScope, SharingStarted.Eagerly, ProfileDraft())

    /** Errors are shown only after the first attempt to continue, so an empty form is not shouted at. */
    val showProfileErrors: StateFlow<Boolean> = handle.getStateFlow(KEY_SHOW_ERRORS, false)

    val validation: StateFlow<ProfileValidation> = draft
        .map { ProfileRules.validate(it, currentYear()) }
        .stateIn(viewModelScope, SharingStarted.Eagerly, ProfileRules.validate(ProfileDraft(), currentYear()))

    private val takeoutChosen = handle.getStateFlow(KEY_TAKEOUT, false)
    private val _healthConnect = MutableStateFlow<HealthConnectStatus?>(null)

    /** Null until the first read finishes. */
    val healthConnect: StateFlow<HealthConnectStatus?> = _healthConnect

    private val googleConnected = authState.map { it is AuthState.SignedIn }
        .stateIn(viewModelScope, SharingStarted.Eagerly, false)

    val sources: StateFlow<SourceStatus> = combine(googleConnected, _healthConnect, takeoutChosen) { google, hc, takeout ->
        SourceStatus(googleConnected = google, healthConnectReadable = hc?.isReadable == true, takeoutChosen = takeout)
    }.stateIn(viewModelScope, SharingStarted.Eagerly, SourceStatus())

    val notificationsEnabled: StateFlow<Boolean> = settings.settings.map { it.notificationsEnabled }
        .stateIn(viewModelScope, SharingStarted.Eagerly, false)

    private var finishing = false

    fun setBirthYear(text: String) { handle[KEY_BIRTH_YEAR] = text.filter(Char::isDigit).take(4) }
    fun setHeight(text: String) { handle[KEY_HEIGHT] = text.take(6) }
    fun setWeight(text: String) { handle[KEY_WEIGHT] = text.take(6) }
    fun setMaxHeartRate(text: String) { handle[KEY_MAX_HR] = text.filter(Char::isDigit).take(3) }
    fun setSex(value: Sex) { handle[KEY_SEX] = value.name }
    fun setZoneMethod(value: ZoneMethod) { handle[KEY_ZONE] = value.name }
    fun setTakeoutChosen(chosen: Boolean) { handle[KEY_TAKEOUT] = chosen }

    /** Re-reads Health Connect: after the permission sheet, after an install, and when the screen resumes. */
    fun refreshHealthConnect() {
        viewModelScope.launch {
            _healthConnect.value = try {
                readHealthConnect()
            } catch (_: Exception) {
                null
            }
        }
    }

    fun next() {
        val current = step.value
        if (current == OnboardingStep.PROFILE) {
            val checked = validation.value
            if (!checked.isValid) {
                handle[KEY_SHOW_ERRORS] = true
                return
            }
            saveProfile(checked.values)
        }
        OnboardingSteps.next(current, validation.value.isValid, sources.value)?.let { handle[KEY_STEP] = it.name }
    }

    fun skip() {
        OnboardingSteps.skip(step.value)?.let { handle[KEY_STEP] = it.name }
    }

    /** Returns false when already on the first step (the caller then leaves the back press alone). */
    fun back(): Boolean {
        val previous = OnboardingSteps.back(step.value) ?: return false
        handle[KEY_STEP] = previous.name
        return true
    }

    /** "Explore with demo data": the host builds the demo store once these flags flip. */
    fun chooseDemo() {
        if (finishing) return
        finishing = true
        viewModelScope.launch {
            settings.update { it.copy(demoMode = true, onboardingDone = true) }
        }
    }

    fun finish() {
        if (finishing || !OnboardingSteps.canFinish(step.value)) return
        finishing = true
        viewModelScope.launch {
            settings.update { it.copy(onboardingDone = true) }
        }
    }

    /** Called with the result of the system permission dialog (or true below Android 13, where none is needed). */
    fun setNotifications(enabled: Boolean) {
        viewModelScope.launch { settings.update { it.copy(notificationsEnabled = enabled) } }
    }

    private fun saveProfile(values: ProfileValues?) {
        if (values == null) return
        viewModelScope.launch {
            settings.updateProfile(
                UserProfile(
                    birthYear = values.birthYear,
                    sex = values.sex,
                    heightCm = values.heightCm,
                    weightKg = values.weightKg,
                    maxHeartRateOverride = values.maxHeartRate,
                    zoneMethod = values.zoneMethod,
                ),
            )
        }
    }

    private companion object {
        const val KEY_STEP = "onboarding.step"
        const val KEY_BIRTH_YEAR = "onboarding.birthYear"
        const val KEY_HEIGHT = "onboarding.height"
        const val KEY_WEIGHT = "onboarding.weight"
        const val KEY_MAX_HR = "onboarding.maxHr"
        const val KEY_SEX = "onboarding.sex"
        const val KEY_ZONE = "onboarding.zone"
        const val KEY_SHOW_ERRORS = "onboarding.showErrors"
        const val KEY_TAKEOUT = "onboarding.takeout"
    }
}
