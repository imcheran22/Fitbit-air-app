package com.apex.athlete.ui.stress

import androidx.lifecycle.SavedStateHandle
import com.apex.athlete.core.data.repository.StressEnergyState
import com.apex.athlete.ui.detail.DayLoadViewModel
import kotlinx.coroutines.flow.Flow

/** The day's stress; the route calls `setDay` whenever the date pill moves. The day survives process death. */
class StressViewModel(
    initialDay: Long,
    handle: SavedStateHandle,
    load: (Long) -> Flow<StressEnergyState?>,
) : DayLoadViewModel<StressEnergyState>(initialDay, handle, "stress.day", load)
