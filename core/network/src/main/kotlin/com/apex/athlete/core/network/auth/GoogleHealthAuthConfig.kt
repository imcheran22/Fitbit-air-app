package com.apex.athlete.core.network.auth

/**
 * Google OAuth 2.0 installed-app configuration for the Google Health API.
 *
 * Endpoints are Google's documented OAuth 2.0 endpoints. Scope strings are copied verbatim from the
 * `auth.oauth2.scopes` section of the Google Health API v4 discovery document (revision 20261109,
 * `docs/api-snapshots/google-health-v4-discovery-2026-11-11.json`). Only `.readonly` scopes appear
 * here; Apex never writes to a Google account.
 */
object GoogleHealthAuthConfig {
    const val AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
    const val TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
    const val REVOCATION_ENDPOINT = "https://oauth2.googleapis.com/revoke"

    const val SCOPE_HEALTH_METRICS = "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly"
    const val SCOPE_ACTIVITY = "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly"
    const val SCOPE_SLEEP = "https://www.googleapis.com/auth/googlehealth.sleep.readonly"

    /**
     * Needed only for the paired-devices list (`pairedDevices.list` requires it). No call site uses that list,
     * so it is NOT part of [READ_SCOPES]; add it there together with the first caller.
     */
    const val SCOPE_SETTINGS = "https://www.googleapis.com/auth/googlehealth.settings.readonly"

    /** Scopes requested at sign-in. Location, ECG, IRN, profile, mindfulness etc. are deliberately omitted. */
    val READ_SCOPES: List<String> = listOf(SCOPE_HEALTH_METRICS, SCOPE_ACTIVITY, SCOPE_SLEEP)

    const val REDIRECT_PATH = "/oauth2redirect"
    private const val CLIENT_ID_SUFFIX = ".apps.googleusercontent.com"
    private const val REDIRECT_SCHEME_PREFIX = "com.googleusercontent.apps."

    /**
     * Google's installed-app convention: the redirect scheme is the reversed client ID, that is
     * `com.googleusercontent.apps.<client-id-prefix>` where the prefix is everything before
     * `.apps.googleusercontent.com`. Returns null when [clientId] is not in that shape.
     */
    fun redirectScheme(clientId: String): String? {
        val trimmed = clientId.trim()
        if (!trimmed.endsWith(CLIENT_ID_SUFFIX)) return null
        val prefix = trimmed.removeSuffix(CLIENT_ID_SUFFIX)
        if (prefix.isEmpty() || !prefix.all { it.isLetterOrDigit() || it == '-' || it == '_' }) return null
        return REDIRECT_SCHEME_PREFIX + prefix
    }

    fun redirectUri(clientId: String): String? = redirectScheme(clientId)?.let { "$it:$REDIRECT_PATH" }

    /**
     * Builds the configuration from the client ID that `:app` injects through BuildConfig.
     * A blank or malformed ID yields [AuthConfigState.NotConfigured], never an exception.
     */
    fun create(clientId: String?): AuthConfigState {
        val id = clientId?.trim().orEmpty()
        if (id.isEmpty()) return AuthConfigState.NotConfigured
        val redirect = redirectUri(id) ?: return AuthConfigState.NotConfigured
        return AuthConfigState.Configured(
            OAuthProviderConfig(
                providerId = "google-health",
                clientId = id,
                authorizationEndpoint = AUTHORIZATION_ENDPOINT,
                tokenEndpoint = TOKEN_ENDPOINT,
                revocationEndpoint = REVOCATION_ENDPOINT,
                scopes = READ_SCOPES,
                redirectUri = redirect,
                extraAuthorizationParameters = mapOf(
                    // A refresh token is only issued with offline access; consent is forced so it is
                    // returned again if the owner signs in a second time.
                    "access_type" to "offline",
                    "prompt" to "consent",
                    // Google's incremental-authorization switch: keeps previously granted scopes.
                    "include_granted_scopes" to "true",
                ),
            ),
        )
    }
}
