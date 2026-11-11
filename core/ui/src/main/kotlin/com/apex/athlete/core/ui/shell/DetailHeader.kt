package com.apex.athlete.core.ui.shell

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.ui.components.ApexPreview
import com.apex.athlete.core.ui.components.apexClickable
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme

/**
 * Detail screen header (Pulse 4.4): back, centred caps title (usually the date), info button. 52 dp plus the
 * status bar inset; both buttons are 48 dp targets. [onInfo] null hides the info button.
 */
@Composable
fun DetailHeader(
    title: String,
    onBack: () -> Unit,
    backDescription: String,
    modifier: Modifier = Modifier,
    onInfo: (() -> Unit)? = null,
    infoDescription: String? = null,
) {
    val colors = ApexTheme.colors
    Box(
        modifier
            .fillMaxWidth()
            .windowInsetsPadding(WindowInsets.statusBars)
            .height(ApexSpacing.detailHeader)
            .padding(horizontal = 4.dp),
    ) {
        Box(
            Modifier
                .align(Alignment.CenterStart)
                .size(ApexSpacing.minTouch)
                .apexClickable(onClick = onBack, role = Role.Button)
                .semantics { contentDescription = backDescription },
            contentAlignment = Alignment.Center,
        ) {
            Icon(ApexIcons.Back, null, Modifier.size(24.dp), tint = colors.foreground)
        }
        Text(
            title.uppercase(),
            style = ApexTheme.type.detailTitle,
            color = colors.foreground,
            textAlign = TextAlign.Center,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .align(Alignment.Center)
                .padding(horizontal = ApexSpacing.minTouch + 8.dp)
                .semantics { heading() },
        )
        if (onInfo != null) {
            Box(
                Modifier
                    .align(Alignment.CenterEnd)
                    .size(ApexSpacing.minTouch)
                    .apexClickable(onClick = onInfo, role = Role.Button)
                    .semantics { if (infoDescription != null) contentDescription = infoDescription },
                contentAlignment = Alignment.Center,
            ) {
                Icon(ApexIcons.Info, null, Modifier.size(24.dp), tint = colors.foreground)
            }
        }
    }
}

@Preview(name = "DetailHeader dark")
@Composable
private fun DetailHeaderPreviewDark() = ApexPreview(dark = true) { DetailHeader("Today", {}, "Back", onInfo = {}, infoDescription = "How this is calculated") }

@Preview(name = "DetailHeader light")
@Composable
private fun DetailHeaderPreviewLight() = ApexPreview(dark = false) { DetailHeader("Today", {}, "Back", onInfo = {}, infoDescription = "How this is calculated") }
