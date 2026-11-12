package com.apex.athlete.core.data.coach.ask

import com.anthropic.client.AnthropicClient
import com.anthropic.client.okhttp.AnthropicOkHttpClient
import com.anthropic.errors.AnthropicException
import com.anthropic.errors.AnthropicIoException
import com.anthropic.errors.AnthropicRetryableException
import com.anthropic.errors.AnthropicServiceException
import com.anthropic.errors.BadRequestException
import com.anthropic.errors.NotFoundException
import com.anthropic.errors.PermissionDeniedException
import com.anthropic.errors.RateLimitException
import com.anthropic.errors.UnauthorizedException
import com.anthropic.errors.UnprocessableEntityException
import com.anthropic.models.beta.AnthropicBeta
import com.anthropic.models.beta.messages.BetaOutputConfig
import com.anthropic.models.messages.MessageCreateParams
import com.anthropic.models.messages.OutputConfig
import com.apex.athlete.core.data.coach.CoachBriefing
import com.apex.athlete.core.domain.DataProvenance
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.Duration
import java.io.IOException
import java.io.UncheckedIOException

/** A model answer, always labelled as AI text. */
data class AskApexAnswer(
    val text: String,
    val provenance: DataProvenance = DataProvenance.AI_INTERPRETED,
    /** Numbers in [text] that were not in what was sent. Non-empty means: show the warning chip. */
    val unverifiedNumerals: List<String> = emptyList(),
    /** The model stopped at the length limit; the text may end early. */
    val truncated: Boolean = false,
) {
    val hasWarning: Boolean get() = unverifiedNumerals.isNotEmpty()
}

sealed interface AskApexResult {
    data class Answer(val answer: AskApexAnswer) : AskApexResult

    /** The model declined to answer. [message] is plain; [category] is the provider's label when given. */
    data class Refused(val message: String, val category: String?) : AskApexResult

    /** No answer. [message] is ready to show; [fallback] is the rule-based briefing to show instead. */
    data class Unavailable(val reason: Reason, val message: String, val fallback: CoachBriefing?) : AskApexResult

    enum class Reason { NOT_ENABLED, NO_KEY, KEY_REJECTED, RATE_LIMITED, OFFLINE, SERVER_ERROR, BAD_REQUEST, EMPTY_ANSWER, UNKNOWN }
}

/** What came back, reduced to the parts we use (and to plain strings, so unknown values cannot throw). */
internal data class RawReply(val stopReason: String?, val refusalCategory: String?, val texts: List<String>)

/**
 * Ask Apex: one question, one reply, through Anthropic's official Java SDK.
 *
 * Off by default. Nothing is sent unless **all three** hold: the owner switched the AI coach on
 * ([isEnabled]), saved a key ([keys]), and tapped send (this is only called from that tap, with a
 * payload whose preview they saw). The only host contacted is the SDK's default, api.anthropic.com
 * (`baseUrlOverride` exists for tests only). The key is read for the request and never logged.
 *
 * Request: model from the payload, 2000 tokens, effort LOW. No `thinking` parameter is sent (the
 * model thinks adaptively; setting it returns an error). Server-side refusal fallbacks (beta
 * `server-side-fallback-2026-07-01`, `fallbacks: default`) are requested when [useServerFallbacks]
 * is true; if the beta request is rejected as a bad request or not permitted, the same question is
 * retried once on the standard endpoint.
 *
 * Reply: `stop_reason` is checked before any content is read. A refusal shows a plain message. Every
 * error degrades to the rule-based briefing ([AskApexResult.Unavailable.fallback]). Answers carry
 * [DataProvenance.AI_INTERPRETED] and are checked for numbers that were not sent.
 */
