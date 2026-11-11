package app.fitdash.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.fitdash.ui.components.Orb
import app.fitdash.ui.pages.NameField
import app.fitdash.ui.theme.Palette
import app.fitdash.ui.theme.Type

@Composable
fun NameScreen(onDone: (String?) -> Unit) {
    var name by rememberSaveable { mutableStateOf("") }
    val trimmed = name.trim()
    Column(
        Modifier.fillMaxSize().background(Palette.Background).padding(horizontal = 32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Orb(null, intro = true) {}
        Text("What should we call you?", style = Type.title, color = Palette.Text, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 32.dp))
        NameField(name, { name = it }, Modifier.fillMaxWidth().padding(top = 24.dp)) { if (trimmed.isNotEmpty()) onDone(trimmed) }
        Button(
            onClick = { onDone(trimmed) },
            enabled = trimmed.isNotEmpty(),
            modifier = Modifier.fillMaxWidth().padding(top = 24.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Palette.Accent, contentColor = Palette.OnAccent),
        ) { Text("Continue") }
        TextButton(onClick = { onDone(null) }, Modifier.padding(top = 8.dp)) { Text("Skip", color = Palette.Muted) }
    }
}
