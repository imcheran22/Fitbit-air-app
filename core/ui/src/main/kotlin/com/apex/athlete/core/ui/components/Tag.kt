package com.apex.athlete.core.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.ui.R
import com.apex.athlete.core.ui.theme.ApexColors
import com.apex.athlete.core.ui.theme.ApexShapes
import com.apex.athlete.core.ui.theme.ApexTheme

/** Meaning of a chip or tag. Colour is never the only signal: chips also carry text (and an icon when given). */
enum class ChipTone { NEUTRAL, OPTIMAL, WARNING, ALERT, INFO, STRAIN }

@Immutable
internal data class ToneColors(val text: Color, val fill: Color)

/** Text uses the contrast-safe `*Text` tokens; fill is the data colour at low alpha. */
internal fun ApexColors.toneColors(tone: ChipTone): ToneColors = when (tone) {
    ChipTone.NEUTRAL -> ToneColors(foregroundSecondary, fillHover)
    ChipTone.OPTIMAL -> ToneColors(optimalText, optimal.copy(alpha = 0.16f))
    ChipTone.WARNING -> ToneColors(warningText, warning.copy(alpha = 0.16f))
    ChipTone.ALERT -> ToneColors(recoveryRedText, recoveryRed.copy(alpha = 0.16f))
    ChipTone.INFO -> ToneColors(coachText, coach.copy(alpha = 0.16f))
    ChipTone.STRAIN -> ToneColors(strainText, strain.copy(alpha = 0.16f))
}

/** Small uppercase status tag: "PROVISIONAL", "CALIBRATING". Non-interactive. */
@Composable
fun Tag(text: String, modifier: Modifier = Modifier, tone: ChipTone = ChipTone.NEUTRAL) {
    val c = ApexTheme.colors.toneColors(tone)
    Text(
        text = text.uppercase(),
        style = ApexTheme.type.tag,
        color = c.text,
        maxLines = 2,
        overflow = TextOverflow.Ellipsis,
        modifier = modifier
            .background(c.fill, ApexShapes.chip)
            .padding(horizontal = 8.dp, vertical = 4.dp),
    )
}

/** Chip with an optional leading icon and a sentence-case label ("within 16.1 - 16.9"). Non-interactive. */
@Composable
fun StatusChip(
    text: String,
    modifier: Modifier = Modifier,
    tone: ChipTone = ChipTone.NEUTRAL,
    icon: ImageVector? = null,
) {
    val c = ApexTheme.colors.toneColors(tone)
    Row(
        modifier = modifier
            .background(c.fill, ApexShapes.chip)
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) {
            Icon(icon, contentDescription = null, tint = c.text, modifier = Modifier.size(16.dp))
            androidx.compose.foundation.layout.Spacer(Modifier.size(6.dp))
        }
        Text(text = text, style = ApexTheme.type.caption, color = c.text)
    }
}

@Preview(name = "Tags dark")
@Composable
private fun TagsPreviewDark() = ApexPreview(dark = true) { TagsPreviewBody() }

@Preview(name = "Tags light")
@Composable
private fun TagsPreviewLight() = ApexPreview(dark = false) { TagsPreviewBody() }

@Composable
private fun TagsPreviewBody() {
    androidx.compose.foundation.layout.Column(verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp)) {
            Tag(stringResource(R.string.tag_provisional))
            Tag(stringResource(R.string.tag_calibrating), tone = ChipTone.INFO)
            Tag(stringResource(R.string.tag_stale), tone = ChipTone.WARNING)
        }
        Row(horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp)) {
            StatusChip(stringResource(R.string.chip_in_range), tone = ChipTone.OPTIMAL, icon = com.apex.athlete.core.ui.icons.ApexIcons.Check)
            StatusChip(stringResource(R.string.chip_out_of_range), tone = ChipTone.WARNING, icon = com.apex.athlete.core.ui.icons.ApexIcons.Warning)
        }
    }
}
