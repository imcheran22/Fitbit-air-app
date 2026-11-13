package com.apex.athlete.ui.trends

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.apex.athlete.core.data.repository.TrendIntelligenceState
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.ui.detail.DetailLoad
import com.apex.athlete.ui.detail.asDetailLoad
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

/**
 * The trends browser: the range and the two overlay figures live in the [SavedStateHandle], so they survive process death.
 * [initialFirst] (from the route) preselects the first figure the first time only.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class TrendsBrowserViewModel(
    initialFirst: MetricType?,
    private val handle: SavedStateHandle,
    loadTrends: (Long, Int) -> Flow<TrendIntelligenceState?>,
    today: () -> Long,
) : ViewModel() {

    init {
        if (!handle.contains(KEY_FIRST) && initialFirst != null && browsableMetric(initialFirst.storageKey) != null) {
            handle[KEY_FIRST] = initialFirst.storageKey
        }
    }

    val range: StateFlow<Int> = handle.getStateFlow(KEY_RANGE, DEFAULT_TRENDS_RANGE).map(::sanitizeTrendsRange)
        .stateIn(viewModelScope, SharingStarted.Eagerly, sanitizeTrendsRange(handle.get<Int>(KEY_RANGE)))

    val first: StateFlow<MetricType?> = handle.getStateFlow<String?>(KEY_FIRST, null).map(::browsableMetric)
        .stateIn(viewModelScope, SharingStarted.Eagerly, browsableMetric(handle.get<String>(KEY_FIRST)))

    val second: StateFlow<MetricType?> = handle.getStateFlow<String?>(KEY_SECOND, null).map(::browsableMetric)
        .stateIn(viewModelScope, SharingStarted.Eagerly, browsableMetric(handle.get<String>(KEY_SECOND)))

    fun selectRange(days: Int) {
        handle[KEY_RANGE] = sanitizeTrendsRange(days)
    }

    /** Chooses the first figure (null clears it). Choosing the figure the second slot holds clears the second slot. */
    fun selectFirst(metric: MetricType?) {
        handle[KEY_FIRST] = metric?.storageKey
        if (metric != null && metric == second.value) handle[KEY_SECOND] = null as String?
    }

    /** Chooses the second figure (null clears it). The same figure as the first is ignored. */
    fun selectSecond(metric: MetricType?) {
        if (metric != null && metric == first.value) return
        handle[KEY_SECOND] = metric?.storageKey
    }

    val state: StateFlow<DetailLoad<TrendIntelligenceState>> = range
        .flatMapLatest { days -> loadTrends(today(), days).asDetailLoad() }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), DetailLoad.Loading)

    private companion object {
        const val KEY_RANGE = "trends.range"
        const val KEY_FIRST = "trends.first"
        const val KEY_SECOND = "trends.second"
    }
}
