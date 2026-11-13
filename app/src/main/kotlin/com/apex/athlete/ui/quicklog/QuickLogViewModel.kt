package com.apex.athlete.ui.quicklog

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.apex.athlete.core.data.extras.LocalExtras
import com.apex.athlete.core.database.entity.QuickLogEntity
import com.apex.athlete.core.database.entity.QuickLogKind
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.state.MetricState
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * The quick-log sheet for today: water, mood (1 to 5), symptoms and one note. The draft survives process death.
 * Today is fixed when the sheet opens.
 */
class QuickLogViewModel internal constructor(
    todayEntries: Flow<List<QuickLogEntity>>,
    waterMlToday: Flow<Double?>,
    private val write: suspend (QuickLogAction) -> Unit,
    private val remove: suspend (String) -> Unit,
    private val handle: SavedStateHandle,
) : ViewModel() {

    constructor(extras: LocalExtras, today: Long, handle: SavedStateHandle) : this(
        todayEntries = extras.quickLog.observeDay(today),
        waterMlToday = extras.quickLog.observeWaterMl(today),
        write = { action ->
            when (action) {
                is QuickLogAction.Water -> extras.quickLog.addWater(action.ml.toDouble())
                is QuickLogAction.Mood -> extras.quickLog.add(QuickLogKind.MOOD, numericValue = action.value.toDouble())
                is QuickLogAction.SymptomEntry -> extras.quickLog.add(QuickLogKind.SYMPTOM, label = action.key)
                is QuickLogAction.Note -> extras.quickLog.add(QuickLogKind.NOTE, text = action.text)
            }
        },
        remove = { id -> extras.quickLog.delete(id) },
        handle = handle,
    )

    /** Null while loading. */
    val entries: StateFlow<List<QuickLogEntryUi>?> = todayEntries
        .map { list -> list.mapNotNull(::toEntryUi) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    /** Today's water through the shared metric states: a value, or `--` when none is logged. */
    val water: StateFlow<MetricState> = waterMlToday
        .map { ml ->
            if (ml != null && ml.isFinite() && ml > 0) {
                MetricState.Value(ml, 0, "ml", DataProvenance.USER_REPORTED)
            } else {
                MetricState.Unavailable()
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), MetricState.Loading)

    private val _draft = MutableStateFlow(readDraft())
    val draft: StateFlow<QuickLogDraft> = _draft.asStateFlow()

    private val _outcome = MutableStateFlow(WriteOutcome.IDLE)
    val outcome: StateFlow<WriteOutcome> = _outcome.asStateFlow()

    private fun readDraft() = QuickLogDraft(
        water = handle.get<String>(KEY_WATER).orEmpty(),
        mood = handle.get<Int>(KEY_MOOD)?.takeIf { it > 0 },
        symptoms = handle.get<ArrayList<String>>(KEY_SYMPTOMS)?.toSet().orEmpty(),
        note = handle.get<String>(KEY_NOTE).orEmpty(),
    )

    private fun setDraft(d: QuickLogDraft) {
        handle[KEY_WATER] = d.water
        handle[KEY_MOOD] = d.mood ?: 0
        handle[KEY_SYMPTOMS] = ArrayList(d.symptoms)
        handle[KEY_NOTE] = d.note
        _draft.value = d
        if (_outcome.value != WriteOutcome.SAVING) _outcome.value = WriteOutcome.IDLE
    }

    fun setWater(raw: String) = setDraft(_draft.value.copy(water = QuickLogForm.sanitizeWater(raw)))

    /** Tapping the chosen mood again clears it. */
    fun toggleMood(value: Int) = setDraft(_draft.value.copy(mood = if (_draft.value.mood == value) null else value))

    fun toggleSymptom(key: String, selected: Boolean) {
        val d = _draft.value
        setDraft(d.copy(symptoms = if (selected) d.symptoms + key else d.symptoms - key))
    }

    fun setNote(raw: String) = setDraft(_draft.value.copy(note = QuickLogForm.capNote(raw)))

    fun plan(): QuickLogPlan = QuickLogForm.plan(_draft.value)

    fun save() {
        val plan = plan()
        if (!plan.canSave || _outcome.value == WriteOutcome.SAVING) return
        _outcome.value = WriteOutcome.SAVING
        viewModelScope.launch {
            var failure: WriteOutcome? = null
            for (action in plan.actions) {
                val result = runExtrasWrite { write(action) }
                if (result != WriteOutcome.SAVED) {
                    failure = result
                    break
                }
                // Drop what was saved from the draft at once: a retry after a later failure must not repeat it.
                setDraft(QuickLogForm.without(_draft.value, action))
            }
            _outcome.value = failure ?: WriteOutcome.SAVED
        }
    }

    fun delete(id: String) {
        viewModelScope.launch { _outcome.value = runExtrasWrite { remove(id) } }
    }

    private companion object {
        const val KEY_WATER = "quicklog.water"
        const val KEY_MOOD = "quicklog.mood"
        const val KEY_SYMPTOMS = "quicklog.symptoms"
        const val KEY_NOTE = "quicklog.note"
    }
}
