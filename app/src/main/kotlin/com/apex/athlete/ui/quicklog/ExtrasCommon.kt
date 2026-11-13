package com.apex.athlete.ui.quicklog

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.selection.toggleable
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.style.TextAlign
import com.apex.athlete.core.ui.theme.ApexShapes
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import com.apex.athlete.R
import com.apex.athlete.core.ui.shell.DetailHeader
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme

/** Header with a back button above one scrolling column of cards; the shared frame of the log screens. */
@Composable
internal fun ExtrasScreenFrame(
    title: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(modifier.fillMaxSize().imePadding()) {
        DetailHeader(title = title, onBack = onBack, backDescription = stringResource(R.string.common_back))
        Column(
            Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = ApexSpacing.gutter),
            verticalArrangement = Arrangement.spacedBy(ApexSpacing.cardGap),
        ) {
            content()
            Spacer(Modifier.height(ApexSpacing.xl))
        }
    }
}

@Composable
internal fun SectionHeading(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        style = ApexTheme.type.bodyStrong,
        color = ApexTheme.colors.foreground,
        modifier = modifier.semantics { heading() },
    )
}

/** One polite live-region line for a save result; draws nothing while there is nothing to say. */
@Composable
internal fun OutcomeLine(outcome: WriteOutcome, modifier: Modifier = Modifier) {
    val res = writeOutcomeRes(outcome) ?: return
    val colors = ApexTheme.colors
    val ok = outcome == WriteOutcome.SAVED
    Text(
        stringResource(res),
        style = ApexTheme.type.caption,
        color = when {
            ok -> colors.optimalText
            outcome == WriteOutcome.DEMO -> colors.mutedForeground
            else -> colors.recoveryRedText
        },
        modifier = modifier.semantics { liveRegion = LiveRegionMode.Polite },
    )
}

/** A multi-select chip (a symptom): 48 dp target, selected state read by TalkBack, text never colour-only. */
@Composable
internal fun ToggleChip(
    label: String,
    selected: Boolean,
    description: String,
    onToggle: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = ApexTheme.colors
    androidx.compose.foundation.layout.Box(
        modifier
            .minTouchHeight()
            .clip(ApexShapes.chip)
            .background(if (selected) colors.primary else colors.secondary)
            .toggleable(value = selected, role = Role.Checkbox, onValueChange = onToggle)
            .semantics { contentDescription = description }
            .padding(horizontal = ApexSpacing.md, vertical = ApexSpacing.sm),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            style = ApexTheme.type.button,
            color = if (selected) colors.primaryForeground else colors.foregroundSecondary,
            textAlign = TextAlign.Center,
        )
    }
}

private fun Modifier.minTouchHeight(): Modifier = this.heightIn(min = ApexSpacing.minTouch)
