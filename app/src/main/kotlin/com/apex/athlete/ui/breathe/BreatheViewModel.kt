package com.apex.athlete.ui.breathe

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.apex.athlete.core.analytics.breathe.BreathePattern
import com.apex.athlete.core.data.extras.LocalExtras
import com.apex.athlete.core.database.entity.BreatheSessionEntity
import com.apex.athlete.ui.quicklog.WriteOutcome
import com.apex.athlete.ui.quicklog.runExtrasWrite
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * Breathing guide. The chosen pattern and length survive process death; a running session does not (it is a few minutes
 * long and is saved when it ends or is stopped).
 *
 * [rr] is the optional beat-to-beat stream of a BLE strap (milliseconds); null means no strap feature is wired.
 */
class BreatheViewModel internal constructor(
    sessions: Flow<List<BreatheSessionEntity>>,
    rr: Flow<List<Int>>?,
    private val nowMillis: () -> Long,
    private val saveSession: suspend (startMillis: Long, plannedSeconds: Int, completedSeconds: Int, patternKey: String) -> Unit,
    private val removeSession: suspend (String) -> Unit,
    private val handle: SavedStateHandle,
) : ViewModel() {

    constructor(extras: LocalExtras, rr: Flow<List<Int>>?, handle: SavedStateHandle) : this(
        sessions = extras.breathe.observeRecent(RECENT_LIMIT),
        rr = rr,
        nowMillis = System::currentTimeMillis,
        saveSession = { start, planned, completed, key -> extras.breathe.add(start, planned, completed, key) },
        removeSession = { id -> extras.breathe.delete(id) },
        handle = handle,
    )

    /** Null while loading. */
    val recent: StateFlow<List<SessionRowUi>?> = sessions
        .map { BreatheGuide.rows(it) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val spotHrv: StateFlow<SpotHrvUi> = (rr?.map { spotHrvUi(it) }?.flowOn(Dispatchers.Default) ?: flowOf(SpotHrvUi.NoStrap))
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), if (rr == null) SpotHrvUi.NoStrap else SpotHrvUi.Waiting)

    private val _pattern = MutableStateFlow(BreatheGuide.patternOf(handle.get<String>(KEY_PATTERN)) ?: BreathePattern.COHERENT)
    val pattern: StateFlow<BreathePattern> = _pattern.asStateFlow()

    private val _seconds = MutableStateFlow(
        handle.get<Int>(KEY_SECONDS)?.takeIf { it in BreatheGuide.DURATIONS_SECONDS } ?: BreatheGuide.DEFAULT_DURATION_SECONDS,
    )
    val plannedSeconds: StateFlow<Int> = _seconds.asStateFlow()

    private val _run = MutableStateFlow<BreatheRun?>(null)
    val run: StateFlow<BreatheRun?> = _run.asStateFlow()

    private val _summary = MutableStateFlow<SessionSummary?>(null)
    val summary: StateFlow<SessionSummary?> = _summary.asStateFlow()

    private val _outcome = MutableStateFlow(WriteOutcome.IDLE)
    val outcome: StateFlow<WriteOutcome> = _outcome.asStateFlow()

    fun selectPattern(p: BreathePattern) {
        if (_run.value != null) return
        handle[KEY_PATTERN] = BreatheGuide.keyOf(p)
        _pattern.value = p
    }

    fun selectSeconds(s: Int) {
        if (_run.value != null || s !in BreatheGuide.DURATIONS_SECONDS) return
        handle[KEY_SECONDS] = s
        _seconds.value = s
    }

    fun start() {
        if (_run.value != null) return
        _summary.value = null
        _outcome.value = WriteOutcome.IDLE
        _run.value = BreatheRun(_pattern.value, _seconds.value, nowMillis())
    }

    /** Ends the session after [elapsedMillis] of guiding (the planned length when it ran out) and saves it. */
    fun finish(elapsedMillis: Long) {
        val run = _run.value ?: return
        _run.value = null
        val completed = BreatheGuide.completedSeconds(elapsedMillis, run.plannedSeconds)
        if (completed < 1) {
            _summary.value = SessionSummary(run.pattern, run.plannedSeconds, 0, saved = false)
            return
        }
        _outcome.value = WriteOutcome.SAVING
        viewModelScope.launch {
            val result = runExtrasWrite { saveSession(run.startMillis, run.plannedSeconds, completed, BreatheGuide.keyOf(run.pattern)) }
            _summary.value = SessionSummary(run.pattern, run.plannedSeconds, completed, saved = result == WriteOutcome.SAVED)
            _outcome.value = result
        }
    }

    fun delete(id: String) {
        viewModelScope.launch { _outcome.value = runExtrasWrite { removeSession(id) } }
    }

    private companion object {
        const val RECENT_LIMIT = 10
        const val KEY_PATTERN = "breathe.pattern"
        const val KEY_SECONDS = "breathe.seconds"
    }
}
