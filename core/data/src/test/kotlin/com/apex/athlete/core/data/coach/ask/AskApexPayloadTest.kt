package com.apex.athlete.core.data.coach.ask

import com.apex.athlete.core.data.coach.CoachAdvice
import com.apex.athlete.core.data.coach.CoachBriefing
import com.apex.athlete.core.data.coach.CoachLine
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class AskApexPayloadTest {
    private val briefing = CoachBriefing(
        CoachAdvice.TRAIN_EASY, "Keep it easy today",
        listOf(CoachLine(CoachLine.Topic.RECOVERY, "Recovery is 31%. Your body is still recovering.", listOf("31")), CoachLine(CoachLine.Topic.TONIGHT, "Aim for 8 h 05 min of sleep tonight.", listOf("8", "05"))),
    )
    private val facts = listOf(AskFact(AskFactKind.RECOVERY, "31"), AskFact(AskFactKind.HRV, "48"), AskFact(AskFactKind.STRAIN, "7.5"), AskFact(AskFactKind.RESTING_HR, "5x; DROP"))
    private val p = AskApexPayload.build("  Should I run\ntoday? ", briefing, facts)

    @Test fun containsOnlyQuestionFactsAndBriefing() {
        val m = p.userMessage
        assertTrue(m.startsWith("Question: Should I run today?"))
        assertTrue("- Recovery: 31 %" in m && "- Strain so far today: 7.5 0-21" in m)
        assertFalse("DROP" in m, "non-numeric fact values are refused")
        assertFalse(Regex("""\d{4}-\d{2}-\d{2}""").containsMatchIn(m))
        assertFalse(Regex("""(?i)birth|born|@|\bage\b|name|http""").containsMatchIn(m))
        assertEquals(setOf("31", "48", "7.5", "8", "5"), p.allowedNumerals.minus("1").minus("2").let { it })
    }

    @Test fun previewShowsExactlyWhatIsSent() {
        assertTrue(p.userMessage in p.preview)
        assertTrue(p.system in p.preview)
        assertTrue("claude-opus-5-5" in p.preview)
    }

    @Test fun questionIsCapped() {
        assertTrue(AskApexPayload.build("x".repeat(5000), briefing, facts).userMessage.length < 1500)
    }

    @Test fun systemPromptForbidsDiagnosisAndInvention() {
        val s = AskApexPayload.SYSTEM_PROMPT.lowercase()
        assertTrue("never diagnose" in s && "invent" in s)
    }
}
