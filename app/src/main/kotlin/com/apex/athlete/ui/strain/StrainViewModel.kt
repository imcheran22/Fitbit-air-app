package com.apex.athlete.ui.strain

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.apex.athlete.core.data.repository.AthleteRepository
import com.apex.athlete.core.data.repository.StrainLoadState
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.onStart
import kotlinx.coroutines.flow.stateIn

/**
 * Strain detail for one day. [state] is null while loading (and while the store is not ready); the route
 * renders that as [com.apex.athlete.core.ui.state.MetricState.Loading]. Stepping the day clears it first, so
 * a number from the previous day is never shown under the new date.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class StrainViewModel(
    private val repository: AthleteRepository,
    private val handle: SavedStateHandle,
) : ViewModel() {

    private val epochDay = MutableStateFlow(handle.get<Long>(KEY_DAY) ?: repository.today())

    fun setDay(day: Long) {
        handle[KEY_DAY] = day
        epochDay.value = day
    }

    val state: StateFlow<StrainLoadState?> = epochDay
        .flatMapLatest { day -> repository.strainLoad(day).onStart { emit(null) } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    private companion object {
        const val KEY_DAY = "strain.day"
    }
}
