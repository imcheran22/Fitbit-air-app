package com.apex.athlete.ui.journal

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.apex.athlete.core.data.repository.AthleteRepository
import com.apex.athlete.core.data.repository.JournalState
import com.apex.athlete.core.domain.MetricType
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The journal factors of one day and the associations built from them. Each tap on a factor is saved at once through
 * `saveJournalFactors(day, mapOf(factor to value))`; "Not logged" saves null, which removes the stored value. The tapped
 * choice shows immediately ([pending]) and is dropped as soon as the stored value matches, or when the save fails.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class JournalFactorsViewModel internal constructor(
    initialDay: Long,
    private val load: (Long) -> Flow<JournalState?>,
    private val persist: suspend (Long, Map<MetricType, Boolean?>) -> Unit,
    private val handle: SavedStateHandle,
) : ViewModel() {

    constructor(repository: AthleteRepository, handle: SavedStateHandle) : this(
        initialDay = handle.get<Long>(KEY_DAY) ?: repository.today(),
        load = { day -> repository.journal(day) },
        persist = { day, factors -> repository.saveJournalFactors(day, factors) },
        handle = handle,
    )

    private val dayFlow = MutableStateFlow(handle.get<Long>(KEY_DAY) ?: initialDay)

    private val keyed: StateFlow<JournalState?> = dayFlow
        .flatMapLatest { day -> load(day) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    /** The journal of the selected day; null while loading, and never the previous day's value after a day change. */
    val journal: StateFlow<JournalState?> = combine(keyed, dayFlow) { s, day -> s?.takeIf { it.epochDay == day } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    private val pendingState = MutableStateFlow<Map<MetricType, Boolean?>>(emptyMap())

    /** Choices tapped but not yet confirmed by the store. A null value means "clear". */
    val pending: StateFlow<Map<MetricType, Boolean?>> = pendingState.asStateFlow()

    private val _status = MutableStateFlow(SaveStatus.IDLE)
    val status: StateFlow<SaveStatus> = _status.asStateFlow()

    init {
        viewModelScope.launch {
            keyed.collect { s ->
                if (s != null && s.epochDay == dayFlow.value) {
                    pendingState.update { p -> p.filter { (factor, value) -> s.factors[factor] != value } }
                }
            }
        }
    }

    fun setDay(epochDay: Long) {
        if (dayFlow.value == epochDay) return
        handle[KEY_DAY] = epochDay
        pendingState.value = emptyMap()
        _status.value = SaveStatus.IDLE
        dayFlow.value = epochDay
    }

    /** Saves [choice] for [factor]. Ignored while the day is loading, for a factor the journal does not know, or when nothing changes. */
    fun select(factor: MetricType, choice: FactorChoice) {
        if (factor !in JOURNAL_FACTORS) return
        val day = dayFlow.value
        val stored = keyed.value?.takeIf { it.epochDay == day } ?: return
        val value = choice.value
        val shown = if (pendingState.value.containsKey(factor)) pendingState.value[factor] else stored.factors[factor]
        if (shown == value) return
        pendingState.update { it + (factor to value) }
        _status.value = SaveStatus.SAVING
        viewModelScope.launch {
            try {
                persist(day, mapOf(factor to value))
                if (dayFlow.value == day) _status.value = SaveStatus.SAVED
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                pendingState.update { it - factor }
                if (dayFlow.value == day) _status.value = SaveStatus.ERROR
            }
        }
    }

    private companion object {
        const val KEY_DAY = "journal_factors_day"
    }
}
