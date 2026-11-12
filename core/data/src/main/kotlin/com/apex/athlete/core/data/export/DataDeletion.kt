package com.apex.athlete.core.data.export

import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

/** The steps of "Delete all my data", in the order they run. */
enum class DeletionStep {
    CANCEL_BACKGROUND_WORK,
    REVOKE_GOOGLE_ACCESS,
    CLEAR_GOOGLE_TOKENS,
    CLEAR_HEALTH_CONNECT_TOKENS,
    CLEAR_AI_KEY,
    CLEAR_ALERT_RECORD,
    RESET_REAL_STORE,
    DISCARD_DEMO_STORE,
    CLEAR_SETTINGS,
}

/**
 * @property errorType the exception class name when the step failed (never its message, which could
 *   carry a path or a value). Null when it succeeded.
 */
data class DeletionOutcome(val step: DeletionStep, val succeeded: Boolean, val errorType: String? = null)

data class DeletionReport(val outcomes: List<DeletionOutcome>) {
    val allSucceeded: Boolean get() = outcomes.all { it.succeeded }
    val failedSteps: List<DeletionStep> get() = outcomes.filterNot { it.succeeded }.map { it.step }
    fun outcome(step: DeletionStep): DeletionOutcome? = outcomes.firstOrNull { it.step == step }
}

/**
 * "Delete all my data": removes everything Apex keeps on this phone, and nothing anywhere else.
 *
 * **It never deletes anything in Health Connect or in the Google account.** Apex only ever reads
 * from them (the read-only invariant), so the copies they hold are untouched; the owner manages
 * those in Health Connect and in their Google account. Signing out revokes Apex's own access
 * grant at Google, which is not a deletion of data.
 *
 * Ordered, and **every step runs even if an earlier one throws**; each step's outcome is reported.
 * The order matters: background work is stopped first so no sync re-creates data while it is being
 * removed; the network step has a time limit so being offline cannot stall the rest; the local
 * clears always run; settings go last because the app's screens follow them. Runs to completion
 * even if the calling scope is cancelled (for example the screen is closed), and a failed step
 * leaves the app able to start: the next launch simply finds an empty store (or the report tells
 * the owner what to retry).
 *
 * The app wires the collaborators (see the constructor); none of them is optional, pass `{}` for
 * something an install does not have.
 */
class DataDeletion(
    /** `WorkManager.getInstance(context).cancelAllWork()` and `pruneWork()`. */
    private val cancelAllWork: suspend () -> Unit,
    /** Best-effort revoke at Google, for example `pkceManager.signOut(revokeAtGoogle = true)`. Needs the network; may fail. */
    private val revokeGoogleAccess: suspend () -> Unit,
    /** Local clear of the Google tokens, always, for example `EncryptedTokenStore.wipe()`. */
    private val clearGoogleTokens: suspend () -> Unit,
    /** `DataStoreChangeTokenStore.clearAll()`. */
    private val clearHealthConnectTokens: suspend () -> Unit,
    /** `AiKeyStore.clear()`. */
    private val clearAiKey: suspend () -> Unit,
    /** `AlertLedgerStore.clear()`. */
    private val clearAlertRecord: suspend () -> Unit,
    /** `ApexStores.resetRealStore()`. */
    private val resetRealStore: suspend () -> Unit,
    /** `ApexStores.discardDemo()`. */
    private val discardDemoStore: suspend () -> Unit,
    /** `SettingsStore.clear()`. */
    private val clearSettings: suspend () -> Unit,
    private val revokeTimeoutMillis: Long = 10_000,
) {
    suspend fun deleteEverything(): DeletionReport = withContext(NonCancellable) {
        val outcomes = ArrayList<DeletionOutcome>()

        suspend fun step(step: DeletionStep, block: suspend () -> Unit) {
            outcomes += try {
                block()
                DeletionOutcome(step, succeeded = true)
            } catch (t: Throwable) {
                DeletionOutcome(step, succeeded = false, errorType = t::class.java.simpleName.ifEmpty { "Error" })
            }
        }

        step(DeletionStep.CANCEL_BACKGROUND_WORK, cancelAllWork)
        step(DeletionStep.REVOKE_GOOGLE_ACCESS) {
            if (withTimeoutOrNull(revokeTimeoutMillis) { revokeGoogleAccess() } == null) error("timeout")
        }
        step(DeletionStep.CLEAR_GOOGLE_TOKENS, clearGoogleTokens)
        step(DeletionStep.CLEAR_HEALTH_CONNECT_TOKENS, clearHealthConnectTokens)
        step(DeletionStep.CLEAR_AI_KEY, clearAiKey)
        step(DeletionStep.CLEAR_ALERT_RECORD, clearAlertRecord)
        step(DeletionStep.RESET_REAL_STORE, resetRealStore)
        step(DeletionStep.DISCARD_DEMO_STORE, discardDemoStore)
        step(DeletionStep.CLEAR_SETTINGS, clearSettings)

        DeletionReport(outcomes)
    }
}
