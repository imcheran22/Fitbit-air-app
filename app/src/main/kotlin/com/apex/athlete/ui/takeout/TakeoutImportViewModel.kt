package com.apex.athlete.ui.takeout

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.apex.athlete.core.data.worker.TakeoutImportState
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn

/**
 * Combines the Demo flag, the last-import time and the import work state. Holds no Context: the
 * route passes `TakeoutImportScheduler.observe(context)` as [importSource]. A null [state] means
 * "not loaded yet".
 */
class TakeoutImportViewModel(
    demoSource: Flow<Boolean>,
    lastImportSource: Flow<Long?>,
    importSource: Flow<TakeoutImportState>,
) : ViewModel() {
    val state: StateFlow<TakeoutUiState?> =
        combine(demoSource, lastImportSource, importSource) { demo, last, import -> uiStateOf(demo, last, import) }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)
}
