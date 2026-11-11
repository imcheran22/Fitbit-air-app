package ai.synheart.wear.example

import ai.synheart.wear.models.DeviceAdapter
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

data class ProviderEntry(
    val title: String,
    val adapter: DeviceAdapter,
    val status: String
)

private val PROVIDERS = listOf(
    ProviderEntry("Whoop", DeviceAdapter.WHOOP, "Mocked"),
    ProviderEntry("Garmin", DeviceAdapter.GARMIN, "Mocked"),
    ProviderEntry("Fitbit", DeviceAdapter.FITBIT, "Mocked"),
    ProviderEntry("Oura", DeviceAdapter.OURA, "Mocked"),
    ProviderEntry("BLE HRM", DeviceAdapter.BLE_HRM, "Connect a paired sensor for real BPM"),
    ProviderEntry("Health Connect", DeviceAdapter.HEALTH_CONNECT, "Reads from Health Connect when authorized"),
)

@Composable
fun ExampleApp() {
    var selected by remember { mutableStateOf<ProviderEntry?>(null) }

    val current = selected
    if (current == null) {
        ProviderList(onSelect = { selected = it })
    } else {
        ProviderScreen(entry = current, onBack = { selected = null })
    }
}

@Composable
private fun ProviderList(onSelect: (ProviderEntry) -> Unit) {
    LazyColumn(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        items(PROVIDERS) { entry ->
            ListItem(
                headlineContent = { Text(entry.title) },
                supportingContent = { Text(entry.status) },
                modifier = Modifier
                    .padding(vertical = 4.dp)
                    .clickable { onSelect(entry) }
            )
        }
    }
}

@Composable
private fun ProviderScreen(entry: ProviderEntry, onBack: () -> Unit) {
    val state = rememberHrStream(entry.adapter)
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text(entry.title, style = MaterialTheme.typography.headlineSmall)
        Text(entry.status, style = MaterialTheme.typography.bodyMedium)
        Text(
            text = state.bpm?.let { "${it.toInt()} BPM" } ?: "— BPM",
            style = MaterialTheme.typography.displayMedium
        )
        Button(onClick = state.toggle) {
            Text(if (state.isStreaming) "Stop" else "Start stream")
        }
        Button(onClick = onBack) { Text("Back") }
    }
}
