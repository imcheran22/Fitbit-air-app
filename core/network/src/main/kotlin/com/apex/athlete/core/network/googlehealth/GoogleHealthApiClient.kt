package com.apex.athlete.core.network.googlehealth

import com.apex.athlete.core.network.NetworkJson
import com.apex.athlete.core.network.Sleeper
import com.apex.athlete.core.network.auth.AuthState
import com.apex.athlete.core.network.auth.ReauthRequiredException
import com.apex.athlete.core.network.auth.TokenStore
import com.apex.athlete.core.network.rate.BudgetDecision
import com.apex.athlete.core.network.rate.RateLimitTracker
import com.apex.athlete.core.network.rate.RequestPriority
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.IOException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

data class GoogleHealthClientConfig(
    val baseUrl: String = "https://health.googleapis.com/",
    /** `me` or the numeric Health user id from `getIdentity`. */
    val userId: String = "me",
    /** Retries after the first attempt, for 5xx, 429 and network failures. */
    val maxRetries: Int = 3,
    /** Longest pause the client sits through itself; longer waits are returned as [GoogleHealthError.RateLimited]. */
    val maxInlineWaitMillis: Long = 15_000L,
    val maxBudgetWaitRounds: Int = 5,
    /** Hard stop for one paginated read. */
    val maxPages: Int = 2_000,
    val maxBodyBytes: Long = 32L * 1024 * 1024,
    /** Tests only: allow a plain-HTTP mock server. Never set in the app. */
    val allowInsecureHttp: Boolean = false,
) {
    init {
        require(userId.isNotEmpty() && userId.all { it.isLetterOrDigit() || it == '-' }) { "invalid user id" }
        require(maxRetries >= 0 && maxPages > 0)
    }
}

/** One list or reconcile query. */
data class ListRequest(
    val dataType: GoogleHealthDataType,
    /** See [GoogleHealthFilter]. */
    val filter: String? = null,
    /** Null lets the server choose (1440; 25 for sleep and exercise). Clamped to the type's maximum. */
    val pageSize: Int? = null,
    val dataSourceFamily: DataSourceFamily? = null,
    /** Use `dataPoints:reconcile` (one merged stream) instead of `dataPoints` (every source). */
    val reconcile: Boolean = false,
    val priority: RequestPriority = RequestPriority.BACKGROUND,
    /** Resume a read from a token saved earlier. */
    val startPageToken: String? = null,
)

/**
 * Read-only client for the Google Health API v4.
 *
 * Only `GET` requests are ever built. Authentication is done by the OkHttp client passed in (see
 * `NetworkModule`): this class never touches tokens except to name a missing scope. Nothing here
 * logs; errors are [GoogleHealthError] values that contain no body, URL, token or health value.
 */
