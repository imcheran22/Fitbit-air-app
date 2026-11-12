package com.apex.athlete.core.data.coach.ask

import com.apex.athlete.core.data.coach.CoachAdvice
import com.apex.athlete.core.data.coach.CoachBriefing
import com.apex.athlete.core.domain.DataProvenance
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.After
import org.junit.Before
import java.time.Duration
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class AskApexClientTest {
    private lateinit var server: MockWebServer
    private val briefing = CoachBriefing(CoachAdvice.TRAIN_EASY, "Keep it easy today", emptyList())
    private val payload = AskApexPayload.build("Why?", briefing, listOf(AskFact(AskFactKind.RECOVERY, "31")))

    @Before fun up() { server = MockWebServer().also { it.start() } }
    @After fun down() = server.shutdown()

    private fun client(key: String? = "sk-test-key", enabled: Boolean = true, fallbacks: Boolean = false) =
        AskApexClient(InMemoryAiKeyStore(key), { enabled }, fallbacks, Duration.ofSeconds(5), server.url("/").toString().trimEnd('/'))

    private fun msg(stop: String, text: String = "", extra: String = "") = MockResponse().setHeader("content-type", "application/json").setBody(
        """{"id":"msg_1","type":"message","role":"assistant","model":"claude-opus-5-5","content":[{"type":"thinking","thinking":"hm","signature":"s"}${if (text.isNotEmpty()) """,{"type":"text","text":"$text"}""" else ""}],"stop_reason":"$stop","stop_sequence":null,"usage":{"input_tokens":10,"output_tokens":5}$extra}""",
    )

    private fun ask(c: AskApexClient) = runBlocking { c.ask(payload, briefing) }

    @Test fun successfulAnswerIsAiLabelledAndNumeralChecked() {
        server.enqueue(msg("end_turn", "Recovery is 31 so rest. Expect 77 tomorrow."))
        val r = assertIs<AskApexResult.Answer>(ask(client()))
        assertEquals(DataProvenance.AI_INTERPRETED, r.answer.provenance)
        assertEquals(listOf("77"), r.answer.unverifiedNumerals)
        assertTrue(r.answer.hasWarning)
        val req = server.takeRequest()
        assertTrue("sk-test-key" in (req.getHeader("Authorization") ?: req.getHeader("x-api-key") ?: ""))
        val body = req.body.readUtf8()
        assertTrue("\"model\":\"claude-opus-5-5\"" in body && "\"max_tokens\":2000" in body)
        assertTrue("\"effort\":\"low\"" in body)
        assertFalse("\"thinking\"" in body)
        assertFalse("sk-test-key" in body)
        assertEquals("/v1/messages", req.path)
    }

    @Test fun refusalShowsPlainMessageEvenIfTextPresent() {
        server.enqueue(msg("refusal", "partial", ""","stop_details":{"type":"refusal","category":"general_harms","explanation":"x"}"""))
        val r = assertIs<AskApexResult.Refused>(ask(client()))
        assertEquals("general_harms", r.category)
    }

    @Test fun notEnabledOrNoKeyNeverTouchesTheNetwork() {
        assertEquals(AskApexResult.Reason.NOT_ENABLED, assertIs<AskApexResult.Unavailable>(ask(client(enabled = false))).reason)
        assertEquals(AskApexResult.Reason.NO_KEY, assertIs<AskApexResult.Unavailable>(ask(client(key = null))).reason)
        assertEquals(0, server.requestCount)
    }

    private fun err(code: Int, type: String) = MockResponse().setResponseCode(code).setHeader("content-type", "application/json")
        .setBody("""{"type":"error","error":{"type":"$type","message":"m"}}""")

    @Test fun errorsMapAndFallBackToTheBriefing() {
        fun reason(code: Int, type: String): AskApexResult.Unavailable {
            repeat(3) { server.enqueue(err(code, type)) }
            val r = assertIs<AskApexResult.Unavailable>(ask(client()))
            assertNotNull(r.fallback); assertTrue("rule-based briefing" in r.message)
            server.shutdown(); server = MockWebServer().also { it.start() }
            return r
        }
        assertEquals(AskApexResult.Reason.KEY_REJECTED, reason(401, "authentication_error").reason)
        assertTrue("key" in reason(401, "authentication_error").message.lowercase())
        assertEquals(AskApexResult.Reason.RATE_LIMITED, reason(429, "rate_limit_error").reason)
        assertEquals(AskApexResult.Reason.SERVER_ERROR, reason(500, "api_error").reason)
        assertEquals(AskApexResult.Reason.BAD_REQUEST, reason(400, "invalid_request_error").reason)
    }

    @Test fun offlineMapsToOffline() {
        server.shutdown()
        val r = assertIs<AskApexResult.Unavailable>(ask(client()))
        assertEquals(AskApexResult.Reason.OFFLINE, r.reason)
        assertTrue("Offline" in r.message)
    }

    @Test fun maxTokensWithNoTextIsEmptyAnswer() {
        server.enqueue(msg("max_tokens"))
        assertEquals(AskApexResult.Reason.EMPTY_ANSWER, assertIs<AskApexResult.Unavailable>(ask(client())).reason)
    }

    @Test fun betaFallbackRequestedThenStandardEndpointOnRejection() {
        server.enqueue(err(400, "invalid_request_error"))
        server.enqueue(msg("end_turn", "Rest, recovery 31."))
        assertIs<AskApexResult.Answer>(ask(client(fallbacks = true)))
        val beta = server.takeRequest()
        assertTrue("server-side-fallback-2026-07-01" in (beta.getHeader("anthropic-beta") ?: ""))
        assertTrue("\"fallbacks\"" in beta.body.readUtf8())
        assertEquals("/v1/messages", beta.path)
        val std = server.takeRequest()
        assertEquals(null, std.getHeader("anthropic-beta"))
    }
}
