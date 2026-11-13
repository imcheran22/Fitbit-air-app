package com.apex.athlete.ui.fitness

import androidx.lifecycle.SavedStateHandle
import com.apex.athlete.core.data.repository.FitnessState
import com.apex.athlete.ui.detail.DayLoadViewModel
import kotlinx.coroutines.flow.Flow

/** VO2 max, category and fitness age for one day; the route calls `setDay` whenever the date pill moves. */
class FitnessViewModel(
    initialDay: Long,
    handle: SavedStateHandle,
    load: (Long) -> Flow<FitnessState?>,
) : DayLoadViewModel<FitnessState>(initialDay, handle, "fitness.day", load)
