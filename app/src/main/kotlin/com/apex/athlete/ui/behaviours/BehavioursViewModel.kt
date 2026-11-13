package com.apex.athlete.ui.behaviours

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.apex.athlete.core.data.extras.Behaviour
import com.apex.athlete.core.data.extras.BehaviourCatalog
import com.apex.athlete.core.data.extras.LocalExtras
import com.apex.athlete.core.database.entity.BehaviourKind
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

/** Behaviours editor: list, add custom, hide or show, delete custom. The draft survives process death. */
class BehavioursViewModel internal constructor(
    behaviours: Flow<List<Behaviour>>,
    private val addCustom: suspend (String, BehaviourKind) -> Unit,
    private val applyHidden: suspend (String, Boolean) -> Unit,
    private val deleteCustom: suspend (String) -> Unit,
    private val handle: SavedStateHandle,
) : ViewModel() {

    constructor(extras: LocalExtras, handle: SavedStateHandle) : this(
        behaviours = extras.behaviours.observeBehaviours(includeArchived = true),
        addCustom = { name, kind -> extras.behaviours.add(name, kind, CUSTOM_ICON_KEY) },
        applyHidden = { id, hidden -> extras.behaviours.setArchived(id, hidden) },
        deleteCustom = { id -> extras.behaviours.delete(id) },
        handle = handle,
    )

    val rows: StateFlow<List<BehaviourRowUi>?> = behaviours
        .map { toRows(it) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    private val _name = MutableStateFlow(handle.get<String>(KEY_NAME).orEmpty())
    val name: StateFlow<String> = _name.asStateFlow()

    private val _kind = MutableStateFlow(handle.get<String>(KEY_KIND)?.let(BehaviourKind::fromStorageKeyOrNull) ?: BehaviourKind.YES_NO)
    val kind: StateFlow<BehaviourKind> = _kind.asStateFlow()

    private val _outcome = MutableStateFlow(WriteOutcome.IDLE)
    val outcome: StateFlow<WriteOutcome> = _outcome.asStateFlow()

    fun setName(value: String) {
        val capped = value.take(BehaviourForm.MAX_NAME_CHARS)
        handle[KEY_NAME] = capped
        _name.value = capped
        _outcome.value = WriteOutcome.IDLE
    }

    fun setKind(value: BehaviourKind) {
        handle[KEY_KIND] = value.storageKey
        _kind.value = value
    }

    fun canAdd(): Boolean = BehaviourForm.nameError(_name.value) == null && _outcome.value != WriteOutcome.SAVING

    fun add() {
        if (!canAdd()) return
        val n = _name.value.trim()
        val k = _kind.value
        _outcome.value = WriteOutcome.SAVING
        viewModelScope.launch {
            val result = runExtrasWrite { addCustom(n, k) }
            if (result == WriteOutcome.SAVED) setName("")
            _outcome.value = result
        }
    }

    fun setHidden(id: String, hidden: Boolean) = write { applyHidden(id, hidden) }

    fun delete(id: String) {
        // Built-ins are refused here as well as in the repository; the UI does not offer the button.
        if (!id.startsWith(BehaviourCatalog.CUSTOM_PREFIX)) return
        write { deleteCustom(id) }
    }

    private fun write(block: suspend () -> Unit) {
        _outcome.value = WriteOutcome.SAVING
        viewModelScope.launch { _outcome.value = runExtrasWrite(block) }
    }

    private companion object {
        const val KEY_NAME = "behaviour.name"
        const val KEY_KIND = "behaviour.kind"
        const val CUSTOM_ICON_KEY = "behaviour"
    }
}
