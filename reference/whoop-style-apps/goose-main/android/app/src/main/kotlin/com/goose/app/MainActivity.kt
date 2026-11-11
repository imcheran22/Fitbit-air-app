package com.goose.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.goose.app.ui.AppShell
import com.goose.app.ui.theme.GooseTheme
import com.goose.app.viewmodel.AppViewModel

class MainActivity : ComponentActivity() {

    private val appViewModel: AppViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            GooseTheme {
                val connectionState by appViewModel.connectionState.collectAsStateWithLifecycle()
                val liveHeartRateBPM = appViewModel.liveHeartRateBPM
                val recoveryScore = appViewModel.recoveryScore
                val strainScore = appViewModel.strainScore
                val sleepScore = appViewModel.sleepScore
                val serverUrl = appViewModel.serverUrl

                AppShell(
                    connectionState = connectionState,
                    liveHeartRateBPM = liveHeartRateBPM,
                    recoveryScore = recoveryScore,
                    strainScore = strainScore,
                    sleepScore = sleepScore,
                    serverUrl = serverUrl,
                    onServerUrlChange = { appViewModel.setServerUrl(it) },
                )
            }
        }
    }
}
