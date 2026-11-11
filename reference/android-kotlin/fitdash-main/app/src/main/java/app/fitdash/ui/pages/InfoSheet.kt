package app.fitdash.ui.pages

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import app.fitdash.BuildConfig
import app.fitdash.health.SourceStatus
import app.fitdash.ui.components.ListRow
import app.fitdash.ui.components.RowGroup
import app.fitdash.ui.components.NavIcons
import app.fitdash.ui.sourceLine
import app.fitdash.ui.missingReason
import app.fitdash.ui.writerNames
import androidx.compose.ui.unit.dp
import app.fitdash.ui.theme.LocalTheme
import app.fitdash.ui.theme.Palette
import app.fitdash.ui.theme.Space
import app.fitdash.ui.theme.Type
import app.fitdash.ui.theme.labelCase

const val SUPPORT_URL = "https://buymeacoffee.com/thepsygeek"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InfoSheet(sources: List<SourceStatus>, onDismiss: () -> Unit) {
    val uri = LocalUriHandler.current
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = LocalTheme.current.bgMid) {
        LazyColumn(contentPadding = PaddingValues(start = Space.xl, end = Space.xl, bottom = Space.xxl)) {
            item {
                Text("About your data", style = Type.value, color = Palette.Text)
                Text(
                    "fitdash has no internet access. Your data never leaves this phone unless you share it.",
                    style = Type.body,
                    color = Palette.Muted,
                    modifier = Modifier.padding(top = Space.s, bottom = Space.xl),
                )
                Text(labelCase("Data sources"), style = Type.label, color = Palette.Muted, modifier = Modifier.padding(bottom = Space.s))
            }
            val writers = writerNames(sources)
            items(sources, key = { it.label }) { s ->
                Row(Modifier.fillMaxWidth().padding(top = Space.s, bottom = if (s.hasData) Space.s else 2.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(s.label, style = Type.small, color = Palette.Text)
                    Text(sourceLine(s), style = Type.small, color = if (s.hasData) Palette.Green else Palette.Faint)
                }
                // Granted but empty, or not granted: one line on why, so an empty tile is not a mystery.
                missingReason(s, writers)?.let { Text(it, style = Type.secondary, color = Palette.Muted, modifier = Modifier.padding(bottom = Space.s)) }
                HorizontalDivider(color = Palette.Divider)
            }
            if (BuildConfig.SHOW_SUPPORT) {
                item {
                    Box(Modifier.padding(top = Space.xl)) {
                        RowGroup { ListRow(NavIcons.cup, "Support fitdash", null, onClick = { uri.openUri(SUPPORT_URL) }) }
                    }
                }
            }
            item {
                Text("fitdash ${BuildConfig.VERSION_NAME}", style = Type.tiny, color = Palette.Faint, modifier = Modifier.padding(top = Space.l))
            }
        }
    }
}
