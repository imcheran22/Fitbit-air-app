package com.apex.athlete.ui.recovery

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.apex.athlete.core.data.repository.AthleteRepository
import com.apex.athlete.core.data.repository.RecoveryDetailState
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onStart
import kotlinx.coroutines.flow.stateIn

/** What the screen is waiting for, showing, or could not read. A read error never shows as a number. */
sealed interface RecoveryLoad {
    data object Loading : RecoveryLoad
    data class Ready(val detail: RecoveryDetailState) : RecoveryLoad
    data object Failed : RecoveryLoad
}

@OptIn(ExperimentalCoroutinesApi::class)
class RecoveryViewModel(
    private val repository: AthleteRepository,
    private val handle: SavedStateHandle,
) : ViewModel() {

    private val day = MutableStateFlow(handle.get<Long>(KEY_DAY) ?: repository.today())

    /** Epoch day of the day shown; the route calls this whenever its `day` parameter changes. */
    fun setDay(epochDay: Long) {
        handle[KEY_DAY] = epochDay
        day.value = epochDay
    }

    val state: StateFlow<RecoveryLoad> = day
        .flatMapLatest { d ->
            repository.recoveryDetail(d)
                .map<RecoveryDetailState?, RecoveryLoad> { it?.let(RecoveryLoad::Ready) ?: RecoveryLoad.Loading }
                .onStart { emit(RecoveryLoad.Loading) }
                .catch { emit(RecoveryLoad.Failed) }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), RecoveryLoad.Loading)

    private companion object {
        const val KEY_DAY = "recovery_day"
    }
}
