package app.fitdash.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.fitdash.ui.theme.LocalTheme
import app.fitdash.ui.theme.Palette
import app.fitdash.ui.theme.Space
import app.fitdash.ui.theme.Tint
import app.fitdash.ui.theme.TintScope

@Composable
fun HeroCard(onClick: (() -> Unit)?, description: String, modifier: Modifier = Modifier, tint: Tint? = null, content: @Composable BoxScope.() -> Unit) {
    val t = LocalTheme.current
    Box(
        modifier
            .padding(horizontal = Space.l)
            .fillMaxWidth()
            .heightIn(min = 132.dp)
            .tappable(onClick, description)
            .shadow(14.dp, CardShape, ambientColor = t.orb3.copy(alpha = 0.33f), spotColor = t.orb3.copy(alpha = 0.33f))
            .clip(CardShape)
            .background(if (tint != null) SolidColor(t.tints[tint.ordinal]) else Brush.linearGradient(listOf(t.orb2, t.orb3)))
            .padding(horizontal = Space.l, vertical = Space.m),
    ) {
        if (tint != null) TintScope(tint) { content() }
        else CompositionLocalProvider(
            LocalContentColor provides Color.White,
            LocalTheme provides t.copy(text = Color.White, muted = Color.White.copy(alpha = 0.85f), faint = Color.White.copy(alpha = 0.7f)),
        ) { content() }
    }
}

@Composable
fun RowGroup(content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier
            .padding(horizontal = Space.l)
            .fillMaxWidth()
            .clip(CardShape)
            .background(Palette.Group)
            .padding(6.dp),
        content = content,
    )
}

@Composable
fun StripCard(
    onClick: (() -> Unit)?,
    description: String?,
    modifier: Modifier = Modifier,
    tint: Tint? = null,
    content: @Composable RowScope.() -> Unit,
) = TintScope(tint) {
    Row(
        modifier
            .padding(horizontal = Space.l)
            .fillMaxWidth()
            .heightIn(min = 64.dp)
            .tappable(onClick, description)
            .cardSurface()
            .padding(horizontal = Space.l, vertical = Space.m)
            .semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
}
