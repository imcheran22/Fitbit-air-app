package com.apex.athlete.ui.health

import android.content.res.Configuration
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.ui.theme.ApexTheme

/**
 * Theme (following the preview's night mode) plus the ground colour, for this area's previews.
 * The kit's own preview wrapper is internal to :core:ui.
 */
@Composable
internal fun HealthPreviewFrame(content: @Composable () -> Unit) {
    ApexTheme {
        Box(Modifier.background(ApexTheme.colors.background).padding(16.dp)) { content() }
    }
}

/** One annotation for a light and a dark preview of the same composable. */
@Preview(name = "Dark", uiMode = Configuration.UI_MODE_NIGHT_YES or Configuration.UI_MODE_TYPE_NORMAL, heightDp = 900)
@Preview(name = "Light", uiMode = Configuration.UI_MODE_NIGHT_NO or Configuration.UI_MODE_TYPE_NORMAL, heightDp = 900)
internal annotation class HealthThemePreviews
