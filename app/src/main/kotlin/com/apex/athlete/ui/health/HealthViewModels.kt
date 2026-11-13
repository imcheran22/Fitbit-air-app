package com.apex.athlete.ui.health

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.apex.athlete.core.data.repository.AthleteRepository
import com.apex.athlete.core.data.repository.BodyState
import com.apex.athlete.core.data.repository.DailyDashboardState
import com.apex.athlete.core.data.repository.FitnessState
import com.apex.athlete.core.data.repository.MetricTrend
import com.apex.athlete.core.data.repository.StrainLoadState
import com.apex.athlete.core.data.repository.TrendIntelligenceState
import com.apex.athlete.core.data.repository.VitalsState
import com.apex.athlete.core.data.store.StoreStatus
import com.apex.athlete.core.domain.MetricType
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

private const val STOP_TIMEOUT_MS = 5_000L

/** Health tab: the monitor and the fitness card read the dashboard, the sparkline cards read the trends. */
@OptIn(ExperimentalCoroutinesApi::class)
class HealthViewModel(repository: AthleteRepository, initialDay: Long) : ViewModel() {
    private val day = MutableStateFlow(initialDay)

    fun setDay(epochDay: Long) {
        day.value = epochDay
    }

    /** Null means "not loaded yet": the screen shows skeletons. */
    val dashboard: StateFlow<DailyDashboardState?> = day
        .flatMapLatest { d -> flow<DailyDashboardState?> { emit(null); emitAll(repository.dashboard(d)) } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), null)

    val trends: StateFlow<TrendIntelligenceState?> = day
        .flatMapLatest { d -> flow<TrendIntelligenceState?> { emit(null); emitAll(repository.trends(d, SPARKLINE_DAYS)) } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), null)

    /** Weight, body fat and BMI of the selected day; null while loading. */
    val body: StateFlow<BodyState?> = day
        .flatMapLatest { d -> flow<BodyState?> { emit(null); emitAll(repository.body(d)) } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), null)

    /** The night that ended on the selected day; null while loading. */
    val vitals: StateFlow<VitalsState?> = day
        .flatMapLatest { d -> flow<VitalsState?> { emit(null); emitAll(repository.vitals(d)) } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), null)

    /** VO2 max, category and fitness age; null while loading. */
    val fitness: StateFlow<FitnessState?> = day
        .flatMapLatest { d -> flow<FitnessState?> { emit(null); emitAll(repository.fitness(d)) } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), null)
}

/** What the trend detail screen is waiting for or showing. */
sealed interface TrendLoad {
    data object Loading : TrendLoad
    /** The store is ready but holds no readings for this metric. */
    data object Empty : TrendLoad
    data class Loaded(val trend: MetricTrend, val rangeDays: Int, val endDay: Long) : TrendLoad
}

/**
 * `AthleteRepository.trend` emits null both while the store is not ready and when the metric has no
 * readings. The store status tells the two apart.
 */
fun trendLoad(trend: MetricTrend?, storeReady: Boolean, rangeDays: Int, endDay: Long): TrendLoad = when {
    trend != null -> TrendLoad.Loaded(trend, rangeDays, endDay)
    storeReady -> TrendLoad.Empty
    else -> TrendLoad.Loading
}

@OptIn(ExperimentalCoroutinesApi::class)
class TrendDetailViewModel(
    private val repository: AthleteRepository,
    private val handle: SavedStateHandle,
    private val metric: MetricType,
) : ViewModel() {

    /** The selected range survives process death. */
    val range: StateFlow<Int> = handle.getStateFlow(KEY_RANGE, DEFAULT_TREND_RANGE).map(::sanitizeRange)
        .stateIn(viewModelScope, SharingStarted.Eagerly, sanitizeRange(handle.get<Int>(KEY_RANGE)))

    fun selectRange(days: Int) {
        handle[KEY_RANGE] = sanitizeRange(days)
    }

    val state: StateFlow<TrendLoad> = range
        .flatMapLatest { days ->
            val today = repository.today()
            combine(repository.trend(metric, today, days), repository.storeStatus) { trend, status ->
                trendLoad(trend, status is StoreStatus.Ready, days, today)
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), TrendLoad.Loading)

    private companion object {
        const val KEY_RANGE = "health.trend.range"
    }
}

@OptIn(ExperimentalCoroutinesApi::class)
class HeartRateDayViewModel(repository: AthleteRepository, initialDay: Long) : ViewModel() {
    private val day = MutableStateFlow(initialDay)

    fun setDay(epochDay: Long) {
        day.value = epochDay
    }

    /** Null means "not loaded yet". */
    val state: StateFlow<StrainLoadState?> = day
        .flatMapLatest { d -> flow<StrainLoadState?> { emit(null); emitAll(repository.strainLoad(d)) } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), null)
}
