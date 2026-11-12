package com.apex.athlete.core.data.export

import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class DataDeletionTest {
    private fun make(log: MutableList<String>, failing: Set<String> = emptySet(), revoke: suspend () -> Unit = {}): DataDeletion {
        fun s(name: String): suspend () -> Unit = { log += name; if (name in failing) throw IllegalStateException("secret detail") }
        return DataDeletion(s("work"), { log += "revoke"; revoke() }, s("tokens"), s("hc"), s("ai"), s("alerts"), s("store"), s("demo"), s("settings"), revokeTimeoutMillis = 200)
    }

    @Test fun runsInOrder() {
        val log = ArrayList<String>()
        val r = runBlocking { make(log).deleteEverything() }
        assertEquals(listOf("work", "revoke", "tokens", "hc", "ai", "alerts", "store", "demo", "settings"), log)
        assertTrue(r.allSucceeded)
        assertEquals(DeletionStep.entries, r.outcomes.map { it.step })
    }

    @Test fun everyStepRunsEvenWhenOthersThrow() {
        val log = ArrayList<String>()
        val r = runBlocking { make(log, failing = setOf("work", "tokens", "store"), revoke = { throw java.io.IOException("offline") }).deleteEverything() }
        assertEquals(9, log.size)
        assertEquals(setOf(DeletionStep.CANCEL_BACKGROUND_WORK, DeletionStep.REVOKE_GOOGLE_ACCESS, DeletionStep.CLEAR_GOOGLE_TOKENS, DeletionStep.RESET_REAL_STORE), r.failedSteps.toSet())
        assertEquals("IllegalStateException", r.outcome(DeletionStep.RESET_REAL_STORE)!!.errorType)
        assertFalse(r.outcomes.any { it.errorType?.contains("secret") == true })
        assertTrue(r.outcome(DeletionStep.CLEAR_SETTINGS)!!.succeeded)
    }

    @Test fun hangingRevokeTimesOutAndRestStillRuns() {
        val log = ArrayList<String>()
        val r = runBlocking { make(log, revoke = { delay(60_000) }).deleteEverything() }
        assertEquals(9, log.size)
        assertEquals(listOf(DeletionStep.REVOKE_GOOGLE_ACCESS), r.failedSteps)
    }
}
