package com.apex.athlete.ui.journal

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.apex.athlete.core.data.repository.AthleteRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@OptIn(ExperimentalCoroutinesApi::class)
class JournalViewModel(
    private val repository: AthleteRepository,
    private val handle: SavedStateHandle,
) : ViewModel() {

    private val dayFlow = MutableStateFlow(handle.get<Long>(KEY_DAY) ?: repository.today())

    /** The stored check-in for the selected day; null while the repository has not answered. */
    val stored: StateFlow<StoredCheckIn?> = dayFlow
        .flatMapLatest { repository.dashboard(it) }
        .map { state -> state?.analysis?.let { StoredCheckIn(it.subjectiveFatigue, it.subjectiveSoreness) } }
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
            stored.collect { s ->
                if (s != null && !touched) setDraft(CheckInDraft(s.fatigue ?: 0, s.soreness ?: 0), mark = false)
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
        if (!canSave(draftState.value, stored.value) || _status.value == SaveStatus.SAVING) return
        _status.value = SaveStatus.SAVING
        val day = dayFlow.value
        viewModelScope.launch {
            _status.value = try {
                repository.saveCheckIn(day, d.fatigue, d.soreness)
                touched = false
                SaveStatus.SAVED
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                SaveStatus.ERROR
            }
        }
    }

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