class GoogleHealthApiClient(
    private val httpClient: OkHttpClient,
    private val tokenStore: TokenStore,
    private val rateLimiter: RateLimitTracker,
    private val config: GoogleHealthClientConfig = GoogleHealthClientConfig(),
    private val sleeper: Sleeper = Sleeper.Real,
    private val json: Json = NetworkJson.instance,
) {
    private val baseUrl: HttpUrl = config.baseUrl.toHttpUrl().also {
        require(it.isHttps || config.allowInsecureHttp) { "the API base URL must be https" }
    }

    /** One page. Empty pages are `Success`; only a 404 is `NoData`. */
    suspend fun listPage(request: ListRequest, pageToken: String? = request.startPageToken): ApiResult<DataPointsPage> {
        val url = dataPointsUrl(request, pageToken)
        return when (val raw = execute(url, request.priority, request.dataType)) {
            is Raw.Fail -> ApiResult.Failure(raw.error)
            Raw.Empty -> ApiResult.NoData
            is Raw.Ok -> parsePage(raw.body)
        }
    }

    /**
     * Reads every page, handing each to [onPage] as soon as it arrives so the caller can commit it.
     * Stops when the server sends no further token, repeats a token, or the page cap is hit.
     * Returns [ApiResult.NoData] when nothing came back at all. A failure part-way leaves the
     * earlier pages with the caller; this function does not undo them.
     */
    suspend fun forEachPage(request: ListRequest, onPage: suspend (DataPointsPage) -> Unit): ApiResult<PageReadSummary> {
        val seenTokens = HashSet<String>()
        var token = request.startPageToken
        token?.let { seenTokens.add(it) }
        var pages = 0
        var parsed = 0
        var dropped = 0
        var stop: PageStopReason
        while (true) {
            when (val result = listPage(request, token)) {
                is ApiResult.Failure -> return result
                ApiResult.NoData -> {
                    if (pages == 0) return ApiResult.NoData
                    stop = PageStopReason.PAGE_NOT_FOUND
                    break
                }
                is ApiResult.Success -> {
                    val page = result.value
                    pages++
                    parsed += page.dataPoints.size
                    dropped += page.malformedCount
                    if (page.receivedCount > 0) onPage(page)
                    val next = page.nextPageToken
                    if (next == null) {
                        stop = PageStopReason.COMPLETE
                        break
                    }
                    if (!seenTokens.add(next)) {
                        stop = PageStopReason.REPEATED_TOKEN
                        break
                    }
                    if (pages >= config.maxPages) {
                        stop = PageStopReason.PAGE_CAP
                        break
                    }
                    token = next
                }
            }
        }
        if (parsed == 0 && dropped == 0) return ApiResult.NoData
        if (parsed == 0) return ApiResult.Failure(GoogleHealthError.ParseFailure(0, dropped, 0))
        return ApiResult.Success(PageReadSummary(pages, parsed, dropped, stop))
    }

    /** Convenience: collects all pages in memory. Prefer [forEachPage] for large reads. */
    suspend fun readAll(request: ListRequest): ApiResult<List<DataPoint>> {
        val all = ArrayList<DataPoint>()
        return when (val result = forEachPage(request) { all.addAll(it.dataPoints) }) {
            is ApiResult.Failure -> result
            ApiResult.NoData -> ApiResult.NoData
            is ApiResult.Success -> ApiResult.Success(all)
        }
    }

    /** `users/{user}/identity`. Needs any of the granted Google Health scopes. */
    suspend fun getIdentity(priority: RequestPriority = RequestPriority.FOREGROUND): ApiResult<GhIdentity> {
        val url = baseUrl.newBuilder().addPathSegment("v4").addPathSegment("users").addPathSegment(config.userId)
            .addPathSegment("identity").build()
        return when (val raw = execute(url, priority, null)) {
            is Raw.Fail -> ApiResult.Failure(raw.error)
            Raw.Empty -> ApiResult.NoData
            is Raw.Ok -> decode(GhIdentity.serializer(), raw.body)
        }
    }

    /** `users/{user}/pairedDevices` (needs the settings read scope), following page tokens. */
    suspend fun listPairedDevices(priority: RequestPriority = RequestPriority.FOREGROUND): ApiResult<List<GhPairedDevice>> {
        val devices = ArrayList<GhPairedDevice>()
        val seen = HashSet<String>()
        var token: String? = null
        var pages = 0
        while (true) {
            val url = baseUrl.newBuilder().addPathSegment("v4").addPathSegment("users").addPathSegment(config.userId)
                .addPathSegment("pairedDevices")
                .apply { token?.let { addQueryParameter("pageToken", it) } }
                .build()
            when (val raw = execute(url, priority, null)) {
                is Raw.Fail -> return ApiResult.Failure(raw.error)
                Raw.Empty -> break
                is Raw.Ok -> when (val page = decode(GhListPairedDevicesResponse.serializer(), raw.body)) {
                    is ApiResult.Failure -> return page
                    ApiResult.NoData -> break
                    is ApiResult.Success -> {
                        devices += page.value.pairedDevices
                        val next = page.value.nextPageToken?.takeIf { it.isNotEmpty() }
                        pages++
                        if (next == null || !seen.add(next) || pages >= config.maxPages) break
                        token = next
                    }
                }
            }
        }
        return if (devices.isEmpty()) ApiResult.NoData else ApiResult.Success(devices)
    }

    // ---- request building ---------------------------------------------------------------------

    private fun dataPointsUrl(request: ListRequest, pageToken: String?): HttpUrl {
        val builder = baseUrl.newBuilder()
            .addPathSegment("v4")
            .addPathSegment("users")
            .addPathSegment(config.userId)
            .addPathSegment("dataTypes")
            .addPathSegment(request.dataType.id)
            .addPathSegment(if (request.reconcile) "dataPoints:reconcile" else "dataPoints")
        request.filter?.takeIf { it.isNotBlank() }?.let { builder.addQueryParameter("filter", it) }
        request.dataType.clampPageSize(request.pageSize)?.let { builder.addQueryParameter("pageSize", it.toString()) }
        request.dataSourceFamily?.let {
            builder.addQueryParameter("dataSourceFamily", "users/${config.userId}/dataSourceFamilies/${it.id}")
        }
        pageToken?.takeIf { it.isNotEmpty() }?.let { builder.addQueryParameter("pageToken", it) }
        return builder.build()
    }

    // ---- execution with budget, retry and error mapping ----------------------------------------

    private sealed interface Raw {
        data class Ok(val body: String) : Raw
        data object Empty : Raw
        data class Fail(val error: GoogleHealthError) : Raw
    }

    private suspend fun execute(url: HttpUrl, priority: RequestPriority, dataType: GoogleHealthDataType?): Raw {
        var attempt = 0
        while (true) {
            // 1. Shared request budget.
            var rounds = 0
            while (true) {
                when (val decision = rateLimiter.tryAcquire(priority)) {
                    BudgetDecision.Granted -> break
                    is BudgetDecision.Wait -> {
                        if (decision.millis > config.maxInlineWaitMillis || ++rounds > config.maxBudgetWaitRounds) {
                            return Raw.Fail(GoogleHealthError.RateLimited(decision.millis))
                        }
                        sleeper.sleep(decision.millis)
                    }
                }
            }
            // 2. The call itself.
            val request = Request.Builder().url(url).get().header("Accept", "application/json").build()
            val response = try {
                httpClient.newCall(request).await()
            } catch (e: ReauthRequiredException) {
                return Raw.Fail(GoogleHealthError.AuthExpired(e.reason ?: currentReauthReason()))
            } catch (e: IOException) {
                if (attempt >= config.maxRetries) return Raw.Fail(GoogleHealthError.Network(attempt + 1))
                sleeper.sleep(rateLimiter.backoffMillis(attempt))
                attempt++
                continue
            }
            // 3. Map the answer.
            response.use { r ->
                rateLimiter.onResponse(r.headers)
                val code = r.code
                when {
                    code == 204 -> return Raw.Empty
                    code in 200..299 -> {
                        val body = readBody(r)
                        if (body != null) return body
                        // The connection broke while the body was arriving: treat as a network failure and retry.
                        if (attempt >= config.maxRetries) return Raw.Fail(GoogleHealthError.Network(attempt + 1))
                        sleeper.sleep(rateLimiter.backoffMillis(attempt))
                    }
                    code == 401 -> return Raw.Fail(GoogleHealthError.AuthExpired(currentReauthReason()))
                    code == 403 -> return Raw.Fail(permissionDenied(r, dataType))
                    code == 404 -> return Raw.Empty
                    code == 429 -> {
                        val retryAfter = rateLimiter.parseRetryAfter(r.header("Retry-After"))
                        val wait = rateLimiter.backoffMillis(attempt, retryAfter)
                        rateLimiter.onRateLimited(wait)
                        if (attempt >= config.maxRetries || wait > config.maxInlineWaitMillis) {
                            return Raw.Fail(GoogleHealthError.RateLimited(wait))
                        }
                        // Falls through to the next loop turn, where the budget waits out the pause.
                    }
                    code in 500..599 -> {
                        if (attempt >= config.maxRetries) return Raw.Fail(GoogleHealthError.ServerError(code, attempt + 1))
                        sleeper.sleep(rateLimiter.backoffMillis(attempt, rateLimiter.parseRetryAfter(r.header("Retry-After"))))
                    }
                    code in 400..499 -> return Raw.Fail(GoogleHealthError.BadRequest(code, errorStatus(r)))
                    else -> return Raw.Fail(GoogleHealthError.Unexpected(code))
                }
            }
            attempt++
        }
    }

    /** The body as [Raw], or null if the connection failed before all of it arrived (never partial data). */
    private fun readBody(response: Response): Raw? {
        val body = response.body ?: return Raw.Empty
        return try {
            val declared = body.contentLength()
            if (declared > config.maxBodyBytes) return Raw.Fail(GoogleHealthError.ParseFailure(0, 0, Int.MAX_VALUE))
            val text = body.source().use { source ->
                source.request(config.maxBodyBytes + 1)
                if (source.buffer.size > config.maxBodyBytes) return Raw.Fail(GoogleHealthError.ParseFailure(0, 0, Int.MAX_VALUE))
                source.readUtf8()
            }
            if (text.isBlank()) Raw.Empty else Raw.Ok(text)
        } catch (_: IOException) {
            null
        }
    }

    private fun currentReauthReason() = (tokenStore.currentState() as? AuthState.NeedsReauth)?.reason

    // ---- error bodies --------------------------------------------------------------------------

    private class ErrorInfo(val status: String?, val reason: String?, val scope: String?)

    private fun readErrorInfo(response: Response): ErrorInfo {
        val text = try { response.peekBody(ERROR_BODY_LIMIT).string() } catch (_: IOException) { "" }
        var status: String? = null
        var reason: String? = null
        var scope: String? = null
        try {
            val error = (json.parseToJsonElement(text) as? JsonObject)?.get("error") as? JsonObject
            status = sanitizeCode((error?.get("status") as? JsonPrimitive)?.contentOrNull)
            val details = error?.get("details") as? JsonArray
            reason = details?.firstNotNullOfOrNull { sanitizeCode(((it as? JsonObject)?.get("reason") as? JsonPrimitive)?.contentOrNull) }
            // Google sometimes names the needed scope in the message or error details; only the scope URL is kept.
            val haystack = ((error?.get("message") as? JsonPrimitive)?.contentOrNull.orEmpty()) + " " + (details?.toString().orEmpty())
            scope = firstReadScope(haystack)
        } catch (_: Exception) {
            // Not JSON: fall through with whatever the header says.
        }
        if (scope == null) {
            response.header("WWW-Authenticate")?.let { header ->
                SCOPE_PARAM.find(header)?.groupValues?.get(1)?.let { scope = firstReadScope(it) }
            }
        }
        return ErrorInfo(status, reason, scope)
    }

    private fun errorStatus(response: Response): String? = readErrorInfo(response).status

    private fun permissionDenied(response: Response, dataType: GoogleHealthDataType?): GoogleHealthError {
        val info = readErrorInfo(response)
        val candidates = dataType?.scopeCandidates.orEmpty()
        var scope = info.scope
        var inferred = false
        if (scope == null && candidates.isNotEmpty()) {
            val granted = tokenStore.load()?.grantedScopes.orEmpty()
            // Only claim a missing scope when we know what was granted and none of the likely ones was.
            if (granted.isNotEmpty() && candidates.none { it in granted }) {
                scope = candidates.first()
                inferred = true
            }
        }
        return GoogleHealthError.PermissionDenied(scope, inferred, candidates, info.reason ?: info.status)
    }

    private fun firstReadScope(text: String): String? =
        SCOPE_URL.findAll(text).map { it.value.trimEnd('.', ',') }.firstOrNull { it.endsWith(".readonly") }

    private fun sanitizeCode(value: String?): String? = value?.takeIf { SAFE_CODE.matches(it) }

    // ---- parsing -------------------------------------------------------------------------------

    private fun parsePage(body: String): ApiResult<DataPointsPage> {
        val root = try {
            json.parseToJsonElement(body) as? JsonObject
        } catch (_: Exception) {
            null
        } ?: return ApiResult.Failure(GoogleHealthError.ParseFailure(0, 0, body.length))
        val rawItems = root["dataPoints"]
        if (rawItems != null && rawItems !is JsonArray && rawItems !is kotlinx.serialization.json.JsonNull) {
            return ApiResult.Failure(GoogleHealthError.ParseFailure(0, 0, body.length))
        }
        val items = (rawItems as? JsonArray).orEmpty()
        val points = ArrayList<DataPoint>(items.size)
        var malformed = 0
        for (item in items) {
            try {
                points += json.decodeFromJsonElement(DataPoint.serializer(), item)
            } catch (_: Exception) {
                malformed++
            }
        }
        val next = (root["nextPageToken"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotEmpty() }
        return ApiResult.Success(DataPointsPage(points, next, items.size, malformed))
    }

    private fun <T> decode(serializer: KSerializer<T>, body: String): ApiResult<T> = try {
        ApiResult.Success(json.decodeFromString(serializer, body))
    } catch (_: Exception) {
        ApiResult.Failure(GoogleHealthError.ParseFailure(0, 0, body.length))
    }

    private suspend fun Call.await(): Response = suspendCancellableCoroutine { cont ->
        cont.invokeOnCancellation { cancel() }
        enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                if (cont.isActive) cont.resumeWithException(e)
            }

            override fun onResponse(call: Call, response: Response) {
                cont.resume(response) { response.close() }
            }
        })
    }

    private companion object {
        const val ERROR_BODY_LIMIT = 16L * 1024
        val SAFE_CODE = Regex("^[A-Za-z0-9_]{1,64}$")
        val SCOPE_URL = Regex("https://www\\.googleapis\\.com/auth/googlehealth\\.[A-Za-z0-9_.]+")
        val SCOPE_PARAM = Regex("scope=\"([^\"]+)\"")
    }
}
