package com.goose.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.StateFlow

@Composable
fun HealthScreen(
    modifier: Modifier = Modifier,
    recoveryScore: StateFlow<Float?>,
    strainScore: StateFlow<Float?>,
    sleepScore: StateFlow<Float?>,
) {
    val recovery by recoveryScore.collectAsStateWithLifecycle()
    val strain by strainScore.collectAsStateWithLifecycle()
    val sleep by sleepScore.collectAsStateWithLifecycle()

    Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            modifier = Modifier.padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Health", style = MaterialTheme.typography.titleLarge)
            Text(
                text = "Recovery: ${recovery?.let { "%.0f%%".format(it) } ?: "—"}",
                style = MaterialTheme.typography.bodyLarge,
            )
            Text(
                text = "Strain: ${strain?.let { "%.1f".format(it) } ?: "—"}",
                style = MaterialTheme.typography.bodyLarge,
            )
            Text(
                text = "Sleep: ${sleep?.let { "%.0f%%".format(it) } ?: "—"}",
                style = MaterialTheme.typography.bodyLarge,
            )
        }
    }
}
