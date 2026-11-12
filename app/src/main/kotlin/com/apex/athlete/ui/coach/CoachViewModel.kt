package com.apex.athlete.ui.coach

import androidx.annotation.StringRes
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.apex.athlete.R
import com.apex.athlete.core.data.coach.CoachAdvice
import com.apex.athlete.core.data.coach.CoachBriefing
import com.apex.athlete.core.data.coach.ask.AiKeyStore
import com.apex.athlete.core.data.coach.ask.AskApexAnswer
import com.apex.athlete.core.data.coach.ask.AskApexPayload
import com.apex.athlete.core.data.coach.ask.AskApexResult
import com.apex.athlete.core.data.coach.ask.AskFact
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** Today's briefing and the computed numbers that may accompany a question. */
data class CoachContext(val briefing: CoachBriefing, val facts: List<AskFact>)

/** The send seam. [com.apex.athlete.core.data.coach.ask.AskApexClient] is final, so the container passes `client::ask`. */
typealias AskFunction = suspend (AskApexPayload, CoachBriefing?) -> AskApexResult

sealed interface AskPhase {
    data object Idle : AskPhase

    /** The "what gets sent" preview is on screen; nothing has been sent. */
    data class Confirming(val payload: AskApexPayload) : AskPhase

    data object Sending : AskPhase
    data class Finished(val result: AskApexResult) : AskPhase
}

class CoachViewModel(
    context: Flow<CoachContext?>,
    val settingsAiEnabled: Flow<Boolean>,
    private val keys: AiKeyStore,
    private val ask: AskFunction,
    private val handle: SavedStateHandle,
) : ViewModel() {

    /** Null until the repository has answered: render Loading. */
    val coachContext: StateFlow<CoachContext?> = context
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val aiEnabled: StateFlow<Boolean> = settingsAiEnabled
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    private val _keySaved = MutableStateFlow(keys.has())
    val keySaved: StateFlow<Boolean> = _keySaved.asStateFlow()

    private val _question = MutableStateFlow(handle.get<String>(KEY_QUESTION).orEmpty())
    val question: StateFlow<String> = _question.asStateFlow()

    private val _phase = MutableStateFlow<AskPhase>(restoreAnswer()?.let { AskPhase.Finished(AskApexResult.Answer(it)) } ?: AskPhase.Idle)
    val phase: StateFlow<AskPhase> = _phase.asStateFlow()

    private val _keyError = MutableStateFlow(false)
    val keyError: StateFlow<Boolean> = _keyError.asStateFlow()

    fun setQuestion(text: String) {
        val t = text.take(AskApexPayload.MAX_QUESTION_CHARS)
        handle[KEY_QUESTION] = t
        _question.value = t
        if (_phase.value is AskPhase.Confirming) _phase.value = AskPhase.Idle
    }

    /** Saves the key into the key store. The key is never kept here and never shown back. */
    fun saveKey(key: String) {
        if (key.isBlank()) {
            _keyError.value = true
            return
        }
        keys.set(key)
        _keyError.value = false
        _keySaved.value = keys.has()
    }

    fun removeKey() {
        keys.clear()
        _keySaved.value = false
        _keyError.value = false
        clearAnswer()
        _phase.value = AskPhase.Idle
    }

    /** Builds the payload and shows the preview. Nothing is sent. */
    fun requestPreview() {
        val ctx = coachContext.value ?: return
        if (!canAsk() || _phase.value is AskPhase.Sending) return
        val payload = AskApexPayload.build(_question.value, ctx.briefing, ctx.facts)
        _phase.value = AskPhase.Confirming(payload)
    }

    fun cancelPreview() {
        if (_phase.value is AskPhase.Confirming) _phase.value = AskPhase.Idle
    }

    /** Sends exactly the previewed payload; only valid from the confirmation step. */
    fun confirmSend() {
        val current = _phase.value as? AskPhase.Confirming ?: return
        val fallback = coachContext.value?.briefing
        _phase.value = AskPhase.Sending
        clearAnswer()
        viewModelScope.launch {
            val result = try {
                ask(current.payload, fallback)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // No message from the exception: it must not carry anything from the request.
                AskApexResult.Unavailable(AskApexResult.Reason.UNKNOWN, "", fallback)
            }
            if (result is AskApexResult.Answer) saveAnswer(result.answer)
            _phase.value = AskPhase.Finished(result)
        }
    }

    fun dismissResult() {
        if (_phase.value is AskPhase.Finished) {
            clearAnswer()
            _phase.value = AskPhase.Idle
        }
    }

    fun canAsk(): Boolean = _keySaved.value && _question.value.isNotBlank()

    private fun saveAnswer(a: AskApexAnswer) {
        handle[KEY_ANSWER] = a.text
        handle[KEY_UNVERIFIED] = ArrayList(a.unverifiedNumerals)
        handle[KEY_TRUNCATED] = a.truncated
    }

    private fun clearAnswer() {
        handle.remove<String>(KEY_ANSWER)
        handle.remove<ArrayList<String>>(KEY_UNVERIFIED)
        handle.remove<Boolean>(KEY_TRUNCATED)
    }

    private fun restoreAnswer(): AskApexAnswer? {
        val text = handle.get<String>(KEY_ANSWER) ?: return null
        return AskApexAnswer(
            text = text,
            unverifiedNumerals = handle.get<ArrayList<String>>(KEY_UNVERIFIED).orEmpty(),
            truncated = handle.get<Boolean>(KEY_TRUNCATED) ?: false,
        )
    }

    private companion object {
        const val KEY_QUESTION = "coach_question"
        const val KEY_ANSWER = "coach_answer"
        const val KEY_UNVERIFIED = "coach_unverified"
        const val KEY_TRUNCATED = "coach_truncated"
    }
}

/** Calm copy for each reason an answer could not be produced. The client's own English message is not shown. */
@StringRes
fun unavailableCopy(reason: AskApexResult.Reason): Int = when (reason) {
    AskApexResult.Reason.NOT_ENABLED -> R.string.coach_unavailable_not_enabled
    AskApexResult.Reason.NO_KEY -> R.string.coach_unavailable_no_key
    AskApexResult.Reason.KEY_REJECTED -> R.string.coach_unavailable_key_rejected
    AskApexResult.Reason.RATE_LIMITED -> R.string.coach_unavailable_rate_limited
    AskApexResult.Reason.OFFLINE -> R.string.coach_unavailable_offline
    AskApexResult.Reason.SERVER_ERROR -> R.string.coach_unavailable_server
    AskApexResult.Reason.BAD_REQUEST -> R.string.coach_unavailable_bad_request
    AskApexResult.Reason.EMPTY_ANSWER -> R.string.coach_unavailable_empty
    AskApexResult.Reason.UNKNOWN -> R.string.coach_unavailable_unknown
}

@StringRes
fun adviceCopy(advice: CoachAdvice): Int? = when (advice) {
    CoachAdvice.TRAIN_HARD -> R.string.coach_advice_hard
    CoachAdvice.TRAIN_MODERATE -> R.string.coach_advice_moderate
    CoachAdvice.TRAIN_EASY -> R.string.coach_advice_easy
    CoachAdvice.REST_OR_DEFER -> R.string.coach_advice_rest
    CoachAdvice.NO_ADVICE -> null
}
