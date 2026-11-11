package com.apex.athlete.core.network.auth

import com.apex.athlete.core.network.JitterSource
import com.apex.athlete.core.network.LenientLongSerializer
import com.apex.athlete.core.network.NetClock
import com.apex.athlete.core.network.NetworkJson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.FormBody
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import java.net.URLDecoder
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/** RFC 7636 helpers, pure and deterministic given a random source. */
object Pkce {
    const val MIN_VERIFIER_LENGTH = 43
    const val MAX_VERIFIER_LENGTH = 128
    private const val UNRESERVED_EXTRA = "-._~"

    private val base64Url = Base64.getUrlEncoder().withoutPadding()

    /** 32 random bytes encode to a 43-character verifier, the shortest length RFC 7636 allows. */
    fun generateVerifier(random: SecureRandom = SecureRandom(), byteCount: Int = 32): String {
        require(byteCount in 32..96) { "byteCount must give a 43..128 character verifier" }
        return base64Url.encodeToString(ByteArray(byteCount).also { random.nextBytes(it) })
    }

    fun isValidVerifier(verifier: String): Boolean =
        verifier.length in MIN_VERIFIER_LENGTH..MAX_VERIFIER_LENGTH &&
            verifier.all { it in 'A'..'Z' || it in 'a'..'z' || it in '0'..'9' || it in UNRESERVED_EXTRA }

    /** `BASE64URL-ENCODE(SHA256(ASCII(verifier)))` without padding. */
    fun challengeS256(verifier: String): String {
        require(isValidVerifier(verifier)) { "invalid code verifier" }
        val digest = MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII))
        return base64Url.encodeToString(digest)
    }

    /** Unguessable per-request value that ties the redirect to the request that started it. */
    fun generateState(random: SecureRandom = SecureRandom()): String =
        base64Url.encodeToString(ByteArray(32).also { random.nextBytes(it) })

    /** Comparison whose run time does not depend on where the strings first differ. */
    fun constantTimeEquals(a: String?, b: String?): Boolean {
        if (a == null || b == null) return false
        return MessageDigest.isEqual(a.toByteArray(Charsets.UTF_8), b.toByteArray(Charsets.UTF_8))
    }
}

/** What an incoming redirect URI turned out to be. Never carries the raw URI. */
sealed interface RedirectResult {
    data class Code(val code: String, val state: String?) : RedirectResult
    data class Error(val error: String, val description: String?, val state: String?) : RedirectResult
    data class Invalid(val reason: String) : RedirectResult
}

/** Parses the redirect that Custom Tabs hands back, e.g. `com.googleusercontent.apps.X:/oauth2redirect?code=...&state=...`. */
object RedirectParser {
    fun parse(uri: String, expectedRedirectUri: String? = null): RedirectResult {
        val schemeEnd = uri.indexOf(':')
        if (schemeEnd <= 0) return RedirectResult.Invalid("not a URI")
        if (expectedRedirectUri != null && !matches(uri, expectedRedirectUri)) {
            return RedirectResult.Invalid("redirect does not match")
        }
        val withoutFragment = uri.substringBefore('#')
        val query = if (withoutFragment.contains('?')) withoutFragment.substringAfter('?') else ""
        if (query.isEmpty()) return RedirectResult.Invalid("no parameters")
        val params = HashMap<String, String>()
        for (pair in query.split('&')) {
            if (pair.isEmpty()) continue
            val key = decode(pair.substringBefore('=')) ?: continue
            val value = decode(pair.substringAfter('=', "")) ?: continue
            // First occurrence wins so a smuggled duplicate cannot override the real value.
            params.putIfAbsent(key, value)
        }
        val state = params["state"]
        params["error"]?.takeIf { it.isNotEmpty() }?.let {
            return RedirectResult.Error(it.take(MAX_FIELD), params["error_description"]?.take(MAX_FIELD), state)
        }
        val code = params["code"]
        if (code.isNullOrEmpty()) return RedirectResult.Invalid("no code")
        return RedirectResult.Code(code, state)
    }

