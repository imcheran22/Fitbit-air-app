package com.apex.athlete.ui.plan

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.apex.athlete.core.data.repository.AthleteRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

/** The coming 7 days from today's recovery, training load and personal strain base. Read-only: nothing is stored. */
class PlanViewModel internal constructor(
    val today: Long,
    source: Flow<PlanSource?>,
) : ViewModel() {

    constructor(repository: AthleteRepository) : this(
        today = repository.today(),
        source = repository.analysis(repository.today()).map { a ->
            a?.let {
                PlanSource(
                    personalStrainBase = it.personalStrainBase,
                    todayRecovery = it.recovery.score,
                    loadZone = it.load.workloadZone,
                    loadCalibrating = it.loadCalibrating,
                    sleepNeedMinutes = it.sleepNeedTonight.totalMinutes,
                )
            }
        },
    )

    val state: StateFlow<PlanUi> = source.map { buildPlanUi(it, today) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), PlanUi.Loading)
}
