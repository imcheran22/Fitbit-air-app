package com.apex.athlete.core.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.theme.ApexShapes
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme

/**
 * A short plain-words insight with a 1 dp gradient hairline (`insightFrom` to `insightTo`) and an optional
 * link action. [provenance] labels where the words came from (rule-based text is derived, optional AI text
 * is AI interpreted); pass it for every insight so the source is always visible.
 */
@Composable
fun InsightCard(
    text: String,
    modifier: Modifier = Modifier,
    linkLabel: String? = null,
    onLinkClick: (() -> Unit)? = null,
    provenance: DataProvenance? = null,
) {
    val colors = ApexTheme.colors
    val hairline = remember(colors) { Brush.linearGradient(listOf(colors.insightFrom, colors.insightTo)) }
    Column(
        modifier
            .fillMaxWidth()
            .clip(ApexShapes.card)
            .background(colors.card)
            .border(1.dp, hairline, ApexShapes.card)
            .padding(ApexSpacing.cardPadding),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(text, style = ApexTheme.type.bodyStrong, color = colors.foreground)
        if (provenance != null) ProvenanceLabel(provenance)
        if (linkLabel != null && onLinkClick != null) {
            val source = remember { MutableInteractionSource() }
            Row(
                Modifier
                    .apexClickable(onClick = onLinkClick, role = Role.Button, interactionSource = source)
                    .minTouchTarget(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(linkLabel.uppercase(), style = ApexTheme.type.linkAction, color = colors.coachText)
                Icon(ApexIcons.ArrowRight, contentDescription = null, tint = colors.coachText, modifier = Modifier.size(16.dp))
            }
        }
    }
}

@Preview(name = "Insight dark")
@Composable
private fun InsightPreviewDark() = ApexPreview(dark = true) { InsightPreviewBody() }

@Preview(name = "Insight light")
@Composable
private fun InsightPreviewLight() = ApexPreview(dark = false) { InsightPreviewBody() }

@Composable
private fun InsightPreviewBody() {
    InsightCard(
        text = "Your HRV is above your baseline, which lifted Recovery today.",
        linkLabel = "Explore your recovery insights",
        onLinkClick = {},
        provenance = DataProvenance.MATHEMATICALLY_DERIVED,
    )
}