    /** Same scheme (case-insensitive) and same path as [expected], ignoring query and fragment. */
    fun matches(uri: String, expected: String): Boolean {
        val actualBase = uri.substringBefore('?').substringBefore('#')
        val expectedBase = expected.substringBefore('?').substringBefore('#')
        return actualBase.substringBefore(':').equals(expectedBase.substringBefore(':'), ignoreCase = true) &&
            actualBase.substringAfter(':').trimStart('/') == expectedBase.substringAfter(':').trimStart('/')
    }

    private fun decode(raw: String): String? = try {
        URLDecoder.decode(raw, "UTF-8")
    } catch (_: IllegalArgumentException) {
        null
    }

    private const val MAX_FIELD = 512
}

/** The URL to open in a Custom Tab plus the state that will come back on the redirect. */
data class AuthorizationRequest(val url: String, val state: String)

sealed interface AuthorizationOutcome {
    /** [missingScopes] are requested scopes the owner un-ticked on the consent screen. */
    data class Success(val grantedScopes: Set<String>, val missingScopes: Set<String>) : AuthorizationOutcome

    /** The owner (or Google) ended the flow, for example `access_denied`. */
    data class Denied(val error: String, val description: String?) : AuthorizationOutcome

    /** The redirect's state did not match the saved one. Nothing was exchanged. */
    data object StateMismatch : AuthorizationOutcome

    data object NoPendingAuthorization : AuthorizationOutcome
    data object PendingExpired : AuthorizationOutcome
    data class InvalidRedirect(val reason: String) : AuthorizationOutcome
    data class ExchangeFailed(val httpCode: Int?, val error: String?) : AuthorizationOutcome
    data object NetworkFailure : AuthorizationOutcome
}

sealed interface RefreshOutcome {
    data class Refreshed(val tokens: StoredTokens) : RefreshOutcome

    /** There is no refresh token to use. */
    data object NoRefreshToken : RefreshOutcome

    /** `invalid_grant`: the refresh token is expired, revoked or otherwise dead. */
    data object InvalidGrant : RefreshOutcome

    /** `invalid_client` / `unauthorized_client`. */
    data class ClientRejected(val error: String) : RefreshOutcome

    /** Any other non-retryable answer (other 4xx, malformed response). */
    data class Rejected(val httpCode: Int, val error: String?) : RefreshOutcome

    /** Timeouts, DNS, 429 and 5xx. Says nothing about the refresh token's validity. */
    data class Transient(val httpCode: Int?) : RefreshOutcome
}

@Serializable
internal data class TokenResponseDto(
    @SerialName("access_token") val accessToken: String? = null,
    @SerialName("refresh_token") val refreshToken: String? = null,
    @SerialName("expires_in") @Serializable(with = LenientLongSerializer::class) val expiresIn: Long? = null,
    @SerialName("scope") val scope: String? = null,
    @SerialName("token_type") val tokenType: String? = null,
)

@Serializable
internal data class TokenErrorDto(
    @SerialName("error") val error: String? = null,
    @SerialName("error_description") val errorDescription: String? = null,
)

/**
 * Provider-neutral OAuth 2.0 authorization-code + PKCE (S256) flow.
 *
 * [httpClient] must NOT carry the bearer interceptor or authenticator (it talks to the token
 * endpoint). Network calls are blocking `...Blocking` functions so the OkHttp authenticator can use
 * them; `suspend` wrappers run them on [Dispatchers.IO].
 */
