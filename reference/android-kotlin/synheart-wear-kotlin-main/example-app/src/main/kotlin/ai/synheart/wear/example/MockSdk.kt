package ai.synheart.wear.example

import ai.synheart.wear.models.DeviceAdapter
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.random.Random

/**
 * Holder for the streaming state shown in [ProviderScreen]. Real
 * `BLE_HRM` and `HEALTH_CONNECT` streams are wired to the SDK in apps
 * that ship with credentials; this demo emits a synthetic ~70 BPM
 * value so the UI is interactive without hardware or OAuth.
 */
class HrStreamState(
    initialBpm: Double? = null
) {
    var bpm: Double? by mutableStateOf(initialBpm)
        internal set
    var isStreaming: Boolean by mutableStateOf(false)
        internal set
    var toggle: () -> Unit = {}
        internal set
}

@Composable
fun rememberHrStream(adapter: DeviceAdapter): HrStreamState {
    val state = remember { HrStreamState() }
    val scope = remember { CoroutineScope(Dispatchers.Main) }
    var job by remember { mutableStateOf<Job?>(null) }

    state.toggle = {
        if (state.isStreaming) {
            job?.cancel()
            job = null
            state.isStreaming = false
            state.bpm = null
        } else {
            state.isStreaming = true
            job = scope.launch {
                while (true) {
                    state.bpm = 70.0 + Random.nextDouble(-5.0, 5.0)
                    delay(1000)
                }
            }
        }
    }

    DisposableEffect(adapter) {
        onDispose {
            job?.cancel()
            job = null
        }
    }
    return state
}
