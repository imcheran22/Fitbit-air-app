package app.fitdash.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.fitdash.metrics.Status
import app.fitdash.ui.theme.Palette
import app.fitdash.ui.theme.Tint
import app.fitdash.ui.theme.TintScope
import app.fitdash.ui.theme.noteCase
import app.fitdash.ui.theme.Space
import app.fitdash.ui.theme.Type

@Composable
fun StatTile(
    label: String,
    value: String?,
    unit: String?,
    note: String?,
    modifier: Modifier = Modifier,
    status: Status? = null,
    icon: ImageVector? = null,
    labelTag: String? = null,
    onClick: (() -> Unit)? = null,
    description: String? = null,
    tint: Tint? = null,
    visual: @Composable () -> Unit,
) = TintScope(tint) {
    Column(
        modifier
            .heightIn(min = 124.dp)
            .tappable(onClick, description)
            .tileSurface(tint != null)
            .padding(Space.m)
            .semantics(mergeDescendants = true) {},
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (icon != null) Icon(icon, null, Modifier.padding(end = 6.dp).size(13.dp), tint = Palette.Muted)
            Text(label, style = Type.secondary, color = Palette.Muted)
            if (labelTag != null) Text(noteCase(labelTag), Modifier.padding(start = 4.dp), style = Type.tiny, color = Palette.Muted)
        }
        if (value != null) ValueText(value, unit, Modifier.padding(top = Space.xs, bottom = if (status == null) Space.s else 2.dp), style = Type.tile)
        if (status != null) StatusText(status, Modifier.padding(bottom = Space.s))
        Spacer(Modifier.weight(1f))
        visual()
        if (note != null) Text(noteCase(note), style = Type.tiny, color = Palette.Muted, modifier = Modifier.padding(top = Space.s))
    }
}

@Composable
fun NumberTile(
    label: String,
    icon: ImageVector,
    parts: List<Pair<String, String>>,
    modifier: Modifier = Modifier,
    status: Status? = null,
    note: String? = null,
    onClick: (() -> Unit)? = null,
    description: String? = null,
    tint: Tint? = null,
) = TintScope(tint) {
    Column(
        modifier
            .tileSurface()
            .tappable(onClick, description)
            .padding(Space.m)
            .semantics(mergeDescendants = true) {},
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, null, Modifier.padding(end = 6.dp).size(13.dp), tint = Palette.Muted)
            Text(label, style = Type.secondary, color = Palette.Muted)
        }
        NumberWithUnits(parts, Modifier.padding(top = Space.s, bottom = 6.dp))
        if (status != null) StatusText(status)
        if (note != null) Text(noteCase(note), style = Type.tiny, color = Palette.Muted, modifier = Modifier.padding(top = Space.xs))
    }
}

@Composable
fun TileGrid(tiles: List<@Composable (Modifier) -> Unit>) {
    Column(Modifier.padding(horizontal = Space.l), verticalArrangement = Arrangement.spacedBy(Space.s)) {
        tiles.chunked(2).forEach { row ->
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                row.forEach { it(Modifier.weight(1f).fillMaxHeight()) }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}
