package com.apex.athlete.core.network.auth

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable

/** What a person using the app needs to know about their Google sign-in right now. */
sealed interface AuthState {
    data object SignedOut : AuthState

    data class SignedIn(val grantedScopes: Set<String>) : AuthState

    /** The saved sign-in no longer works. Local data is untouched; only signing in again is needed. */
    data class NeedsReauth(val reason: ReauthReason) : AuthState
}

/** Why a new sign-in is needed, with wording that can be shown as is. */
enum class ReauthReason(val message: String) {
    /** Google answered `invalid_grant` on refresh. */
    REFRESH_TOKEN_REJECTED(
        "Google ended this sign-in. If your Google Cloud project's OAuth consent screen is still in " +
            "\"Testing\" status, Google expires sign-ins after 7 days; sign in again, or set the " +
            "consent screen to \"In production\" to stop this. It can also happen if you removed " +
            "Apex's access in your Google Account or changed your password. Your data on this " +
            "phone is untouched.",
    ),

    /** A fresh access token was refused with 401 straight after a refresh. */
    ACCESS_REJECTED(
        "Google no longer accepts this sign-in. Please sign in again. Your data on this phone is untouched.",
    ),

    /** There is no refresh token, so the access token cannot be renewed. */
    NO_REFRESH_TOKEN(
        "Google did not give Apex a way to renew the sign-in. Please sign in again and accept the " +
            "consent screen. Your data on this phone is untouched.",
    ),

    /** The client ID the tokens were issued to is not the one the app now uses. */
    CLIENT_CHANGED(
        "The app's Google client ID changed, so the old sign-in cannot be used. Please sign in again.",
    ),

    /** Google rejected the client itself (`invalid_client`, `unauthorized_client`). */
    CLIENT_REJECTED(
        "Google rejected this app's OAuth client. Check the client ID and that your Google account is " +
            "listed as a test user, then sign in again.",
    ),
}

/** The saved tokens. Never logged; [toString] is redacted. */
@Serializable
data class StoredTokens(
    val accessToken: String,
    val refreshToken: String?,
    /** Epoch milliseconds at which [accessToken] stops working. */
    val expiresAtMillis: Long,
    val grantedScopes: Set<String>,
    val clientId: String,
) {
    override fun toString(): String = "StoredTokens(redacted)"
}

/** Verifier and state of an authorization that has been started and not yet completed. */
@Serializable
data class PendingAuthorization(
    val codeVerifier: String,
    val state: String,
    val redirectUri: String,
    val clientId: String,
    val createdAtMillis: Long,
) {
    override fun toString(): String = "PendingAuthorization(redacted)"
}

/** Survives process death so a redirect that arrives after the app was killed can still complete. */
interface PendingAuthorizationStore {
    fun savePending(pending: PendingAuthorization)
    fun loadPending(): PendingAuthorization?
    fun clearPending()
}

/** Keystore-backed on Android, in memory in tests. All methods are safe to call from any thread. */
interface TokenStore {
    val authState: Flow<AuthState>

    /** Current state without collecting the flow. */
    fun currentState(): AuthState

    fun load(): StoredTokens?
    fun save(tokens: StoredTokens)

    /** Drops the tokens and remembers that the owner has to sign in again. */
    fun markNeedsReauth(reason: ReauthReason)

    /** Signs out completely: tokens and any needs-reauth marker. */
    fun clear()
}

/** Non-persistent implementation for tests and previews. */
class InMemoryTokenStore : TokenStore, PendingAuthorizationStore {
    private val lock = Any()
    private var tokens: StoredTokens? = null
    private var pending: PendingAuthorization? = null
    private val state = MutableStateFlow<AuthState>(AuthState.SignedOut)

    override val authState: StateFlow<AuthState> = state.asStateFlow()

    override fun currentState(): AuthState = state.value

    override fun load(): StoredTokens? = synchronized(lock) { tokens }

    override fun save(tokens: StoredTokens) = synchronized(lock) {
        this.tokens = tokens
        state.value = AuthState.SignedIn(tokens.grantedScopes)
    }

    override fun markNeedsReauth(reason: ReauthReason) = synchronized(lock) {
        tokens = null
        state.value = AuthState.NeedsReauth(reason)
    }

    override fun clear() = synchronized(lock) {
        tokens = null
        state.value = AuthState.SignedOut
    }

    override fun savePending(pending: PendingAuthorization) = synchronized(lock) { this.pending = pending }

    override fun loadPending(): PendingAuthorization? = synchronized(lock) { pending }

    override fun clearPending() = synchronized(lock) { pending = null }
}
