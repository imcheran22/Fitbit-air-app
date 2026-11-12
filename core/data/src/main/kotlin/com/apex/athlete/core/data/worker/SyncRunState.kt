package com.apex.athlete.core.data.worker

/**
 * What the app shows about the background/foreground sync. [Failed.reason] is a stable machine code
 * (`network`, `rate_limited`, `permission_missing`, `no_source`, `store_unavailable`, `failed`); it never
 * carries a message, URL, token or health value.
 */
sealed interface SyncRunState {
    data object Idle : SyncRunState
    data object Running : SyncRunState
    data class Succeeded(val atMillis: Long) : SyncRunState
    data class Failed(val reason: String) : SyncRunState

    /** The Google sign-in expired or was revoked; local data is untouched. */
    data object NeedsSignIn : SyncRunState
}
