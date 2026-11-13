package com.apex.athlete.ui.workout

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.apex.athlete.core.data.repository.AthleteRepository
import com.apex.athlete.core.data.repository.WorkoutDetailState as RepoWorkoutDetail
import com.apex.athlete.core.data.store.StoreStatus
import com.apex.athlete.core.database.entity.WorkoutEntity
import com.apex.athlete.core.domain.DataProvenance
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

internal sealed interface WorkoutDetailState {
    data object Loading : WorkoutDetailState
    data object NotFound : WorkoutDetailState
    /** [detail] carries heart-rate recovery, zone minutes and minute heart rate; null in previews. */
    data class Found(val workout: WorkoutEntity, val detail: RepoWorkoutDetail? = null) : WorkoutDetailState
}

internal enum class DeleteState { Idle, Deleting, Done, Failed }

/** True only for workouts the owner typed in. Recorded and imported workouts are never deletable from here. */
internal fun canDelete(workout: WorkoutEntity): Boolean = workout.provenance == DataProvenance.USER_REPORTED

internal class WorkoutDetailViewModel(
    private val repository: AthleteRepository,
    @Suppress("unused") private val handle: SavedStateHandle,
    private val workoutId: String,
) : ViewModel() {

    /**
     * The repository emits null both while the store is not ready and when the id does not exist, so a null is
     * only "not found" once the store reports Ready.
     */
    val state: StateFlow<WorkoutDetailState> =
        combine(repository.storeStatus, repository.workoutDetail(workoutId)) { status, detail ->
            when {
                detail != null -> WorkoutDetailState.Found(detail.workout, detail)
                status is StoreStatus.Ready -> WorkoutDetailState.NotFound
                else -> WorkoutDetailState.Loading
            }
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), WorkoutDetailState.Loading)

    private val _deleteState = MutableStateFlow(DeleteState.Idle)
    val deleteState: StateFlow<DeleteState> = _deleteState

    /** Deletes the workout after the screen confirmed it. Ignored unless it is [DataProvenance.USER_REPORTED]. */
    fun delete() {
        val workout = (state.value as? WorkoutDetailState.Found)?.workout ?: return
        if (!canDelete(workout) || _deleteState.value == DeleteState.Deleting) return
        _deleteState.value = DeleteState.Deleting
        viewModelScope.launch {
            _deleteState.value = try {
                repository.deleteWorkout(workout.id)
                DeleteState.Done
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                DeleteState.Failed
            }
        }
    }
}
