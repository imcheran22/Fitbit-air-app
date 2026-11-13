package com.apex.athlete.ui.datasources

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.apex.athlete.core.data.source.AirStatusResult
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Feeds the "Fitbit Air" row on Data sources: model, battery and last sync from `pairedDevices.list`.
 * Fetched on demand ([refresh]) and cached in memory by the reader; never stored in Room.
 */
class FitbitAirViewModel(
    private val read: suspend (force: Boolean) -> AirStatusResult,
    cached: () -> AirStatusResult?,
) : ViewModel() {
    private val _state = MutableStateFlow(airRowUi(cached()))
    val state: StateFlow<AirRowUi> = _state.asStateFlow()

    private var job: Job? = null

    /** One request at a time; the row that is already shown stays until the answer arrives. */
    fun refresh(force: Boolean = false) {
        if (job?.isActive == true) return
        job = viewModelScope.launch {
            _state.value = try {
                airRowUi(read(force))
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                airRowUi(AirStatusResult.Unavailable)
            }
        }
    }
}
