package com.apex.athlete.ui.recorder

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.apex.athlete.ble.StrapConnection
import com.apex.athlete.core.analytics.fitness.MaxHeartRate
import com.apex.athlete.core.data.repository.AthleteRepository
import com.apex.athlete.core.data.settings.SettingsStore
import com.apex.athlete.recorder.RecorderController
import com.apex.athlete.recorder.RecorderMapping
import com.apex.athlete.recorder.RecorderService
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.LocalDate

internal enum class RecorderSaveState { Idle, Saving, Failed, DemoRefused }

internal class RecorderViewModel(
    private val controller: RecorderController,
    val strap: StrapConnection,
    private val repository: AthleteRepository,
    settings: SettingsStore,
    private val sendToService: (String) -> Unit,
    private val defaultName: String,
) : ViewModel() {

    private val demo: StateFlow<Boolean> = settings.settings.map { it.demoMode }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    /** Estimated maximum heart rate for zones: the owner's value, else Tanaka from the profile age. Null if neither. */
    private val maxHr: StateFlow<Double?> = settings.profile.map { p ->
        val year = LocalDate.now().year
        MaxHeartRate.resolve(p.ageOn(year), null, p.maxHeartRateOverride?.toDouble())?.bpm
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    private val ticker: Flow<Long> = flow { while (true) { emit(controller.now()); delay(1_000) } }

    val ui: StateFlow<RecorderUi> = combine(controller.session, strap.heartRate, strap.state, ticker, demo) { s, bpm, st, now, d ->
        RecorderUiMapper.map(s, now, bpm, st, maxHr.value, d)
    }.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5_000),
        RecorderUiMapper.map(controller.session.value, controller.now(), null, strap.state.value, null, false),
    )

    private val _saveState = MutableStateFlow(RecorderSaveState.Idle)
    val saveState: StateFlow<RecorderSaveState> = _saveState

    /** Re-attaches the service when a session exists but the process was restarted. */
    fun ensureService() {
        val s = controller.session.value ?: return
        if (s.phase != com.apex.athlete.recorder.RecorderPhase.STOPPED) sendToService(RecorderService.ACTION_ENSURE)
    }

    fun start() {
        if (demo.value) { _saveState.value = RecorderSaveState.DemoRefused; return }
        _saveState.value = RecorderSaveState.Idle
        sendToService(RecorderService.ACTION_START)
    }

    fun pause() = sendToService(RecorderService.ACTION_PAUSE)
    fun resume() = sendToService(RecorderService.ACTION_RESUME)
    fun stop() = sendToService(RecorderService.ACTION_STOP)

    fun discard() {
        _saveState.value = RecorderSaveState.Idle
        controller.clear()
    }

    fun connectStrap() = strap.connect()
    fun disconnectStrap() = strap.disconnect()

    fun save(rpe: Int) {
        if (_saveState.value == RecorderSaveState.Saving) return
        if (demo.value) { _saveState.value = RecorderSaveState.DemoRefused; return }
        val session = controller.session.value ?: return
        val args = RecorderMapping.toManualWorkout(session, rpe, defaultName) ?: return
        _saveState.value = RecorderSaveState.Saving
        viewModelScope.launch {
            try {
                repository.addManualWorkout(args.startMillis, args.durationMinutes, args.name, args.type, args.rpe)
                controller.clear()
                _saveState.value = RecorderSaveState.Idle
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _saveState.value = RecorderSaveState.Failed
            }
        }
    }
}
