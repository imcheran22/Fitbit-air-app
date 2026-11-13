package com.apex.athlete.ui.nap

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.apex.athlete.core.data.repository.NapDetailResult
import com.apex.athlete.core.data.repository.NapDetailState
import com.apex.athlete.core.data.repository.NapsState
import com.apex.athlete.ui.detail.DayLoadViewModel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onStart
import kotlinx.coroutines.flow.stateIn

/** The naps of the Sleep screen's day; the Sleep route calls `setDay` whenever its date pill moves. */
class NapsViewModel(
    initialDay: Long,
    handle: SavedStateHandle,
    load: (Long) -> Flow<NapsState?>,
) : DayLoadViewModel<NapsState>(initialDay, handle, "naps.day", load)

/** What the nap detail screen is waiting for, showing, or could not find. */
sealed interface NapLoad {
    data object Loading : NapLoad
    data class Ready(val detail: NapDetailState) : NapLoad

    /** The store is ready but no session has this id (replaced or deleted since the link was made). */
    data object NotFound : NapLoad
    data object Failed : NapLoad
}

/** [load] emits null while the store is not ready, and a result with a null detail when the session does not exist. */
class NapDetailViewModel(
    napId: String,
    load: (String) -> Flow<NapDetailResult?>,
) : ViewModel() {
    val state: StateFlow<NapLoad> = load(napId)
        .map<NapDetailResult?, NapLoad> { result ->
            val detail = result?.detail
            when {
                result == null -> NapLoad.Loading
                detail == null -> NapLoad.NotFound
                else -> NapLoad.Ready(detail)
            }
        }
        .onStart { emit(NapLoad.Loading) }
        .catch { emit(NapLoad.Failed) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), NapLoad.Loading)
}
