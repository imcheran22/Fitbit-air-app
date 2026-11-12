package com.apex.athlete.ui.sleep

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.apex.athlete.core.data.repository.AthleteRepository
import com.apex.athlete.core.data.repository.SleepDetailState
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
sealed interface SleepLoad {
    data object Loading : SleepLoad
    data class Ready(val detail: SleepDetailState) : SleepLoad
    data object Failed : SleepLoad
}

@OptIn(ExperimentalCoroutinesApi::class)
class SleepViewModel(
    private val repository: AthleteRepository,
    private val handle: SavedStateHandle,
) : ViewModel() {

    private val day = MutableStateFlow(handle.get<Long>(KEY_DAY) ?: repository.today())

    /** Epoch day of the wake day shown; the route calls this whenever its `day` parameter changes. */
    fun setDay(epochDay: Long) {
        handle[KEY_DAY] = epochDay
        day.value = epochDay
    }

    val state: StateFlow<SleepLoad> = day
        .flatMapLatest { d ->
            repository.sleepDetail(d)
                .map<SleepDetailState?, SleepLoad> { it?.let(SleepLoad::Ready) ?: SleepLoad.Loading }
                .onStart { emit(SleepLoad.Loading) }
                .catch { emit(SleepLoad.Failed) }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SleepLoad.Loading)

    private companion object {
        const val KEY_DAY = "sleep_day"
    }
}
