package com.goose.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.goose.app.ble.BleConnectionState
import kotlinx.coroutines.flow.StateFlow

@Composable
fun HomeScreen(
    modifier: Modifier = Modifier,
    connectionState: BleConnectionState = BleConnectionState.Idle,
    liveHeartRateBPM: StateFlow<Int?>,
) {
    val hr by liveHeartRateBPM.collectAsStateWithLifecycle()

    Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text("Home")
            Text("BLE: ${connectionState.statusLabel()}")
            Text(
                text = "HR: ${hr?.let { "$it bpm" } ?: "—"}",
                style = MaterialTheme.typography.headlineMedium,
            )
        }
    }
}

private fun BleConnectionState.statusLabel(): String = when (this) {
    is BleConnectionState.Idle -> "idle"
    is BleConnectionState.Scanning -> "scanning"
    is BleConnectionState.Connecting -> "connecting"
    is BleConnectionState.DiscoveringServices -> "discovering services"
    is BleConnectionState.Authenticating -> "authenticating"
    is BleConnectionState.Connected -> "connected (${generation.name.lowercase()})"
    is BleConnectionState.Disconnected -> "disconnected: $reason"
}
