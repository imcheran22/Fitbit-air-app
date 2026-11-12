package com.apex.athlete.ui.exportdelete

import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.apex.athlete.core.data.export.DeletionReport
import com.apex.athlete.core.data.export.DemoStoreRefusedException
import com.apex.athlete.core.data.export.ExportReport
import com.apex.athlete.core.data.export.ImportReport
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.InputStream
import java.io.OutputStream
import kotlin.coroutines.cancellation.CancellationException

/**
 * State machine for export, import and "Delete all my data". Holds no Context: the screen supplies
 * stream openers (`contentResolver.openOutputStream(uri)` / `openInputStream(uri)`), and the data
 * operations arrive as function values so tests can fake them.
 *
 * Long operations keep their status here, so rotation does not lose them. Export and import run in
 * [viewModelScope] on [io]. Deletion runs in [deleteScope] (the application scope) so leaving the
 * screen cannot cancel it half-way.
 *
 * [demoMode] (from [demoSource]) is true while Demo mode is on: export and import are refused (also if called).
 */
class ExportDeleteViewModel(
    private val handle: SavedStateHandle,
    demoSource: Flow<Boolean>,
    private val openOutput: (Uri) -> OutputStream?,
    private val openInput: (Uri) -> InputStream?,
    private val exportJson: suspend (OutputStream) -> ExportReport,
    private val exportCsvZip: suspend (OutputStream) -> ExportReport,
    private val importJson: suspend (InputStream, (Long) -> Unit) -> ImportReport,
    private val deleteEverything: suspend () -> DeletionReport,
    private val deleteScope: CoroutineScope,
    private val io: CoroutineDispatcher = Dispatchers.IO,
) : ViewModel() {

    /** True while Demo mode is on. */
    val demoMode: StateFlow<Boolean> = demoSource.stateIn(viewModelScope, SharingStarted.Eagerly, false)

    private val _export = MutableStateFlow<OperationState<ExportResult>>(OperationState.Idle)
    val export: StateFlow<OperationState<ExportResult>> = _export.asStateFlow()

    private val _import = MutableStateFlow<OperationState<ImportReport>>(OperationState.Idle)
    val importState: StateFlow<OperationState<ImportReport>> = _import.asStateFlow()

    private val _delete = MutableStateFlow(restoreDelete())
    val delete: StateFlow<DeleteState> = _delete.asStateFlow()

    // ---- Export -------------------------------------------------------------------------------

    fun exportTo(uri: Uri, csvZip: Boolean) {
        if (_export.value.isRunning) return
        if (demoMode.value) { _export.value = OperationState.Failed(OperationFailure.DEMO); return }
        _export.value = OperationState.Running()
        viewModelScope.launch {
            _export.value = try {
                withContext<OperationState<ExportResult>>(io) {
                    val out = openOutput(uri) ?: return@withContext OperationState.Failed(OperationFailure.CANNOT_OPEN)
                    out.use { stream ->
                        val report = if (csvZip) exportCsvZip(stream) else exportJson(stream)
                        stream.flush()
                        OperationState.Done(ExportResult(report.format, report.counts))
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: DemoStoreRefusedException) {
                OperationState.Failed(OperationFailure.DEMO)
            } catch (_: Exception) {
                OperationState.Failed(OperationFailure.IO)
            }
        }
    }

    fun clearExport() { if (!_export.value.isRunning) _export.value = OperationState.Idle }

    // ---- Import -------------------------------------------------------------------------------

    fun importFrom(uri: Uri) {
        if (_import.value.isRunning) return
        if (demoMode.value) { _import.value = OperationState.Failed(OperationFailure.DEMO); return }
        _import.value = OperationState.Running(progress = 0)
        viewModelScope.launch {
            _import.value = try {
                withContext<OperationState<ImportReport>>(io) {
                    val input = openInput(uri) ?: return@withContext OperationState.Failed(OperationFailure.CANNOT_OPEN)
                    input.use { stream ->
                        val report = importJson(stream) { rows -> _import.value = OperationState.Running(rows) }
                        OperationState.Done(report)
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: DemoStoreRefusedException) {
                OperationState.Failed(OperationFailure.DEMO)
            } catch (_: Exception) {
                OperationState.Failed(OperationFailure.IO)
            }
        }
    }

    fun clearImport() { if (!_import.value.isRunning) _import.value = OperationState.Idle }

    // ---- Delete -------------------------------------------------------------------------------

    /** Opens step 1. Ignored while deleting. */
    fun startDelete() {
        if (_delete.value is DeleteState.Idle || _delete.value is DeleteState.Done) setDelete(DeleteState.ConfirmFirst)
    }

    /** Step 1 to step 2. */
    fun continueDelete() {
        if (_delete.value is DeleteState.ConfirmFirst) setDelete(DeleteState.ConfirmTyped())
    }

    fun typeDeleteWord(text: String) {
        if (_delete.value is DeleteState.ConfirmTyped) setDelete(DeleteState.ConfirmTyped(text))
    }

    /** Back out of either confirmation step. */
    fun cancelDelete() {
        val s = _delete.value
        if (s is DeleteState.ConfirmFirst || s is DeleteState.ConfirmTyped) setDelete(DeleteState.Idle)
    }

    /** Runs the deletion, only from step 2 with the word typed. Returns whether it started. */
    fun confirmDelete(): Boolean {
        val s = _delete.value
        if (s !is DeleteState.ConfirmTyped || !isDeleteConfirmed(s.typed)) return false
        setDelete(DeleteState.Running)
        deleteScope.launch {
            val failed = try {
                deleteEverything().failedSteps
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // DataDeletion reports step failures itself; this guards only an unexpected throw.
                com.apex.athlete.core.data.export.DeletionStep.entries
            }
            setDelete(DeleteState.Done(failed))
        }
        return true
    }

    fun dismissDeleteReport() { if (_delete.value is DeleteState.Done) setDelete(DeleteState.Idle) }

    private fun setDelete(state: DeleteState) {
        _delete.update { state }
        when (state) {
            is DeleteState.ConfirmFirst -> { handle[KEY_STAGE] = STAGE_FIRST; handle[KEY_TYPED] = "" }
            is DeleteState.ConfirmTyped -> { handle[KEY_STAGE] = STAGE_TYPED; handle[KEY_TYPED] = state.typed }
            else -> { handle[KEY_STAGE] = STAGE_NONE; handle[KEY_TYPED] = "" }
        }
    }

    /** Only the confirmation steps survive process death; a running deletion cannot. */
    private fun restoreDelete(): DeleteState = when (handle.get<Int>(KEY_STAGE)) {
        STAGE_FIRST -> DeleteState.ConfirmFirst
        STAGE_TYPED -> DeleteState.ConfirmTyped(handle.get<String>(KEY_TYPED).orEmpty())
        else -> DeleteState.Idle
    }

    private companion object {
        const val KEY_STAGE = "delete_stage"
        const val KEY_TYPED = "delete_typed"
        const val STAGE_NONE = 0
        const val STAGE_FIRST = 1
        const val STAGE_TYPED = 2
    }
}
