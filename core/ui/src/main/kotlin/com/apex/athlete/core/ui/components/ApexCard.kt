package com.apex.athlete.core.ui.components

import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.background
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.ui.theme.ApexShapes
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme

/**
 * The opaque card material (DESIGN_SYSTEM.md section 2.5): vertical gradient `cardTop` to `card`, a 1 dp
 * top hairline `cardEdge`, no shadow, no border. Never nest a card in a card (use rows inside).
 *
 * When [onClick] is set the whole card is one 48 dp+ target with a press scale; give it [spokenDescription]
 * so TalkBack reads one sentence instead of the visual fragments.
 */
@Composable
fun ApexCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    onClickLabel: String? = null,
    spokenDescription: String? = null,
    shape: Shape = ApexShapes.card,
    contentPadding: PaddingValues = PaddingValues(ApexSpacing.cardPadding),
    content: @Composable ColumnScope.() -> Unit,
) {
    val colors = ApexTheme.colors
    val brush = remember(colors) { Brush.verticalGradient(listOf(colors.cardTop, colors.card)) }
    val edge = colors.cardEdge
    var base = modifier
        .clip(shape)
        .background(brush)
        .drawWithContent {
            drawContent()
            val h = 1.dp.toPx()
            drawLine(edge, Offset(0f, h / 2f), Offset(size.width, h / 2f), strokeWidth = h)
        }
    if (onClick != null) {
        base = base.apexClickable(onClick = onClick, role = Role.Button, onClickLabel = onClickLabel, interactionSource = remember { MutableInteractionSource() })
    }
    if (spokenDescription != null) base = base.spoken(spokenDescription)
    Column(base.padding(contentPadding), content = content)
}

@Preview(name = "Card dark")
@Composable
private fun CardPreviewDark() = ApexPreview(dark = true) { CardPreviewBody() }

@Preview(name = "Card light")
@Composable
private fun CardPreviewLight() = ApexPreview(dark = false) { CardPreviewBody() }

@Composable
private fun CardPreviewBody() {
    ApexCard {
        Text("Heart rate", style = ApexTheme.type.cardTitle, color = ApexTheme.colors.foreground)
        Text("149 bpm", style = ApexTheme.type.statValueLarge, color = ApexTheme.colors.foreground)
    }
}
