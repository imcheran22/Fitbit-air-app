package app.fitdash.ui

import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.TextButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.fitdash.health.ReadProgress
import app.fitdash.ui.components.MiniRing
import app.fitdash.ui.components.Orb
import app.fitdash.ui.theme.Palette
import app.fitdash.ui.theme.Type

// Only a first run (no cached snapshot) waits here, and that read can take a while with weeks of minute-level data.
// The ring around the orb fills as each record type comes back, and the line under it names the one that just landed.
@Composable
fun LoadingScreen(firstRun: Boolean = false, progressFlow: StateFlow<ReadProgress?> = MutableStateFlow(null)) {
    val progress by progressFlow.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize().background(Palette.Background), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Box(contentAlignment = Alignment.Center) {
            MiniRing("loading", progress?.fraction ?: 0f, Palette.Accent, diameter = 252.dp, stroke = 3.dp)
            Orb(null, intro = true) {}
        }
        if (firstRun) {
            Text("READING HEALTH CONNECT", style = Type.label, color = Palette.Muted, modifier = Modifier.padding(top = 32.dp))
            AnimatedContent(
                progress,
                transitionSpec = { (slideInVertically { it / 2 } + fadeIn()) togetherWith (slideOutVertically { -it / 2 } + fadeOut()) },
                contentKey = { it?.done },
                label = "read-step",
            ) { p ->
                Text(
                    p?.let { "${it.label} · ${it.done} of ${it.total}" } ?: "Asking for your data",
                    style = Type.tiny, color = Palette.Accent, modifier = Modifier.padding(top = 8.dp),
                )
            }
            Text(
                "The first read goes through everything your watch has written. After this, fitdash opens instantly.",
                style = Type.body, color = Palette.Muted, textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 10.dp, start = 40.dp, end = 40.dp),
            )
        }
    }
}

@Composable
fun MessageScreen(title: String, body: String, action: String? = null, onAction: () -> Unit = {}) {
    Column(
        Modifier.fillMaxSize().background(Palette.Background).padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Orb(null) {}
        Spacer(Modifier.height(32.dp))
        Text(title, style = Type.value, color = Palette.Text, textAlign = TextAlign.Center)
        Text(body, style = Type.body, color = Palette.Muted, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 10.dp))
        if (action != null) Button(onClick = onAction, modifier = Modifier.padding(top = 28.dp)) { Text(action) }
    }
}

// Phone-only tracking: these write steps to Health Connect without a wearable.
val PHONE_TRACKERS = listOf("com.fitbit.FitbitMobile" to "Fitbit", "com.sec.android.app.shealth" to "Samsung Health")

@Composable
fun NoDataScreen(installed: List<Pair<String, String>>, onOpen: (String) -> Unit, onStore: (String) -> Unit, onCheck: () -> Unit, onUsePhone: () -> Unit) {
    var noDevice by rememberSaveable { mutableStateOf(false) }
    Column(
        Modifier.fillMaxSize().background(Palette.Background).verticalScroll(rememberScrollState()).padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Orb(null) {}
        Spacer(Modifier.height(32.dp))
        Text("No data yet", style = Type.value, color = Palette.Text, textAlign = TextAlign.Center)
        Text(
            "Turn on Health Connect sync in your watch or ring app, then come back.",
            style = Type.body, color = Palette.Muted, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 10.dp),
        )
        installed.forEachIndexed { i, (pkg, name) ->
            OutlinedButton(onClick = { onOpen(pkg) }, modifier = Modifier.padding(top = if (i == 0) 24.dp else 8.dp)) { Text("Open $name") }
        }
        Button(onClick = onCheck, modifier = Modifier.padding(top = if (installed.isEmpty()) 28.dp else 16.dp)) { Text("Check again") }
        TextButton(onClick = { noDevice = !noDevice }, modifier = Modifier.padding(top = 12.dp)) {
            Text("I don't have a watch or ring", style = Type.label, color = Palette.Accent)
        }
        if (noDevice) {
            Text(
                "Your phone can count steps, and you can enter your sleep by hand. No other app needed.",
                style = Type.body, color = Palette.Muted, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 4.dp),
            )
            Button(onClick = onUsePhone, modifier = Modifier.padding(top = 16.dp)) { Text("Use my phone instead") }
            Text(
                "Or install one of these free apps, turn on Health Connect sync in it, and come back.",
                style = Type.body, color = Palette.Muted, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 16.dp),
            )
            PHONE_TRACKERS.forEach { (pkg, name) ->
                val isInstalled = installed.any { it.first == pkg }
                OutlinedButton(onClick = { if (isInstalled) onOpen(pkg) else onStore(pkg) }, modifier = Modifier.padding(top = 8.dp)) {
                    Text(if (isInstalled) "Open $name" else "Get $name")
                }
            }
        }
    }
}
