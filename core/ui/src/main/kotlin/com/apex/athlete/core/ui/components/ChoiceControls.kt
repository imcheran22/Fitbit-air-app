package com.apex.athlete.core.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import com.apex.athlete.core.ui.theme.ApexShapes
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme

/** One option of a [ChoiceRow] or [ChoiceScrollRow]. [description] is the TalkBack text (for example "Last 30 days"). */
@Immutable
data class ChoiceOption(val key: String, val label: String, val description: String = label)

@Composable
private fun ChoiceChip(option: ChoiceOption, selected: Boolean, onSelect: () -> Unit, modifier: Modifier) {
    val colors = ApexTheme.colors
    Box(
        modifier
            .heightIn(min = ApexSpacing.minTouch)
            .clip(ApexShapes.chip)
            .background(if (selected) colors.primary else colors.secondary)
            .selectable(selected = selected, role = Role.RadioButton, onClick = onSelect)
            .semantics { contentDescription = option.description }
            .padding(horizontal = ApexSpacing.md, vertical = ApexSpacing.sm),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            option.label,
            style = ApexTheme.type.button,
            color = if (selected) colors.primaryForeground else colors.foregroundSecondary,
            textAlign = TextAlign.Center,
        )
    }
}

/**
 * A single-choice row of equal-width 48 dp chips (a range switch: 7, 30, 90 days). Selection is owned by the caller.
 * [groupDescription] names the group for TalkBack. Labels wrap at large font sizes; the chips grow, never clip.
 */
@Composable
fun ChoiceRow(
    options: List<ChoiceOption>,
    selectedKey: String?,
    onSelect: (String) -> Unit,
    groupDescription: String,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier.fillMaxWidth().selectableGroup().semantics { contentDescription = groupDescription },
        horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm),
    ) {
        options.forEach { option ->
            ChoiceChip(option, option.key == selectedKey, { onSelect(option.key) }, Modifier.weight(1f))
        }
    }
}

/** Like [ChoiceRow] but the chips keep their natural width and the row scrolls sideways (a metric picker). */
@Composable
fun ChoiceScrollRow(
    options: List<ChoiceOption>,
    selectedKey: String?,
    onSelect: (String) -> Unit,
    groupDescription: String,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .selectableGroup()
            .semantics { contentDescription = groupDescription },
        horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm),
    ) {
        options.forEach { option ->
            ChoiceChip(option, option.key == selectedKey, { onSelect(option.key) }, Modifier)
        }
    }
}

@Composable
private fun ChoicePreviewBody() {
    val ranges = listOf(ChoiceOption("7", "7 days"), ChoiceOption("30", "30 days"), ChoiceOption("90", "90 days"), ChoiceOption("180", "180 days"))
    androidx.compose.foundation.layout.Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
        ChoiceRow(ranges, "30", {}, "Range")
        ChoiceScrollRow(
            listOf(ChoiceOption("steps", "Steps"), ChoiceOption("kcal", "Calories"), ChoiceOption("azm", "Active zone minutes"), ChoiceOption("floors", "Floors")),
            "steps", {}, "Metric",
        )
    }
}

@Preview(name = "Choices dark")
@Composable
private fun ChoicePreviewDark() = ApexPreview(dark = true) { ChoicePreviewBody() }

@Preview(name = "Choices light")
@Composable
private fun ChoicePreviewLight() = ApexPreview(dark = false) { ChoicePreviewBody() }
