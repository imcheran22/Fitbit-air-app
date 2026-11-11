package com.apex.athlete.core.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf

/** User theme preference (Settings > Display). Dark-first: the default follows the system, dark when unknown. */
enum class ThemePreference { SYSTEM, DARK, LIGHT }

val LocalApexColors = staticCompositionLocalOf { ApexDarkColors }
val LocalApexTypography = staticCompositionLocalOf { ApexTypography() }

/**
 * Root theme. Dynamic (wallpaper) colour is deliberately off: data colours carry meaning and must not shift.
 *
 * Components read tokens through [ApexTheme.colors] and [ApexTheme.type]. The Material 3 colour scheme is
 * mapped from the same tokens only so that any Material primitive used underneath (text fields, switches,
 * ripples) matches; screens should not style themselves with `MaterialTheme.colorScheme` directly.
 */
@Composable
fun ApexTheme(
    preference: ThemePreference = ThemePreference.SYSTEM,
    content: @Composable () -> Unit,
) {
    val dark = when (preference) {
        ThemePreference.SYSTEM -> isSystemInDarkTheme()
        ThemePreference.DARK -> true
        ThemePreference.LIGHT -> false
    }
    val colors = if (dark) ApexDarkColors else ApexLightColors
    val typography = ApexTypography()

    CompositionLocalProvider(
        LocalApexColors provides colors,
        LocalApexTypography provides typography,
    ) {
        MaterialTheme(
            colorScheme = colors.toMaterialColorScheme(),
            content = content,
        )
    }
}

object ApexTheme {
    val colors: ApexColors
        @Composable @ReadOnlyComposable get() = LocalApexColors.current

    val type: ApexTypography
        @Composable @ReadOnlyComposable get() = LocalApexTypography.current
}

internal fun ApexColors.toMaterialColorScheme(): ColorScheme {
    val base = if (isDark) darkColorScheme() else lightColorScheme()
    return base.copy(
        primary = primary,
        onPrimary = primaryForeground,
        secondary = secondary,
        onSecondary = foreground,
        tertiary = coach,
        onTertiary = primaryForeground,
        background = background,
        onBackground = foreground,
        surface = card,
        onSurface = foreground,
        surfaceVariant = secondary,
        onSurfaceVariant = mutedForeground,
        surfaceContainer = card,
        surfaceContainerHigh = popover,
        surfaceContainerHighest = popoverTop,
        surfaceContainerLow = muted,
        surfaceContainerLowest = inset,
        outline = input,
        outlineVariant = border,
        error = destructive,
        onError = foreground,
        scrim = dimStrong,
    )
}
