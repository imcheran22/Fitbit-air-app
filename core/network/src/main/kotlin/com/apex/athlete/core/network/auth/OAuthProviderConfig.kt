package com.apex.athlete.core.network.auth

/**
 * Everything the provider-neutral PKCE layer needs to know about one OAuth 2.0 authorization
 * server. Instances are plain data so they can be created in tests with a mock server.
 */
data class OAuthProviderConfig(
    /** Short stable identifier, for example `google-health`. */
    val providerId: String,
    val clientId: String,
    val authorizationEndpoint: String,
    val tokenEndpoint: String,
    val revocationEndpoint: String?,
    /** Scopes requested, space separated on the wire. Read-only scopes only. */
    val scopes: List<String>,
    /** Custom-scheme redirect URI registered for this client. */
    val redirectUri: String,
    /** Extra query parameters appended to the authorization request (for example `access_type`). */
    val extraAuthorizationParameters: Map<String, String> = emptyMap(),
) {
    init {
        require(clientId.isNotBlank()) { "clientId must not be blank" }
        require(scopes.isNotEmpty()) { "at least one scope is required" }
        require(scopes.none { it.endsWith(".writeonly") || it.contains("write") }) {
            "Apex only ever requests read-only scopes"
        }
    }

    val scopeParameter: String get() = scopes.joinToString(" ")
}

/** Result of trying to build a provider configuration from build-time inputs. */
sealed interface AuthConfigState {
    /** No usable client ID was supplied. The app shows setup guidance instead of crashing. */
    data object NotConfigured : AuthConfigState

    data class Configured(val config: OAuthProviderConfig) : AuthConfigState
}
