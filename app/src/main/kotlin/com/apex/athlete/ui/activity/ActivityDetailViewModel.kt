package com.apex.athlete.ui.activity

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.viewModelScope
import com.apex.athlete.core.data.repository.ActivityDayState
import com.apex.athlete.core.data.repository.MetricTrend
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.ui.detail.DayLoadViewModel
import com.apex.athlete.ui.health.TrendLoad
import com.apex.athlete.ui.detail.trendLoadFlow
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

/**
 * Activity detail: the day's totals ([state]) and a history of one chosen figure over a chosen range ([chart]). The chosen
 * figure and range survive process death; the day is owned by the route (the date pill).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ActivityDetailViewModel(
    initialDay: Long,
    private val handle: SavedStateHandle,
    loadDay: (Long) -> Flow<ActivityDayState?>,
    loadTrend: (MetricType, Long, Int) -> Flow<MetricTrend?>,
    storeReady: Flow<Boolean>,
) : DayLoadViewModel<ActivityDayState>(initialDay, handle, KEY_DAY, loadDay) {

    val range: StateFlow<Int> = handle.getStateFlow(KEY_RANGE, DEFAULT_ACTIVITY_RANGE).map(::sanitizeActivityRange)
        .stateIn(viewModelScope, SharingStarted.Eagerly, sanitizeActivityRange(handle.get<Int>(KEY_RANGE)))

    val metric: StateFlow<MetricType> = handle.getStateFlow(KEY_METRIC, MetricType.STEPS.storageKey).map(::activityChartMetric)
        .stateIn(viewModelScope, SharingStarted.Eagerly, activityChartMetric(handle.get<String>(KEY_METRIC)))

    fun selectRange(days: Int) {
        handle[KEY_RANGE] = sanitizeActivityRange(days)
    }

    fun selectMetric(metric: MetricType) {
        handle[KEY_METRIC] = activityChartMetric(metric.storageKey).storageKey
    }

    val chart: StateFlow<TrendLoad> = trendLoadFlow(day, range, metric, loadTrend, storeReady)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), TrendLoad.Loading)

    private companion object {
        const val KEY_DAY = "activity.day"
        const val KEY_RANGE = "activity.range"
        const val KEY_METRIC = "activity.metric"
    }
}
