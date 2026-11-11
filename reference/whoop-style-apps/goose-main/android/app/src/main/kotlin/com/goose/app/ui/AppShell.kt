package com.goose.app.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.goose.app.ble.BleConnectionState
import kotlinx.coroutines.flow.StateFlow

@Composable
fun AppShell(
    connectionState: BleConnectionState = BleConnectionState.Idle,
    liveHeartRateBPM: StateFlow<Int?>,
    recoveryScore: StateFlow<Float?>,
    strainScore: StateFlow<Float?>,
    sleepScore: StateFlow<Float?>,
    serverUrl: StateFlow<String>,
    onServerUrlChange: (String) -> Unit,
) {
    var selectedTab by remember { mutableIntStateOf(0) }

    Scaffold(
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    icon = { Icon(Icons.Default.Home, contentDescription = "Home") },
                    label = { Text("Home") }
                )
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    icon = { Icon(Icons.Default.Favorite, contentDescription = "Health") },
                    label = { Text("Health") }
                )
                NavigationBarItem(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    icon = { Icon(Icons.Default.Psychology, contentDescription = "Coach") },
                    label = { Text("Coach") }
                )
                NavigationBarItem(
                    selected = selectedTab == 3,
                    onClick = { selectedTab = 3 },
                    icon = { Icon(Icons.Default.MoreHoriz, contentDescription = "More") },
                    label = { Text("More") }
                )
            }
        }
    ) { padding ->
        when (selectedTab) {
            0 -> HomeScreen(
                modifier = Modifier.padding(padding),
                connectionState = connectionState,
                liveHeartRateBPM = liveHeartRateBPM,
            )
            1 -> HealthScreen(
                modifier = Modifier.padding(padding),
                recoveryScore = recoveryScore,
                strainScore = strainScore,
                sleepScore = sleepScore,
            )
            2 -> CoachScreen(Modifier.padding(padding))
            else -> MoreScreen(
                modifier = Modifier.padding(padding),
                serverUrl = serverUrl,
                onServerUrlChange = onServerUrlChange,
            )
        }
    }
}
