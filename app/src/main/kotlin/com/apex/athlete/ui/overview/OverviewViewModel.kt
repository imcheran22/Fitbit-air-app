package com.apex.athlete.ui.overview

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.apex.athlete.core.data.repository.ActivityDayState
import com.apex.athlete.core.data.repository.AthleteRepository
import com.apex.athlete.core.data.repository.DailyDashboardState
import com.apex.athlete.core.data.repository.StressEnergyState
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn

/** Holds no UI-only state: the day comes from the host, scroll position lives in the list state. */
@OptIn(ExperimentalCoroutinesApi::class)
class OverviewViewModel(private val repository: AthleteRepository) : ViewModel() {

    private val day = MutableStateFlow<Long?>(null)

    fun setDay(epochDay: Long) {
        day.value = epochDay
    }

    /** Null means not loaded yet (or the store is not ready): the screen shows skeletons. */
    val state: StateFlow<DailyDashboardState?> = day
        .filterNotNull()
        .distinctUntilChanged()
        .flatMapLatest { repository.dashboard(it) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    /** Stress and the energy bank of the day (estimates); null while loading. The screen ignores a result for another day. */
    val stressEnergy: StateFlow<StressEnergyState?> = day
        .filterNotNull()
        .distinctUntilChanged()
        .flatMapLatest { repository.stressEnergy(it) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    /** The day's activity totals; null while loading. The screen ignores a result for another day. */
    val activity: StateFlow<ActivityDayState?> = day
        .filterNotNull()
        .distinctUntilChanged()
        .flatMapLatest { repository.activityDay(it) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)
}
