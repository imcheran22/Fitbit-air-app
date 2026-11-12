package com.apex.athlete.ui.exportdelete

import androidx.annotation.StringRes
import com.apex.athlete.R
import com.apex.athlete.core.data.export.DeletionStep
import com.apex.athlete.core.data.export.ExportCounts
import com.apex.athlete.core.data.export.ExportReport
import com.apex.athlete.core.data.export.ImportReport
import com.apex.athlete.core.data.export.ImportStatus

/** Why an export or import did not finish. Never carries an exception message (it could hold a path). */
enum class OperationFailure {
    /** The Demo store is active: nothing leaves or enters. */
    DEMO,

    /** The document provider would not give us a stream for the chosen file. */
    CANNOT_OPEN,

    /** Reading or writing broke part-way. */
    IO,
}

/** Lifecycle of one long operation. Lives in the ViewModel so it survives rotation. */
sealed interface OperationState<out T> {
    data object Idle : OperationState<Nothing>

    /** [progress] is the rows read so far (import only); null when unknown. */
    data class Running(val progress: Long? = null) : OperationState<Nothing>

    data class Done<T>(val result: T) : OperationState<T>

    data class Failed(val reason: OperationFailure) : OperationState<Nothing>
}

val OperationState<*>.isRunning: Boolean get() = this is OperationState.Running

/** What a finished export reports: counts only. */
data class ExportResult(val format: ExportReport.Format, val counts: ExportCounts)

/** Delete-all flow. Two confirmations, the second needs the word typed. */
sealed interface DeleteState {
    data object Idle : DeleteState

    /** Step 1: "are you sure". */
    data object ConfirmFirst : DeleteState

    /** Step 2: type the word. [typed] is what the owner has entered so far. */
    data class ConfirmTyped(val typed: String = "") : DeleteState

    data object Running : DeleteState

    /** Finished. [failedSteps] is empty when everything worked. */
    data class Done(val failedSteps: List<DeletionStep>) : DeleteState
}

/** The word the owner must type. Same text appears in strings (exportdelete_delete_word). */
const val DELETE_CONFIRM_WORD = "DELETE"

/** True only for the exact word (surrounding spaces ignored, case matters). */
fun isDeleteConfirmed(typed: String): Boolean = typed.trim() == DELETE_CONFIRM_WORD

/** Copy for each import status. Both are string resource ids; the screen resolves them. */
data class ImportStatusCopy(@StringRes val title: Int, @StringRes val body: Int, val imported: Boolean)

fun importStatusCopy(status: ImportStatus): ImportStatusCopy = when (status) {
    ImportStatus.COMPLETED -> ImportStatusCopy(R.string.exportdelete_import_completed_title, R.string.exportdelete_import_completed_body, true)
    ImportStatus.PARTIAL -> ImportStatusCopy(R.string.exportdelete_import_partial_title, R.string.exportdelete_import_partial_body, true)
    ImportStatus.NOT_AN_EXPORT -> ImportStatusCopy(R.string.exportdelete_import_not_export_title, R.string.exportdelete_import_not_export_body, false)
    ImportStatus.NEWER_VERSION -> ImportStatusCopy(R.string.exportdelete_import_newer_title, R.string.exportdelete_import_newer_body, false)
}

@StringRes
fun failureText(reason: OperationFailure): Int = when (reason) {
    OperationFailure.DEMO -> R.string.exportdelete_failure_demo
    OperationFailure.CANNOT_OPEN -> R.string.exportdelete_failure_open
    OperationFailure.IO -> R.string.exportdelete_failure_io
}

/** Plain-language name of a deletion step, used for the failure report (step names only). */
@StringRes
fun stepName(step: DeletionStep): Int = when (step) {
    DeletionStep.CANCEL_BACKGROUND_WORK -> R.string.exportdelete_step_cancel_work
    DeletionStep.REVOKE_GOOGLE_ACCESS -> R.string.exportdelete_step_revoke
    DeletionStep.CLEAR_GOOGLE_TOKENS -> R.string.exportdelete_step_google_tokens
    DeletionStep.CLEAR_HEALTH_CONNECT_TOKENS -> R.string.exportdelete_step_hc_tokens
    DeletionStep.CLEAR_AI_KEY -> R.string.exportdelete_step_ai_key
    DeletionStep.CLEAR_ALERT_RECORD -> R.string.exportdelete_step_alerts
    DeletionStep.RESET_REAL_STORE -> R.string.exportdelete_step_store
    DeletionStep.DISCARD_DEMO_STORE -> R.string.exportdelete_step_demo
    DeletionStep.CLEAR_SETTINGS -> R.string.exportdelete_step_settings
}

/** Export row types in display order, paired with their counts. */
data class CountRow(@StringRes val label: Int, val count: Long)

fun exportCountRows(c: ExportCounts): List<CountRow> = listOf(
    CountRow(R.string.exportdelete_type_daily, c.daily),
    CountRow(R.string.exportdelete_type_hr, c.heartRateMinutes),
    CountRow(R.string.exportdelete_type_samples, c.samples),
    CountRow(R.string.exportdelete_type_sleeps, c.sleepSessions),
    CountRow(R.string.exportdelete_type_stages, c.sleepStages),
    CountRow(R.string.exportdelete_type_workouts, c.workouts),
)

/** Import result figures, taken straight from the report. */
data class ImportSummary(val ingested: Long, val quarantined: Long, val computedSkipped: Long, val replayedDays: Int)

fun ImportReport.summary() = ImportSummary(ingested.totalWritten, quarantinedTotal, skippedDerived, replayedDays)
