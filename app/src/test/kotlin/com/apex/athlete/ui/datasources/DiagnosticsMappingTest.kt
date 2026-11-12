package com.apex.athlete.ui.datasources

import com.apex.athlete.core.network.auth.AuthState
import com.apex.athlete.core.network.auth.ReauthReason
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class DiagnosticsMappingTest {
    @Test
    fun signedInKeepsScopeNamesOnly() {
        val s = googleAuthSnapshot(true, AuthState.SignedIn(setOf("scope.a", "scope.b")))
        assertTrue(s.configured && s.signedIn)
        assertEquals(setOf("scope.a", "scope.b"), s.grantedScopes)
    }

    @Test
    fun everythingElseIsSignedOutWithNoScopes() {
        listOf(null, AuthState.SignedOut, AuthState.NeedsReauth(ReauthReason.entries.first())).forEach {
            val s = googleAuthSnapshot(false, it)
            assertFalse(s.signedIn)
            assertTrue(s.grantedScopes.isEmpty())
        }
    }
}
