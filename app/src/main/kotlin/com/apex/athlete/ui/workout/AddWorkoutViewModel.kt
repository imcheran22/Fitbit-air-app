package com.apex.athlete.ui.workout

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.apex.athlete.core.data.repository.AthleteRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

internal enum class SaveState { Idle, Saving, Saved, Failed }

/**
 * Saves one manual workout. The form's field values live in the composable (`rememberSaveable`) so they survive
 * process death; this class only owns the write and its outcome.
 */
internal class AddWorkoutViewModel(
    private val repository: AthleteRepository,
    @Suppress("unused") private val handle: SavedStateHandle,
) : ViewModel() {

    private val _saveState = MutableStateFlow(SaveState.Idle)
    val saveState: StateFlow<SaveState> = _saveState

    /** Writes a validated workout as USER_REPORTED. A second tap while saving is ignored. */
    fun save(workout: ValidWorkout) {
        if (_saveState.value == SaveState.Saving || _saveState.value == SaveState.Saved) return
        _saveState.value = SaveState.Saving
        viewModelScope.launch {
            _saveState.value = try {
                repository.addManualWorkout(
                    startMillis = workout.startMillis,
                    durationMinutes = workout.durationMinutes,
                    name = workout.name,
                    type = workout.type,
                    rpe = workout.rpe,
                )
                SaveState.Saved
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                SaveState.Failed
            }
        }
    }
}
