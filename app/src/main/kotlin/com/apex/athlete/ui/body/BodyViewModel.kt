package com.apex.athlete.ui.body

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.viewModelScope
import com.apex.athlete.core.data.repository.BodyState
import com.apex.athlete.core.data.repository.MetricTrend
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.ui.detail.DayLoadViewModel
import com.apex.athlete.ui.detail.trendLoadFlow
import com.apex.athlete.ui.health.TrendLoad
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

/**
 * Body detail: the day's weight, body fat and BMI ([state]) and the weight and body-fat history over the chosen range.
 * The BMI history is derived from the weight history on the screen, so it follows the same range.
 */
class BodyViewModel(
    initialDay: Long,
    private val handle: SavedStateHandle,
    loadBody: (Long) -> Flow<BodyState?>,
    loadTrend: (MetricType, Long, Int) -> Flow<MetricTrend?>,
    storeReady: Flow<Boolean>,
) : DayLoadViewModel<BodyState>(initialDay, handle, KEY_DAY, loadBody) {

    val range: StateFlow<Int> = handle.getStateFlow(KEY_RANGE, DEFAULT_BODY_RANGE).map(::sanitizeBodyRange)
        .stateIn(viewModelScope, SharingStarted.Eagerly, sanitizeBodyRange(handle.get<Int>(KEY_RANGE)))

    fun selectRange(days: Int) {
        handle[KEY_RANGE] = sanitizeBodyRange(days)
    }

    val weight: StateFlow<TrendLoad> = trendLoadFlow(day, range, flowOf(MetricType.WEIGHT), loadTrend, storeReady)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), TrendLoad.Loading)

    val bodyFat: StateFlow<TrendLoad> = trendLoadFlow(day, range, flowOf(MetricType.BODY_FAT), loadTrend, storeReady)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), TrendLoad.Loading)

    private companion object {
        const val KEY_DAY = "body.day"
        const val KEY_RANGE = "body.range"
    }
}
