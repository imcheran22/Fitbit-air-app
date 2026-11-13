package com.apex.athlete.ui.detail

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.apex.athlete.core.data.repository.MetricTrend
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.ui.health.TrendLoad
import com.apex.athlete.ui.health.trendLoad
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onStart
import kotlinx.coroutines.flow.stateIn

/**
 * What a detail screen is waiting for, showing, or could not read. A repository state of null means "store not ready":
 * the screen shows skeletons. A read error is [Failed] and never shows as a number.
 */
sealed interface DetailLoad<out T> {
    data object Loading : DetailLoad<Nothing>
    data class Ready<T>(val value: T) : DetailLoad<T>
    data object Failed : DetailLoad<Nothing>
}

/** The value when [Ready], else null. */
fun <T> DetailLoad<T>.readyOrNull(): T? = (this as? DetailLoad.Ready<T>)?.value

/** null -> [DetailLoad.Loading], a value -> [DetailLoad.Ready], an exception -> [DetailLoad.Failed]; starts with Loading. */
fun <T : Any> Flow<T?>.asDetailLoad(): Flow<DetailLoad<T>> =
    map<T?, DetailLoad<T>> { value -> if (value == null) DetailLoad.Loading else DetailLoad.Ready(value) }
        .onStart { emit(DetailLoad.Loading) }
        .catch { emit(DetailLoad.Failed) }

/** Follows the epoch-day flow with [load]; the previous day's result is dropped at once (Loading) so no day shows another day's number. */
@OptIn(ExperimentalCoroutinesApi::class)
fun <T : Any> Flow<Long>.loadPerDay(load: (Long) -> Flow<T?>): Flow<DetailLoad<T>> =
    flatMapLatest { day -> load(day).asDetailLoad() }

/** A selected epoch day that survives process death through a [SavedStateHandle]. */
class DayHolder(private val handle: SavedStateHandle, private val key: String, initial: Long) {
    private val state = MutableStateFlow(handle.get<Long>(key) ?: initial)
    val day: StateFlow<Long> get() = state

    fun set(epochDay: Long) {
        handle[key] = epochDay
        state.value = epochDay
    }
}

private const val STOP_TIMEOUT_MS = 5_000L

/**
 * The ViewModel of a screen that shows one repository state for one day. The route calls [setDay] whenever its day changes
 * (the date pill); [load] is injected so a test can feed any flow.
 */
open class DayLoadViewModel<T : Any>(
    initialDay: Long,
    handle: SavedStateHandle,
    key: String,
    load: (Long) -> Flow<T?>,
) : ViewModel() {
    private val holder = DayHolder(handle, key, initialDay)

    val day: StateFlow<Long> get() = holder.day

    fun setDay(epochDay: Long) = holder.set(epochDay)

    val state: StateFlow<DetailLoad<T>> = holder.day.loadPerDay(load)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), DetailLoad.Loading)
}

/**
 * The history of [metric] ending on the selected day, over the selected range, as the trend screens' load state. The repository
 * emits null both while the store is not ready and when the metric has no readings; [storeReady] tells the two apart.
 */
@OptIn(ExperimentalCoroutinesApi::class)
fun trendLoadFlow(
    day: Flow<Long>,
    range: Flow<Int>,
    metric: Flow<MetricType>,
    loadTrend: (MetricType, Long, Int) -> Flow<MetricTrend?>,
    storeReady: Flow<Boolean>,
): Flow<TrendLoad> =
    combine(day, range, metric) { d, r, m -> Triple(d, r, m) }
        .flatMapLatest { (d, r, m) ->
            combine(loadTrend(m, d, r), storeReady) { trend, ready -> trendLoad(trend, ready, r, d) }
        }
