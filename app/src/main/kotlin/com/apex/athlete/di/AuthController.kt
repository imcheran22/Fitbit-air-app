package com.apex.athlete.di

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import com.apex.athlete.BuildConfig
import com.apex.athlete.core.data.settings.SettingsStore
import com.apex.athlete.core.data.worker.SyncScheduler
import com.apex.athlete.core.network.GoogleHealthNetwork
import com.apex.athlete.core.network.auth.AuthState
import com.apex.athlete.core.network.auth.AuthorizationOutcome
import com.apex.athlete.core.network.auth.CustomTabsLauncher
import com.apex.athlete.core.network.auth.GoogleHealthAuthConfig
import com.apex.athlete.core.network.auth.OAuthClientType
import com.apex.athlete.core.network.auth.TokenStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/** What the Data Sources screen shows about a sign-in attempt. Carries no token, code or URL. */
sealed interface SignInUiState {
    data object Idle : SignInUiState

    /** The Custom Tab was opened; waiting for the redirect. */
    data object WaitingForBrowser : SignInUiState

    /** The redirect arrived and the code is being exchanged. */
    data object Completing : SignInUiState

    /** Signed in. [missingScopes] are requested scopes the owner un-ticked on the consent screen. */
    data class Done(val missingScopes: Set<String>) : SignInUiState

    /** No OAuth client ID in the build or in Settings. */
    data object NotConfigured : SignInUiState

    /**
     * A client ID pasted in Settings needs a different redirect scheme from the one compiled into
     * the manifest, so Google's redirect could not reach the app. The owner has to rebuild with
     * the ID (the Release workflow input or `local.properties`, docs/SETUP.md).
     */
    data class RedirectSchemeMismatch(val manifestScheme: String, val neededScheme: String) : SignInUiState

    /** No browser could open the consent page. */
    data object NoBrowser : SignInUiState

    /** Google or the network refused; see [outcome] for the reason to explain. */
    data class Failed(val outcome: AuthorizationOutcome) : SignInUiState

    data object Unexpected : SignInUiState
}

/**
 * Starts, completes and ends the Google sign-in for the screens and for [com.apex.athlete.OAuthRedirectActivity].
 * Read-only scopes only (see GoogleHealthAuthConfig). Never logs a URL, code or token.
 *
 * Completion runs in the application scope, so it survives the redirect activity finishing; the
 * pending verifier and state are persisted by the token store, so a redirect arriving after the
 * process was killed still completes.
 */
class AuthController(
    private val appContext: Context,
    private val network: StateFlow<GoogleHealthNetwork>,
    private val tokenStore: TokenStore,
    private val settings: SettingsStore,
    private val scope: CoroutineScope,
) {
    private val _state = MutableStateFlow<SignInUiState>(SignInUiState.Idle)

    /** Progress of the current sign-in attempt. */
    val state: StateFlow<SignInUiState> = _state.asStateFlow()

    /** Signed out, signed in (with scopes) or needs a new sign-in (with the reason). */
    val authState: Flow<AuthState> get() = tokenStore.authState

    /** True when a client ID is available (build or Settings). */
    val isConfigured: Boolean get() = network.value is GoogleHealthNetwork.Ready

    /** Opens Google's consent page in a Custom Tab. [activity] is only used to launch it. */
    fun begin(activity: Activity) {
        val ready = network.value as? GoogleHealthNetwork.Ready
        if (ready == null) {
            _state.value = SignInUiState.NotConfigured
            return
        }
        val needed = GoogleHealthAuthConfig.schemeNeededIfDifferent(
            clientId = ready.config.clientId,
            clientType = OAuthClientType.parse(BuildConfig.OAUTH_CLIENT_TYPE),
            applicationId = BuildConfig.APPLICATION_ID,
            manifestScheme = BuildConfig.OAUTH_REDIRECT_SCHEME,
        )
        if (needed != null) {
            _state.value = SignInUiState.RedirectSchemeMismatch(BuildConfig.OAUTH_REDIRECT_SCHEME, needed)
            return
        }
        try {
            val request = ready.pkce.beginAuthorization()
            CustomTabsLauncher.launch(activity, request)
            _state.value = SignInUiState.WaitingForBrowser
        } catch (_: ActivityNotFoundException) {
            _state.value = SignInUiState.NoBrowser
        } catch (_: Exception) {
            _state.value = SignInUiState.Unexpected
        }
    }

    /** True when [uri] is this app's OAuth redirect. */
    fun isRedirect(uri: String): Boolean =
        (network.value as? GoogleHealthNetwork.Ready)?.pkce?.isRedirect(uri) == true

    /** Exchanges the authorization code from the redirect [uri]. Safe to call from any thread. */
    fun complete(uri: String) {
        val ready = network.value as? GoogleHealthNetwork.Ready
        if (ready == null) {
            _state.value = SignInUiState.NotConfigured
            return
        }
        if (!ready.pkce.isRedirect(uri)) return
        scope.launch {
            _state.value = SignInUiState.Completing
            val outcome = try {
                ready.pkce.completeAuthorization(uri)
            } catch (_: Exception) {
                _state.value = SignInUiState.Unexpected
                return@launch
            }
            when (outcome) {
                is AuthorizationOutcome.Success -> {
                    _state.value = SignInUiState.Done(outcome.missingScopes)
                    // First pull right after signing in (never in Demo mode: the demo store takes no live data).
                    if (!settings.settings.first().demoMode) SyncScheduler.syncNow(appContext)
                }
                else -> _state.value = SignInUiState.Failed(outcome)
            }
        }
    }

    /** Revokes the grant at Google (best effort) and forgets the tokens. Local data is not touched. */
    fun signOut() {
        val ready = network.value as? GoogleHealthNetwork.Ready ?: return
        scope.launch {
            try {
                ready.pkce.signOut()
            } catch (_: Exception) {
                // Local tokens are cleared by signOut itself; a network failure only skips the revoke.
            }
            _state.value = SignInUiState.Idle
        }
    }

    /** Returns the progress to [SignInUiState.Idle] once the screen has shown the result. */
    fun dismiss() {
        _state.value = SignInUiState.Idle
    }
}
