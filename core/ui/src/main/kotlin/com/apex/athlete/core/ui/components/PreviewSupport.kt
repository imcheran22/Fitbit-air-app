package com.apex.athlete.core.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.core.ui.theme.ThemePreference

/** Wraps a preview in the theme and a ground-coloured surface. Internal: previews only. */
@Composable
internal fun ApexPreview(dark: Boolean, content: @Composable () -> Unit) {
    ApexTheme(if (dark) ThemePreference.DARK else ThemePreference.LIGHT) {
        Box(Modifier.background(ApexTheme.colors.background).padding(16.dp)) {
            content()
        }
    }
}
