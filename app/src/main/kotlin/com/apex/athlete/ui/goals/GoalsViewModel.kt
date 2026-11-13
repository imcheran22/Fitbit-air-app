package com.apex.athlete.ui.goals

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.apex.athlete.core.data.extras.DemoWriteRefusedException
import com.apex.athlete.core.data.extras.LocalExtras
import com.apex.athlete.core.data.repository.AthleteRepository
import com.apex.athlete.core.data.repository.TrendIntelligenceState
import com.apex.athlete.core.database.entity.GoalEntity
import com.apex.athlete.core.database.entity.GoalKind
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * Goals list: stored goal definitions (LocalExtras.goals) evaluated by GoalEngine on the repository's daily series.
 * Writes are plain suspend lambdas so the logic is testable without a database.
 */
class GoalsViewModel internal constructor(
    private val today: Long,
    goals: Flow<List<GoalEntity>>,
    trends: Flow<TrendIntelligenceState?>,
    private val add: suspend (GoalKind, Double) -> Unit,
    private val updateTarget: suspend (String, Double) -> Unit,
    private val setEnabled: suspend (String, Boolean) -> Unit,
    private val remove: suspend (String) -> Unit,
    @Suppress("unused") private val handle: SavedStateHandle,
) : ViewModel() {

    constructor(repository: AthleteRepository, extras: LocalExtras, handle: SavedStateHandle) : this(
        today = repository.today(),
        goals = extras.goals.observeAll(),
        trends = repository.trends(repository.today(), GOAL_HISTORY_DAYS),
        add = { k, t -> extras.goals.add(k, t) },
        updateTarget = { id, t -> extras.goals.update(id, target = t) },
        setEnabled = { id, e -> extras.goals.update(id, enabled = e) },
        remove = { id -> extras.goals.delete(id) },
        handle = handle,
    )

    val state: StateFlow<GoalsUi> = combine(goals, trends) { list, t ->
        if (t == null) {
            GoalsUi.Loading
        } else {
            val sources = t.trends.associate { it.metric to SeriesSource(it.points, it.provenance) }
            GoalsUi.Ready(list.map { buildGoalRow(it, sources, today) }, availableKinds(list), t.isDemo)
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), GoalsUi.Loading)

    private val _status = MutableStateFlow(GoalSaveStatus.IDLE)
    val status: StateFlow<GoalSaveStatus> = _status.asStateFlow()

    fun dismissStatus() { _status.value = GoalSaveStatus.IDLE }

    fun create(kind: GoalKind, text: String) {
        val parsed = parseTarget(kind, text) as? TargetParse.Valid ?: return
        launchWrite { add(kind, parsed.target) }
    }

    fun editTarget(id: String, kind: GoalKind, text: String) {
        val parsed = parseTarget(kind, text) as? TargetParse.Valid ?: return
        launchWrite { updateTarget(id, parsed.target) }
    }

    fun pause(id: String, paused: Boolean) = launchWrite { setEnabled(id, !paused) }

    fun delete(id: String) = launchWrite { remove(id) }

    private fun launchWrite(block: suspend () -> Unit) {
        if (_status.value == GoalSaveStatus.SAVING) return
        _status.value = GoalSaveStatus.SAVING
        viewModelScope.launch {
            _status.value = try {
                block()
                GoalSaveStatus.IDLE
            } catch (e: CancellationException) {
                throw e
            } catch (e: DemoWriteRefusedException) {
                GoalSaveStatus.DEMO
            } catch (e: Exception) {
                GoalSaveStatus.ERROR
            }
        }
    }
}
