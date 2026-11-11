package com.apex.athlete.core.ui.shell

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import com.apex.athlete.core.ui.components.ApexButton
import com.apex.athlete.core.ui.components.ApexButtonStyle
import com.apex.athlete.core.ui.components.ApexPreview
import com.apex.athlete.core.ui.theme.ApexShapes
import com.apex.athlete.core.ui.theme.ApexTheme

/**
 * Centred info dialog (Pulse 4.8), used for "how this is calculated". Popover gradient, 24 dp corners,
 * `dimStrong` scrim drawn here (the platform dim is zeroed), tap outside or the button to close.
 * [content] holds the explanation; keep sentences short and say what the number is not.
 */
@Composable
fun InfoCard(
    title: String,
    onDismiss: () -> Unit,
    dismissLabel: String,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    val colors = ApexTheme.colors
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        val window = (LocalView.current.parent as? DialogWindowProvider)?.window
        SideEffect { window?.setDimAmount(0f) }
        val brush = remember(colors) { Brush.verticalGradient(listOf(colors.popoverTop, colors.popover)) }
        Box(
            Modifier
                .fillMaxSize()
                .background(colors.dimStrong)
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onDismiss)
                .padding(24.dp),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                modifier
                    .widthIn(max = 400.dp)
                    .clip(ApexShapes.infoCard)
                    .background(brush)
                    // Swallow taps so they do not reach the scrim.
                    .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = {})
                    .verticalScroll(rememberScrollState())
                    .padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(title.uppercase(), style = ApexTheme.type.infoTitle, color = colors.foreground, modifier = Modifier.semantics { heading() })
                content()
                ApexButton(dismissLabel, onClick = onDismiss, style = ApexButtonStyle.Secondary, modifier = Modifier.align(Alignment.End))
            }
        }
    }
}

/** A body paragraph for [InfoCard] / sheets. */
@Composable
fun InfoParagraph(text: String, modifier: Modifier = Modifier) {
    Text(text, style = ApexTheme.type.body, color = ApexTheme.colors.foregroundBody, modifier = modifier)
}

@Preview(name = "InfoCard body dark")
@Composable
private fun InfoCardPreviewDark() = ApexPreview(dark = true) { InfoCardPreviewBody() }

@Preview(name = "InfoCard body light")
@Composable
private fun InfoCardPreviewLight() = ApexPreview(dark = false) { InfoCardPreviewBody() }

// Dialogs do not render in the preview pane; this shows the content layout on a popover surface.
@Composable
private fun InfoCardPreviewBody() {
    val colors = ApexTheme.colors
    Column(
        Modifier.clip(ApexShapes.infoCard).background(colors.popover).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("How Recovery is calculated", style = ApexTheme.type.infoTitle, color = colors.foreground)
        InfoParagraph("Recovery compares last night with your own 30-day range.")
    }
}
