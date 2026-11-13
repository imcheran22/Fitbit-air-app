package com.apex.athlete.ui.monitor

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.viewModelScope
import com.apex.athlete.core.data.repository.DailyDashboardState
import com.apex.athlete.core.data.repository.TrendIntelligenceState
import com.apex.athlete.core.data.repository.VitalsState
import com.apex.athlete.ui.detail.DayLoadViewModel
import com.apex.athlete.ui.detail.DetailLoad
import com.apex.athlete.ui.detail.loadPerDay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn

/**
 * The monitor reads three things for the same day and loads each on its own: the dashboard (the five main readings, state
 * in [state]), the night's vitals and the 30 day ranges. A late range never blocks a reading.
 */
class MonitorViewModel(
    initialDay: Long,
    handle: SavedStateHandle,
    loadDashboard: (Long) -> Flow<DailyDashboardState?>,
    loadVitals: (Long) -> Flow<VitalsState?>,
    loadTrends: (Long, Int) -> Flow<TrendIntelligenceState?>,
) : DayLoadViewModel<DailyDashboardState>(initialDay, handle, "monitor.day", loadDashboard) {

    val vitals: StateFlow<DetailLoad<VitalsState>> = day.loadPerDay(loadVitals)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), DetailLoad.Loading)

    val trends: StateFlow<DetailLoad<TrendIntelligenceState>> = day.loadPerDay { d -> loadTrends(d, MONITOR_BASELINE_DAYS) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), DetailLoad.Loading)
}