class PkceManager(
    private val config: OAuthProviderConfig,
    private val httpClient: OkHttpClient,
    private val pendingStore: PendingAuthorizationStore,
    private val tokenStore: TokenStore,
    private val clock: NetClock = NetClock.System,
    private val random: SecureRandom = SecureRandom(),
    private val json: Json = NetworkJson.instance,
    private val pendingTtlMillis: Long = DEFAULT_PENDING_TTL_MILLIS,
) {
    /** Starts an authorization: saves verifier and state, returns the URL for the Custom Tab. */
    fun beginAuthorization(loginHint: String? = null): AuthorizationRequest {
        val verifier = Pkce.generateVerifier(random)
        val state = Pkce.generateState(random)
        pendingStore.savePending(
            PendingAuthorization(
                codeVerifier = verifier,
                state = state,
                redirectUri = config.redirectUri,
                clientId = config.clientId,
                createdAtMillis = clock.nowMillis(),
            ),
        )
        val builder = config.authorizationEndpoint.toHttpUrl().newBuilder()
            .addQueryParameter("client_id", config.clientId)
            .addQueryParameter("redirect_uri", config.redirectUri)
            .addQueryParameter("response_type", "code")
            .addQueryParameter("scope", config.scopeParameter)
            .addQueryParameter("state", state)
            .addQueryParameter("code_challenge", Pkce.challengeS256(verifier))
            .addQueryParameter("code_challenge_method", "S256")
        config.extraAuthorizationParameters.forEach { (k, v) -> builder.addQueryParameter(k, v) }
        if (!loginHint.isNullOrBlank()) builder.addQueryParameter("login_hint", loginHint)
        return AuthorizationRequest(builder.build().toString(), state)
    }

    /** True when [uri] looks like this provider's redirect, so the app can route the intent here. */
    fun isRedirect(uri: String): Boolean = RedirectParser.matches(uri, config.redirectUri)

    fun parseRedirect(uri: String): RedirectResult = RedirectParser.parse(uri, config.redirectUri)

    suspend fun completeAuthorization(redirectUri: String): AuthorizationOutcome =
        withContext(Dispatchers.IO) { completeAuthorizationBlocking(redirectUri) }

    fun completeAuthorizationBlocking(redirectUri: String): AuthorizationOutcome {
        val pending = pendingStore.loadPending() ?: return AuthorizationOutcome.NoPendingAuthorization
        if (pending.clientId != config.clientId) {
            pendingStore.clearPending()
            return AuthorizationOutcome.NoPendingAuthorization
        }
        val parsed = parseRedirect(redirectUri)
        // A stray or forged redirect is rejected without discarding the real pending request.
        val state = when (parsed) {
            is RedirectResult.Invalid -> return AuthorizationOutcome.InvalidRedirect(parsed.reason)
            is RedirectResult.Code -> parsed.state
            is RedirectResult.Error -> parsed.state
        }
        if (!Pkce.constantTimeEquals(state, pending.state)) return AuthorizationOutcome.StateMismatch
        if (clock.nowMillis() - pending.createdAtMillis > pendingTtlMillis) {
            pendingStore.clearPending()
            return AuthorizationOutcome.PendingExpired
        }
        if (parsed is RedirectResult.Error) {
            pendingStore.clearPending()
            return AuthorizationOutcome.Denied(parsed.error, parsed.description)
        }
        parsed as RedirectResult.Code

        val form = FormBody.Builder()
            .add("client_id", config.clientId)
            .add("code", parsed.code)
            .add("code_verifier", pending.codeVerifier)
            .add("grant_type", "authorization_code")
            .add("redirect_uri", pending.redirectUri)
            .build()
        val response = try {
            postForm(config.tokenEndpoint, form)
        } catch (_: IOException) {
            // The code may still be valid, so the pending request is kept for a retry.
            return AuthorizationOutcome.NetworkFailure
        }
        pendingStore.clearPending() // an authorization code is single use
        if (response.code !in 200..299) {
            return AuthorizationOutcome.ExchangeFailed(response.code, parseError(response.body)?.error?.take(64))
        }
        val dto = parseToken(response.body)
        val access = dto?.accessToken
        if (dto == null || access.isNullOrEmpty()) return AuthorizationOutcome.ExchangeFailed(response.code, "malformed_response")

        val granted = dto.scope?.split(' ')?.filter { it.isNotEmpty() }?.toSet().orEmpty()
        val previousRefresh = tokenStore.load()?.takeIf { it.clientId == config.clientId }?.refreshToken
        tokenStore.save(
            StoredTokens(
                accessToken = access,
                refreshToken = dto.refreshToken?.takeIf { it.isNotEmpty() } ?: previousRefresh,
                expiresAtMillis = clock.nowMillis() + (dto.expiresIn ?: DEFAULT_EXPIRES_IN_SECONDS) * 1000L,
                grantedScopes = granted,
                clientId = config.clientId,
            ),
        )
        return AuthorizationOutcome.Success(granted, config.scopes.toSet() - granted)
    }

    suspend fun refresh(current: StoredTokens): RefreshOutcome = withContext(Dispatchers.IO) { refreshBlocking(current) }

    /** Exchanges the refresh token for a new access token. Does not persist; the caller decides. */
    fun refreshBlocking(current: StoredTokens): RefreshOutcome {
        val refreshToken = current.refreshToken ?: return RefreshOutcome.NoRefreshToken
        val form = FormBody.Builder()
            .add("client_id", config.clientId)
            .add("grant_type", "refresh_token")
            .add("refresh_token", refreshToken)
            .build()
        val response = try {
            postForm(config.tokenEndpoint, form)
        } catch (_: IOException) {
            return RefreshOutcome.Transient(null)
        }
        if (response.code == 429 || response.code >= 500) return RefreshOutcome.Transient(response.code)
        if (response.code !in 200..299) {
            val error = parseError(response.body)?.error?.take(64)
            return when (error) {
                "invalid_grant" -> RefreshOutcome.InvalidGrant
                "invalid_client", "unauthorized_client" -> RefreshOutcome.ClientRejected(error)
                else -> RefreshOutcome.Rejected(response.code, error)
            }
        }
        val dto = parseToken(response.body)
        val access = dto?.accessToken
        if (dto == null || access.isNullOrEmpty()) return RefreshOutcome.Rejected(response.code, "malformed_response")
        val granted = dto.scope?.split(' ')?.filter { it.isNotEmpty() }?.toSet()?.takeIf { it.isNotEmpty() }
        return RefreshOutcome.Refreshed(
            StoredTokens(
                accessToken = access,
                // Google normally omits the refresh token on refresh; keep the one we have.
                refreshToken = dto.refreshToken?.takeIf { it.isNotEmpty() } ?: refreshToken,
                expiresAtMillis = clock.nowMillis() + (dto.expiresIn ?: DEFAULT_EXPIRES_IN_SECONDS) * 1000L,
                grantedScopes = granted ?: current.grantedScopes,
                clientId = config.clientId,
            ),
        )
    }

    /**
     * Revokes the grant at Google (best effort) and forgets the tokens locally. Local health data is
     * not touched. Returns true when Google confirmed the revocation.
     */
    suspend fun signOut(revokeAtGoogle: Boolean = true): Boolean = withContext(Dispatchers.IO) { signOutBlocking(revokeAtGoogle) }

    fun signOutBlocking(revokeAtGoogle: Boolean = true): Boolean {
        val tokens = tokenStore.load()
        var revoked = false
        val endpoint = config.revocationEndpoint
        if (revokeAtGoogle && tokens != null && endpoint != null) {
            val token = tokens.refreshToken ?: tokens.accessToken
            revoked = try {
                postForm(endpoint, FormBody.Builder().add("token", token).build()).code in 200..299
            } catch (_: IOException) {
                false
            }
        }
        tokenStore.clear()
        pendingStore.clearPending()
        return revoked
    }

    private class RawResponse(val code: Int, val body: String)

    @Throws(IOException::class)
    private fun postForm(url: String, form: FormBody): RawResponse {
        val request = Request.Builder().url(url).post(form).header("Accept", "application/json").build()
        httpClient.newCall(request).execute().use { response ->
            // Token responses are tiny; cap what is read so a hostile server cannot fill memory.
            return RawResponse(response.code, response.peekBody(MAX_BODY_BYTES).string())
        }
    }

    private fun parseToken(body: String): TokenResponseDto? =
        try { json.decodeFromString(TokenResponseDto.serializer(), body) } catch (_: Exception) { null }

    private fun parseError(body: String): TokenErrorDto? =
        try { json.decodeFromString(TokenErrorDto.serializer(), body) } catch (_: Exception) { null }

    companion object {
        const val DEFAULT_PENDING_TTL_MILLIS = 30 * 60 * 1000L
        private const val DEFAULT_EXPIRES_IN_SECONDS = 3600L
        private const val MAX_BODY_BYTES = 64L * 1024
    }
}
