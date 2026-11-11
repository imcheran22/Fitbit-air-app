package com.apex.athlete.core.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.theme.ApexShapes
import com.apex.athlete.core.ui.theme.ApexTheme

enum class ApexButtonStyle { Primary, Secondary, Destructive }

/** Caps label button, 48 dp minimum height, 12 dp corners, press scale 0.96. */
@Composable
fun ApexButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    style: ApexButtonStyle = ApexButtonStyle.Primary,
    enabled: Boolean = true,
    leadingIcon: ImageVector? = null,
) {
    val colors = ApexTheme.colors
    val container = when (style) {
        ApexButtonStyle.Primary -> colors.primary
        ApexButtonStyle.Secondary -> colors.secondary
        ApexButtonStyle.Destructive -> colors.destructive.copy(alpha = 0.16f)
    }
    val content = when (style) {
        ApexButtonStyle.Primary -> colors.primaryForeground
        ApexButtonStyle.Secondary -> colors.foreground
        ApexButtonStyle.Destructive -> colors.recoveryRedText
    }
    val source = remember { MutableInteractionSource() }
    Row(
        modifier = modifier
            .alpha(if (enabled) 1f else 0.4f)
            .apexClickable(onClick = onClick, role = Role.Button, enabled = enabled, interactionSource = source)
            .minTouchTarget()
            .background(container, ApexShapes.button)
            .padding(horizontal = 20.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (leadingIcon != null) {
            Icon(leadingIcon, contentDescription = null, tint = content, modifier = Modifier.size(18.dp))
            androidx.compose.foundation.layout.Spacer(Modifier.size(8.dp))
        }
        Text(text.uppercase(), style = ApexTheme.type.button, color = content, textAlign = TextAlign.Center)
    }
}

@Preview(name = "Buttons dark")
@Composable
private fun ButtonsPreviewDark() = ApexPreview(dark = true) { ButtonsPreviewBody() }

@Preview(name = "Buttons light")
@Composable
private fun ButtonsPreviewLight() = ApexPreview(dark = false) { ButtonsPreviewBody() }

@Composable
private fun ButtonsPreviewBody() {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        ApexButton("Connect", onClick = {})
        ApexButton("Retry", onClick = {}, style = ApexButtonStyle.Secondary, leadingIcon = ApexIcons.Sync)
        ApexButton("Delete all data", onClick = {}, style = ApexButtonStyle.Destructive)
        ApexButton("Disabled", onClick = {}, enabled = false)
    }
}
