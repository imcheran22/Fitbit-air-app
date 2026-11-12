package com.apex.athlete.ui.journal

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.apex.athlete.core.data.repository.AthleteRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** A loaded check-in tagged with its day, so two days with equal ratings still produce two distinct states. */
internal data class DayCheckIn(val day: Long, val checkIn: StoredCheckIn)

@OptIn(ExperimentalCoroutinesApi::class)
class JournalViewModel internal constructor(
    initialDay: Long,
    private val load: (Long) -> Flow<StoredCheckIn?>,
    private val persist: suspend (Long, Int?, Int?) -> Unit,
    private val handle: SavedStateHandle,
) : ViewModel() {

    constructor(repository: AthleteRepository, handle: SavedStateHandle) : this(
        initialDay = handle.get<Long>(KEY_DAY) ?: repository.today(),
        load = { day -> repository.dashboard(day).map { s -> s?.analysis?.let { StoredCheckIn(it.subjectiveFatigue, it.subjectiveSoreness) } } },
        persist = { day, f, s -> repository.saveCheckIn(day, f, s) },
        handle = handle,
    )

    private val dayFlow = MutableStateFlow(handle.get<Long>(KEY_DAY) ?: initialDay)

    /** Loaded check-in keyed by its day; null while the repository has not answered for the current day. */
    private val keyed: StateFlow<DayCheckIn?> = dayFlow
        .flatMapLatest { day -> load(day).map { c -> c?.let { DayCheckIn(day, it) } } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    /**
     * The stored check-in for the selected day; null while it is loading. It is null right after a day change
     * (never the previous day's value), so a stale value cannot enable a Save of the wrong day.
     */
    val stored: StateFlow<StoredCheckIn?> = combine(keyed, dayFlow) { k, day -> k?.takeIf { it.day == day }?.checkIn }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    private val draftState = MutableStateFlow(
        CheckInDraft(handle.get<Int>(KEY_DRAFT_F) ?: 0, handle.get<Int>(KEY_DRAFT_S) ?: 0),
    )
    val draft: StateFlow<CheckInDraft> = draftState.asStateFlow()

    private val _status = MutableStateFlow(SaveStatus.IDLE)
    val status: StateFlow<SaveStatus> = _status.asStateFlow()

    private var touched: Boolean
        get() = handle.get<Boolean>(KEY_TOUCHED) ?: false
        set(value) { handle[KEY_TOUCHED] = value }

    init {
        // Seed the draft from the stored check-in until the person changes something.
        viewModelScope.launch {
            // Collect the day-keyed state, not `stored`: equal ratings on two days must still re-seed the draft.
            keyed.collect { k ->
                if (k != null && k.day == dayFlow.value && !touched) {
                    setDraft(CheckInDraft(k.checkIn.fatigue ?: 0, k.checkIn.soreness ?: 0), mark = false)
                }
            }
        }
    }

    fun setDay(epochDay: Long) {
        if (dayFlow.value == epochDay) return
        handle[KEY_DAY] = epochDay
        touched = false
        _status.value = SaveStatus.IDLE
        setDraft(CheckInDraft(), mark = false)
        dayFlow.value = epochDay
    }

    fun pick(scale: CheckInScale, level: Int) {
        val d = draftState.value
        val next = when (scale) {
            CheckInScale.FATIGUE -> d.copy(fatigue = toggleLevel(d.fatigue, level))
            CheckInScale.SORENESS -> d.copy(soreness = toggleLevel(d.soreness, level))
        }
        _status.value = SaveStatus.IDLE
        setDraft(next, mark = true)
    }

    fun save() {
        val d = draftState.value.toStored()
        if (!canSave(draftState.value, currentStored()) || _status.value == SaveStatus.SAVING) return
        _status.value = SaveStatus.SAVING
        val day = dayFlow.value
        viewModelScope.launch {
            _status.value = try {
                persist(day, d.fatigue, d.soreness)
                touched = false
                SaveStatus.SAVED
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                SaveStatus.ERROR
            }
        }
    }

    private fun currentStored(): StoredCheckIn? = keyed.value?.takeIf { it.day == dayFlow.value }?.checkIn

    private fun setDraft(d: CheckInDraft, mark: Boolean) {
        handle[KEY_DRAFT_F] = d.fatigue
        handle[KEY_DRAFT_S] = d.soreness
        if (mark) touched = true
        draftState.value = d
    }

    private companion object {
        const val KEY_DAY = "day"
        const val KEY_DRAFT_F = "draft_fatigue"
        const val KEY_DRAFT_S = "draft_soreness"
        const val KEY_TOUCHED = "touched"
    }
}
