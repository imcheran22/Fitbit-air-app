package com.apex.athlete.ui.takeout

import androidx.annotation.StringRes
import com.apex.athlete.R
import com.apex.athlete.core.data.takeout.TakeoutCategory
import com.apex.athlete.core.data.worker.TakeoutFailure
import com.apex.athlete.core.data.worker.TakeoutImportState
import com.apex.athlete.core.data.worker.TakeoutImportSummary
import com.apex.athlete.core.data.worker.TakeoutPhase
import java.time.LocalDate

/** What the status area of the screen shows. Copy is resolved in the composable from the string ids. */
sealed interface TakeoutPanel {
    data object Idle : TakeoutPanel

    /** [fraction] is null while the archive is still being listed (total unknown). */
    data class Running(
        val filesDone: Int,
        val filesTotal: Int,
        val rowsWritten: Long,
        @StringRes val stage: Int,
        val fraction: Float?,
    ) : TakeoutPanel

    data class Completed(
        @StringRes val headline: Int,
        val summary: TakeoutImportSummary,
        val firstDay: LocalDate?,
        val lastDay: LocalDate?,
    ) : TakeoutPanel

    data class Failed(@StringRes val message: Int) : TakeoutPanel
}

/** Everything the content draws. */
data class TakeoutUiState(
    val demo: Boolean,
    val lastImportMillis: Long?,
    val panel: TakeoutPanel,
) {
    val running: Boolean get() = panel is TakeoutPanel.Running

    /** Picking is allowed outside Demo mode and while nothing is queued or running. */
    val canPick: Boolean get() = !demo && !running
}

fun panelOf(state: TakeoutImportState): TakeoutPanel = when (state) {
    TakeoutImportState.Idle -> TakeoutPanel.Idle
    is TakeoutImportState.Running -> TakeoutPanel.Running(
        filesDone = state.filesDone.coerceAtLeast(0),
        filesTotal = state.filesTotal.coerceAtLeast(0),
        rowsWritten = state.rowsWritten.coerceAtLeast(0L),
        stage = stageRes(state.currentType),
        fraction = if (state.filesTotal > 0) (state.filesDone.toFloat() / state.filesTotal).coerceIn(0f, 1f) else null,
    )
    is TakeoutImportState.Completed -> TakeoutPanel.Completed(
        headline = when {
            state.summary.nothingNew -> R.string.takeout_done_nothing_new
            state.summary.hasWarnings -> R.string.takeout_done_warnings
            else -> R.string.takeout_done
        },
        summary = state.summary,
        firstDay = state.summary.firstEpochDay?.let(::dayOrNull),
        lastDay = state.summary.lastEpochDay?.let(::dayOrNull),
    )
    is TakeoutImportState.Failed -> TakeoutPanel.Failed(failureTextRes(state.reasonCode))
}

fun uiStateOf(demo: Boolean, lastImportMillis: Long?, import: TakeoutImportState) =
    TakeoutUiState(demo, lastImportMillis, panelOf(import))

private fun dayOrNull(epochDay: Long): LocalDate? =
    try { LocalDate.ofEpochDay(epochDay) } catch (_: java.time.DateTimeException) { null }

/** Name of the phase or category being worked on; a missing or unknown key gives the generic text. */
@StringRes
fun stageRes(currentType: String?): Int = when (currentType) {
    null -> R.string.takeout_stage_working
    TakeoutPhase.INSPECTING -> R.string.takeout_stage_inspecting
    TakeoutPhase.RECALCULATING -> R.string.takeout_stage_recalculating
    else -> when (TakeoutCategory.fromKey(currentType)) {
        TakeoutCategory.HEART_RATE -> R.string.takeout_cat_heart_rate
        TakeoutCategory.RESTING_HEART_RATE -> R.string.takeout_cat_resting_heart_rate
        TakeoutCategory.STEPS -> R.string.takeout_cat_steps
        TakeoutCategory.SLEEP -> R.string.takeout_cat_sleep
        TakeoutCategory.EXERCISE -> R.string.takeout_cat_exercise
        TakeoutCategory.HRV_DETAILS -> R.string.takeout_cat_hrv_details
        TakeoutCategory.HRV_DAILY -> R.string.takeout_cat_hrv_daily
        TakeoutCategory.SPO2_MINUTE -> R.string.takeout_cat_spo2_minute
        TakeoutCategory.SPO2_DAILY -> R.string.takeout_cat_spo2_daily
        TakeoutCategory.RESPIRATORY_RATE -> R.string.takeout_cat_respiratory_rate
        TakeoutCategory.DEVICE_TEMPERATURE -> R.string.takeout_cat_device_temperature
        TakeoutCategory.COMPUTED_TEMPERATURE -> R.string.takeout_cat_computed_temperature
        null -> R.string.takeout_stage_working
    }
}

/** Calm text per [TakeoutFailure] code; an unknown code gets the generic failure text. */
@StringRes
fun failureTextRes(code: String): Int = when (code) {
    TakeoutFailure.DEMO_MODE -> R.string.takeout_fail_demo
    TakeoutFailure.STORE_UNAVAILABLE -> R.string.takeout_fail_store
    TakeoutFailure.NO_INPUT -> R.string.takeout_fail_no_input
    TakeoutFailure.NOT_AN_ARCHIVE -> R.string.takeout_fail_not_archive
    TakeoutFailure.NO_RECOGNISED_FILES -> R.string.takeout_fail_no_files
    TakeoutFailure.UNREADABLE -> R.string.takeout_fail_unreadable
    TakeoutFailure.UNSUPPORTED_FORMAT -> R.string.takeout_fail_unsupported
    TakeoutFailure.FAILED -> R.string.takeout_fail_generic
    else -> R.string.takeout_fail_generic
}

/** One label and count line of the result card. */
data class CountRow(@StringRes val label: Int, val count: Long)

/** The result card's rows. Dropped, quarantined and skipped rows appear only when there are some. */
fun countRows(s: TakeoutImportSummary): List<CountRow> = buildList {
    add(CountRow(R.string.takeout_count_files_imported, s.filesImported.toLong()))
    if (s.filesSkipped > 0) add(CountRow(R.string.takeout_count_files_skipped, s.filesSkipped.toLong()))
    add(CountRow(R.string.takeout_count_rows, s.rowsImported))
    if (s.rowsDropped > 0) add(CountRow(R.string.takeout_count_dropped, s.rowsDropped))
    if (s.rowsQuarantined > 0) add(CountRow(R.string.takeout_count_quarantined, s.rowsQuarantined))
    if (s.unknownEntries > 0) add(CountRow(R.string.takeout_count_unknown, s.unknownEntries.toLong()))
    add(CountRow(R.string.takeout_count_recomputed, s.recomputedDays.toLong()))
}
