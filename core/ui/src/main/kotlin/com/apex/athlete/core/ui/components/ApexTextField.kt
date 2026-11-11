package com.apex.athlete.core.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.ui.theme.ApexShapes
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme

/**
 * Single-purpose text field: caps [label] above, `field` fill, 48 dp minimum height, focus ring on focus,
 * [errorText] in the red text token with an icon-free sentence (colour is not the only signal: the text itself).
 * TalkBack reads the label and any error.
 */
@Composable
fun ApexTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    supportingText: String? = null,
    errorText: String? = null,
    enabled: Boolean = true,
    singleLine: Boolean = true,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    trailing: (@Composable () -> Unit)? = null,
) {
    val colors = ApexTheme.colors
    var focused by remember { mutableStateOf(false) }
    val borderColor = when {
        errorText != null -> colors.destructive
        focused -> colors.focusRing
        else -> colors.border
    }
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label.uppercase(), style = ApexTheme.type.statLabel, color = colors.mutedForeground)
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            enabled = enabled,
            singleLine = singleLine,
            textStyle = ApexTheme.type.body.copy(color = colors.foreground),
            cursorBrush = SolidColor(colors.foreground),
            keyboardOptions = keyboardOptions,
            keyboardActions = keyboardActions,
            visualTransformation = visualTransformation,
            modifier = Modifier
                .fillMaxWidth()
                .onFocusChanged { focused = it.isFocused }
                .semantics {
                    contentDescription = label
                    if (errorText != null) error(errorText)
                },
            decorationBox = { inner ->
                Box(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = ApexSpacing.minTouch)
                        .background(colors.field, ApexShapes.button)
                        .border(if (focused || errorText != null) 2.dp else 1.dp, borderColor, ApexShapes.button)
                        .padding(horizontal = 14.dp, vertical = 12.dp),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    androidx.compose.foundation.layout.Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.weight(1f)) {
                            if (value.isEmpty() && placeholder != null) {
                                Text(placeholder, style = ApexTheme.type.body, color = colors.mutedForeground)
                            }
                            inner()
                        }
                        if (trailing != null) trailing()
                    }
                }
            },
        )
        val below = errorText ?: supportingText
        if (below != null) {
            Text(
                below,
                style = ApexTheme.type.caption,
                color = if (errorText != null) colors.recoveryRedText else colors.mutedForeground,
            )
        }
    }
}

@Preview(name = "TextField dark")
@Composable
private fun TextFieldPreviewDark() = ApexPreview(dark = true) { TextFieldPreviewBody() }

@Preview(name = "TextField light")
@Composable
private fun TextFieldPreviewLight() = ApexPreview(dark = false) { TextFieldPreviewBody() }

@Composable
private fun TextFieldPreviewBody() {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        ApexTextField("62", {}, "Resting heart rate", supportingText = "Beats per minute")
        ApexTextField("", {}, "Max heart rate", placeholder = "Optional", errorText = "Enter a number between 120 and 230")
    }
}
