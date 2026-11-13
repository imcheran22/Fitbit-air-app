package com.apex.athlete.ui.reports

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.apex.athlete.core.analytics.load.WorkloadZone
import com.apex.athlete.core.analytics.report.ReportEngine
import com.apex.athlete.core.analytics.report.ReportPeriodType
import com.apex.athlete.core.analytics.report.ReportRequest
import com.apex.athlete.core.data.extras.LocalExtras
import com.apex.athlete.core.data.repository.AthleteRepository
import com.apex.athlete.core.data.repository.TrendIntelligenceState
import com.apex.athlete.core.database.entity.GoalEntity
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

/** The load status the engine reads on a period's last day. */
data class LoadSnapshot(val zone: WorkloadZone?, val calibrating: Boolean)

/**
 * Weekly and monthly reports from [ReportEngine.summarise]. The list needs only the stored daily series; the detail adds the
 * load zone of the period's last day. Selection and period type survive process death in [handle].
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ReportsViewModel internal constructor(
    private val today: Long,
    trends: Flow<TrendIntelligenceState?>,
    workouts: Flow<List<WorkoutRef>>,
    goals: Flow<List<GoalEntity>>,
    private val loadAt: (Long) -> Flow<LoadSnapshot?>,
    private val handle: SavedStateHandle,
) : ViewModel() {

    constructor(repository: AthleteRepository, extras: LocalExtras, handle: SavedStateHandle) : this(
        today = repository.today(),
        trends = repository.trends(repository.today(), REPORT_HISTORY_DAYS),
        workouts = repository.recentWorkouts(400).map { list -> list.map { WorkoutRef(it.epochDay, it.provenance) } },
        goals = extras.goals.observeAll(),
        loadAt = { day -> repository.analysis(day).map { a -> a?.let { LoadSnapshot(it.load.workloadZone, it.loadCalibrating) } } },
        handle = handle,
    )

    private val typeFlow = MutableStateFlow(
        handle.get<String>(KEY_TYPE)?.let { n -> ReportPeriodType.entries.firstOrNull { it.name == n } } ?: ReportPeriodType.WEEK,
    )
    private val selectedFlow = MutableStateFlow(handle.get<Long>(KEY_SELECTED))

    val type: StateFlow<ReportPeriodType> = typeFlow
    /** Start day of the open report; null = the list. */
    val selected: StateFlow<Long?> = selectedFlow

    private val source: Flow<ReportSource?> = combine(trends, workouts, goals) { t, w, g -> t?.let { buildReportSource(it, w, g) } }

    val list: StateFlow<ReportsUi> = combine(source, typeFlow) { src, type ->
        if (src == null) {
            ReportsUi.Loading
        } else {
            val items = periodStarts(type, today, count(type)).map { start ->
                buildItem(ReportEngine.summarise(request(src, type, start, src.days)), src.provenance)
            }
            ReportsUi.Ready(type, items, src.isDemo)
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ReportsUi.Loading)

    val detail: StateFlow<ReportDetailUi?> = combine(source, typeFlow, selectedFlow) { s, t, sel -> Triple(s, t, sel) }
        .flatMapLatest { (src, type, start) ->
            if (src == null || start == null) {
                flowOf(null)
            } else {
                val last = lastCountedDay(ReportEngine.summarise(request(src, type, start, src.days)))
                loadAt(last).map { snap ->
                    val days = withLoadOnDay(src.days, last, snap?.zone, snap?.calibrating == true)
                    buildDetail(ReportEngine.summarise(request(src, type, start, days)), src)
                }
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    fun setType(type: ReportPeriodType) {
        if (typeFlow.value == type) return
        handle[KEY_TYPE] = type.name
        typeFlow.value = type
        open(null)
    }

    fun open(start: Long?) {
        handle[KEY_SELECTED] = start
        selectedFlow.value = start
    }

    private fun request(src: ReportSource, type: ReportPeriodType, start: Long, days: List<com.apex.athlete.core.analytics.report.ReportDay>) =
        ReportRequest(type = type, startEpochDay = start, days = days, goals = src.goals, asOfEpochDay = today)

    private fun count(type: ReportPeriodType) = if (type == ReportPeriodType.WEEK) WEEKS_LISTED else MONTHS_LISTED

    private companion object {
        const val KEY_TYPE = "type"
        const val KEY_SELECTED = "selected"
    }
}
