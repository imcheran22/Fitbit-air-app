package com.apex.athlete.ui.quicklog

import androidx.annotation.StringRes
import com.apex.athlete.R
import com.apex.athlete.core.data.extras.DemoWriteRefusedException
import kotlinx.coroutines.CancellationException

/** Result of a local write, shared by the quick log, behaviours, food, blood pressure and breathing screens. */
enum class WriteOutcome {
    IDLE,
    SAVING,
    SAVED,

    /** Demo mode refuses writes: a calm message, never a crash. */
    DEMO,

    /** The repository rejected the input (a typing error the form did not catch). */
    INVALID,
    ERROR,
}

/** Runs [block] and maps the write exceptions of `LocalExtras` to an outcome. Cancellation is rethrown. */
suspend fun runExtrasWrite(block: suspend () -> Unit): WriteOutcome = try {
    block()
    WriteOutcome.SAVED
} catch (e: CancellationException) {
    throw e
} catch (e: DemoWriteRefusedException) {
    WriteOutcome.DEMO
} catch (e: IllegalArgumentException) {
    WriteOutcome.INVALID
} catch (e: Exception) {
    WriteOutcome.ERROR
}

/** Status line text for an outcome; null when nothing is to be said. Strings live in strings_quicklog.xml. */
@StringRes
fun writeOutcomeRes(outcome: WriteOutcome): Int? = when (outcome) {
    WriteOutcome.IDLE, WriteOutcome.SAVING -> null
    WriteOutcome.SAVED -> R.string.extras_saved
    WriteOutcome.DEMO -> R.string.extras_demo_not_saved
    WriteOutcome.INVALID -> R.string.extras_invalid
    WriteOutcome.ERROR -> R.string.extras_error
}
