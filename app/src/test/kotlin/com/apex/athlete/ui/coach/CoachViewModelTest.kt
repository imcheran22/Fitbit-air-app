package com.apex.athlete.ui.coach

import androidx.lifecycle.SavedStateHandle
import com.apex.athlete.R
import com.apex.athlete.core.data.coach.CoachAdvice
import com.apex.athlete.core.data.coach.CoachBriefing
import com.apex.athlete.core.data.coach.CoachLine
import com.apex.athlete.core.data.coach.ask.AskApexAnswer
import com.apex.athlete.core.data.coach.ask.AskApexPayload
import com.apex.athlete.core.data.coach.ask.AskApexResult
import com.apex.athlete.core.data.coach.ask.AskFact
import com.apex.athlete.core.data.coach.ask.AskFactKind
import com.apex.athlete.core.data.coach.ask.InMemoryAiKeyStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class CoachViewModelTest {
    private val briefing = CoachBriefing(
        CoachAdvice.TRAIN_EASY, "Keep it light.",
        listOf(CoachLine(CoachLine.Topic.RECOVERY, "Recovery is 40%.", listOf("40"))),
    )
    private val ctx = CoachContext(briefing, listOf(AskFact(AskFactKind.RECOVERY, "40")))

    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun tearDown() = Dispatchers.resetMain()

    private class Calls { var count = 0; var payload: AskApexPayload? = null; var fallback: CoachBriefing? = null }

    private fun vm(
        keys: InMemoryAiKeyStore = InMemoryAiKeyStore("sk-test"),
        handle: SavedStateHandle = SavedStateHandle(),
        calls: Calls = Calls(),
        result: () -> AskApexResult = { AskApexResult.Answer(AskApexAnswer("Take it easy.")) },
    ) = CoachViewModel(
        context = flowOf(ctx),
        settingsAiEnabled = flowOf(true),
        keys = keys,
        ask = { p, f -> calls.count++; calls.payload = p; calls.fallback = f; result() },
        handle = handle,
        io = Dispatchers.Main,
    )

    /** Subscribing starts the WhileSubscribed upstream; the unconfined dispatcher delivers at once. */
    private fun CoachViewModel.warm() {
        CoroutineScope(Dispatchers.Main).launch { coachContext.collect { } }
    }

    @Test fun savingAKeyStoresItAndNeverExposesIt() {
        val keys = InMemoryAiKeyStore()
        val v = vm(keys = keys)
        assertFalse(v.keySaved.value)
        v.saveKey("  ")
        assertTrue(v.keyError.value)
        assertFalse(keys.has())
        v.saveKey("sk-abc")
        assertTrue(v.keySaved.value)
        assertTrue(keys.has())
        assertFalse(v.keyError.value)
    }

    @Test fun nothingIsSentBeforeConfirmation() {
        val calls = Calls()
        val v = vm(calls = calls); v.warm()
        v.setQuestion("Why is recovery low?")
        v.requestPreview()
        val phase = assertIs<AskPhase.Confirming>(v.phase.value)
        assertTrue(phase.payload.preview.contains("Why is recovery low?"))
        assertEquals(0, calls.count)
        v.cancelPreview()
        assertEquals(AskPhase.Idle, v.phase.value)
        assertEquals(0, calls.count)
    }

    @Test fun confirmSendsPreviewedPayloadWithFallbackAndShowsAnswer() {
        val calls = Calls()
        val v = vm(calls = calls); v.warm()
        v.setQuestion("Why?")
        v.requestPreview()
        val previewed = (v.phase.value as AskPhase.Confirming).payload
        v.confirmSend()
        assertEquals(1, calls.count)
        assertTrue(calls.payload === previewed)
        assertEquals(briefing, calls.fallback)
        val done = assertIs<AskPhase.Finished>(v.phase.value)
        assertIs<AskApexResult.Answer>(done.result)
    }

    @Test fun confirmWithoutPreviewDoesNothing() {
        val calls = Calls()
        val v = vm(calls = calls); v.warm()
        v.setQuestion("Why?")
        v.confirmSend()
        assertEquals(0, calls.count)
    }

    @Test fun cannotAskWithoutKeyOrQuestion() {
        val noKey = vm(keys = InMemoryAiKeyStore()); noKey.warm()
        noKey.setQuestion("Why?"); noKey.requestPreview()
        assertEquals(AskPhase.Idle, noKey.phase.value)
        val noQuestion = vm(); noQuestion.warm()
        noQuestion.setQuestion("   "); noQuestion.requestPreview()
        assertEquals(AskPhase.Idle, noQuestion.phase.value)
    }

    @Test fun clientExceptionBecomesUnavailableWithFallback() {
        val v = vm(result = { error("boom with secret") }); v.warm()
        v.setQuestion("Why?"); v.requestPreview(); v.confirmSend()
        val r = assertIs<AskPhase.Finished>(v.phase.value).result
        val u = assertIs<AskApexResult.Unavailable>(r)
        assertEquals(AskApexResult.Reason.UNKNOWN, u.reason)
        assertEquals("", u.message)
        assertEquals(briefing, u.fallback)
    }

    @Test fun answerAndQuestionSurviveProcessDeath() {
        val handle = SavedStateHandle()
        val first = vm(handle = handle, result = {
            AskApexResult.Answer(AskApexAnswer("It is 99.", unverifiedNumerals = listOf("99"), truncated = true))
        }); first.warm()
        first.setQuestion("Why?"); first.requestPreview(); first.confirmSend()
        val second = vm(handle = handle)
        assertEquals("Why?", second.question.value)
        val done = assertIs<AskPhase.Finished>(second.phase.value)
        val a = assertIs<AskApexResult.Answer>(done.result).answer
        assertEquals("It is 99.", a.text)
        assertEquals(listOf("99"), a.unverifiedNumerals)
        assertTrue(a.truncated)
    }

    @Test fun removeKeyClearsKeyAnswerAndPhase() {
        val keys = InMemoryAiKeyStore("sk-x")
        val handle = SavedStateHandle()
        val v = vm(keys = keys, handle = handle); v.warm()
        v.setQuestion("Why?"); v.requestPreview(); v.confirmSend()
        v.removeKey()
        assertFalse(keys.has())
        assertFalse(v.keySaved.value)
        assertEquals(AskPhase.Idle, v.phase.value)
        assertNull(handle.get<String>("coach_answer"))
    }

    @Test fun editingTheQuestionLeavesConfirmation() {
        val v = vm(); v.warm()
        v.setQuestion("a"); v.requestPreview()
        v.setQuestion("ab")
        assertEquals(AskPhase.Idle, v.phase.value)
    }

    @Test fun questionIsCapped() {
        val v = vm()
        v.setQuestion("x".repeat(AskApexPayload.MAX_QUESTION_CHARS + 50))
        assertEquals(AskApexPayload.MAX_QUESTION_CHARS, v.question.value.length)
    }

    @Test fun everyReasonHasCopy() {
        AskApexResult.Reason.values().forEach { unavailableCopy(it) }
        assertEquals(R.string.coach_unavailable_offline, unavailableCopy(AskApexResult.Reason.OFFLINE))
        assertNull(adviceCopy(CoachAdvice.NO_ADVICE))
    }
}
