package com.apex.athlete.ui.bloodpressure

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.apex.athlete.core.data.extras.LocalExtras
import com.apex.athlete.core.database.entity.BloodPressureReadingEntity
import com.apex.athlete.ui.quicklog.WriteOutcome
import com.apex.athlete.ui.quicklog.runExtrasWrite
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** Manual blood pressure entry and history. The unsent form survives process death. */
class BloodPressureViewModel internal constructor(
    readings: Flow<List<BloodPressureReadingEntity>>,
    nowMillis: () -> Long,
    private val insert: suspend (ParsedBp) -> Unit,
    private val remove: suspend (String) -> Unit,
    private val handle: SavedStateHandle,
) : ViewModel() {

    constructor(extras: LocalExtras, handle: SavedStateHandle) : this(
        readings = extras.bloodPressure.observeRecent(HISTORY_LIMIT),
        nowMillis = System::currentTimeMillis,
        insert = { r -> extras.bloodPressure.add(r.systolic.toDouble(), r.diastolic.toDouble(), r.pulse) },
        remove = { id -> extras.bloodPressure.delete(id) },
        handle = handle,
    )

    /** Null while loading. */
    val ui: StateFlow<BpUi?> = readings
        .map { BpForm.ui(it, nowMillis()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    private val _draft = MutableStateFlow(
        BpDraft(handle.get<String>(KEY_SYS).orEmpty(), handle.get<String>(KEY_DIA).orEmpty(), handle.get<String>(KEY_PULSE).orEmpty()),
    )
    val draft: StateFlow<BpDraft> = _draft.asStateFlow()

    private val _showErrors = MutableStateFlow(false)
    val showErrors: StateFlow<Boolean> = _showErrors.asStateFlow()

    private val _outcome = MutableStateFlow(WriteOutcome.IDLE)
    val outcome: StateFlow<WriteOutcome> = _outcome.asStateFlow()

    fun setSystolic(raw: String) = update { it.copy(systolic = BpEntry.sanitize(raw)) }
    fun setDiastolic(raw: String) = update { it.copy(diastolic = BpEntry.sanitize(raw)) }
    fun setPulse(raw: String) = update { it.copy(pulse = BpEntry.sanitize(raw)) }

    private fun update(change: (BpDraft) -> BpDraft) {
        val d = change(_draft.value)
        handle[KEY_SYS] = d.systolic
        handle[KEY_DIA] = d.diastolic
        handle[KEY_PULSE] = d.pulse
        _draft.value = d
        if (_outcome.value != WriteOutcome.SAVING) _outcome.value = WriteOutcome.IDLE
    }

    fun save() {
        if (_outcome.value == WriteOutcome.SAVING) return
        val parsed = BpEntry.parse(_draft.value).reading
        if (parsed == null) {
            _showErrors.value = true
            return
        }
        _outcome.value = WriteOutcome.SAVING
        viewModelScope.launch {
            val result = runExtrasWrite { insert(parsed) }
            if (result == WriteOutcome.SAVED) {
                _showErrors.value = false
                update { BpDraft() }
            }
            _outcome.value = result
        }
    }

    fun delete(id: String) {
        _outcome.value = WriteOutcome.SAVING
        viewModelScope.launch { _outcome.value = runExtrasWrite { remove(id) } }
    }

    private companion object {
        const val HISTORY_LIMIT = 50
        const val KEY_SYS = "bp.sys"
        const val KEY_DIA = "bp.dia"
        const val KEY_PULSE = "bp.pulse"
    }
}