class AskApexClient(
    private val keys: AiKeyStore,
    private val isEnabled: () -> Boolean,
    private val useServerFallbacks: Boolean = true,
    private val timeout: Duration = Duration.ofSeconds(60),
    private val baseUrlOverride: String? = null,
    private val io: CoroutineDispatcher = Dispatchers.IO,
) {
    suspend fun ask(payload: AskApexPayload, fallback: CoachBriefing? = null): AskApexResult {
        if (!isEnabled()) return unavailable(AskApexResult.Reason.NOT_ENABLED, "The AI coach is switched off. The rule-based briefing is shown.", fallback)
        val key = keys.get() ?: return unavailable(AskApexResult.Reason.NO_KEY, "No API key is saved. The rule-based briefing is shown.", fallback)
        return withContext(io) {
            try {
                interpret(send(key, payload), payload, fallback)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                map(e, fallback)
            }
        }
    }

    // --- Transport ---------------------------------------------------------------------------

    private fun newClient(key: String): AnthropicClient =
        AnthropicOkHttpClient.builder()
            .apiKey(key)
            .timeout(timeout)
            .maxRetries(1)
            .apply { baseUrlOverride?.let { baseUrl(it) } }
            .build()

    private fun send(key: String, payload: AskApexPayload): RawReply {
        val client = newClient(key)
        try {
            if (useServerFallbacks) {
                try {
                    return sendBeta(client, payload)
                } catch (e: BadRequestException) {
                } catch (e: NotFoundException) {
                } catch (e: PermissionDeniedException) {
                } catch (e: UnprocessableEntityException) {
                }
                // The beta was not accepted for this key or model: ask the standard endpoint instead.
            }
            return sendStandard(client, payload)
        } finally {
            try { client.close() } catch (_: Exception) {}
        }
    }

    internal fun standardParams(p: AskApexPayload): MessageCreateParams =
        MessageCreateParams.builder()
            .model(p.model)
            .maxTokens(MAX_TOKENS)
            .system(p.system)
            .addUserMessage(p.userMessage)
            .outputConfig(OutputConfig.builder().effort(OutputConfig.Effort.LOW).build())
            .build()

    internal fun betaParams(p: AskApexPayload): com.anthropic.models.beta.messages.MessageCreateParams =
        com.anthropic.models.beta.messages.MessageCreateParams.builder()
            .model(p.model)
            .maxTokens(MAX_TOKENS)
            .system(p.system)
            .addUserMessage(p.userMessage)
            .outputConfig(BetaOutputConfig.builder().effort(BetaOutputConfig.Effort.LOW).build())
            .addBeta(AnthropicBeta.SERVER_SIDE_FALLBACK_2026_07_01)
            .fallbacksDefault()
            .build()

    private fun sendStandard(client: AnthropicClient, p: AskApexPayload): RawReply {
        val response = client.messages().create(standardParams(p))
        return RawReply(
            stopReason = response.stopReason().map { it.asString() }.orElse(null),
            refusalCategory = response.stopDetails().flatMap { it.category() }.map { it.asString() }.orElse(null),
            texts = response.content().flatMap { block -> block.text().map { listOf(it.text()) }.orElse(emptyList()) },
        )
    }

    private fun sendBeta(client: AnthropicClient, p: AskApexPayload): RawReply {
        val response = client.beta().messages().create(betaParams(p))
        return RawReply(
            stopReason = response.stopReason().map { it.asString() }.orElse(null),
            refusalCategory = response.stopDetails().flatMap { it.category() }.map { it.asString() }.orElse(null),
            texts = response.content().flatMap { block -> block.text().map { listOf(it.text()) }.orElse(emptyList()) },
        )
    }

    // --- Reply -------------------------------------------------------------------------------

    private fun interpret(r: RawReply, payload: AskApexPayload, fallback: CoachBriefing?): AskApexResult {
        // Stop reason first: a refusal has no usable content, whatever else is in the reply.
        if (r.stopReason == STOP_REFUSAL) {
            return AskApexResult.Refused("The model declined to answer this. The rule-based briefing is shown.", r.refusalCategory)
        }
        val text = r.texts.joinToString("\n").trim()
        if (text.isEmpty()) {
            val why = if (r.stopReason == STOP_MAX_TOKENS) "The answer was cut off before it started." else "The model returned no text."
            return unavailable(AskApexResult.Reason.EMPTY_ANSWER, "$why The rule-based briefing is shown.", fallback)
        }
        return AskApexResult.Answer(
            AskApexAnswer(
                text = text,
                unverifiedNumerals = NumeralCheck.unverified(text, payload.allowedNumerals),
                truncated = r.stopReason == STOP_MAX_TOKENS,
            ),
        )
    }

    private fun map(e: Exception, fallback: CoachBriefing?): AskApexResult {
        val (reason, msg) = when (e) {
            is UnauthorizedException -> AskApexResult.Reason.KEY_REJECTED to "Anthropic rejected the saved key. Check it in Settings."
            is PermissionDeniedException -> AskApexResult.Reason.KEY_REJECTED to "The saved key is not allowed to use this model. Check it in Settings."
            is RateLimitException -> AskApexResult.Reason.RATE_LIMITED to "Too many requests right now. Try again in a minute."
            is AnthropicServiceException -> classifyService(e)
            is AnthropicIoException, is AnthropicRetryableException, is IOException, is UncheckedIOException ->
                AskApexResult.Reason.OFFLINE to "Offline."
            is AnthropicException -> AskApexResult.Reason.UNKNOWN to "The answer could not be read."
            else -> AskApexResult.Reason.UNKNOWN to "Something went wrong."
        }
        return unavailable(reason, "$msg The rule-based briefing is shown.", fallback)
    }

    private fun classifyService(e: AnthropicServiceException): Pair<AskApexResult.Reason, String> {
        val type = e.errorType().map { it.asString() }.orElse(null)
        return when {
            e.statusCode() == 401 || type == "authentication_error" -> AskApexResult.Reason.KEY_REJECTED to "Anthropic rejected the saved key. Check it in Settings."
            e.statusCode() == 403 || type == "permission_error" -> AskApexResult.Reason.KEY_REJECTED to "The saved key is not allowed to use this model. Check it in Settings."
            e.statusCode() == 429 || type == "rate_limit_error" -> AskApexResult.Reason.RATE_LIMITED to "Too many requests right now. Try again in a minute."
            e.statusCode() >= 500 || type == "overloaded_error" || type == "api_error" -> AskApexResult.Reason.SERVER_ERROR to "Anthropic is busy or unavailable."
            e.statusCode() in 400..499 -> AskApexResult.Reason.BAD_REQUEST to "The request was not accepted."
            else -> AskApexResult.Reason.UNKNOWN to "Something went wrong."
        }
    }

    private fun unavailable(reason: AskApexResult.Reason, message: String, fallback: CoachBriefing?) =
        AskApexResult.Unavailable(reason, message, fallback)

    companion object {
        const val MAX_TOKENS = 2000L
        private const val STOP_REFUSAL = "refusal"
        private const val STOP_MAX_TOKENS = "max_tokens"
    }
}
