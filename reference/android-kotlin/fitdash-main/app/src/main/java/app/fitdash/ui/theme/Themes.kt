package app.fitdash.ui.theme

import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import app.fitdash.settings.ThemeChoice

data class ThemeTokens(
    val bgTop: Color, val bgMid: Color, val bgBottom: Color,
    val text: Color, val muted: Color, val faint: Color, val accent: Color, val onAccent: Color,
    val good: Color, val warn: Color, val bad: Color,
    val card: Color, val hairline: Color, val chip: Color, val chipStrong: Color, val navBg: Color,
    val group: Color, val groupDivider: Color,
    val orb1: Color, val orb2: Color, val orb3: Color, val glow: Color, val onOrb: Color,
    val deep: Color, val light: Color, val rem: Color, val awake: Color,
    val glowWarm: Color, val glowCool: Color, val scoreGood: Color, val scoreWarn: Color, val scoreBad: Color,
    // Tile tints in the order of Tint, with a dark ink of each for text on them.
    val tints: List<Color>, val tintInk: List<Color>,
)

val LOOK = ThemeTokens(Color(0xFFF3EEF8), Color(0xFFF4F3EF), Color(0xFFF4F3EF),
    Color(0xFF1E1B2E), Color(0xFF6E6880), Color(0xFF6B6580), Color(0xFF3B2357), Color(0xFFFFFFFF),
    Color(0xFF4F7A22), Color(0xFFA86A12), Color(0xFFC23B33),
    Color(0xFFFFFFFF), Color(0x141E1B2E), Color(0xB0FFFFFF), Color(0x1F3B2357), Color(0xD9FFFFFF),
    Color(0xD1FFFFFF), Color(0xFFF0ECF3),
    Color(0xFFE6DAFB), Color(0xFFA17DF0), Color(0xFF8A66E6), Color(0x33A17DF0), Color(0xFF1E1B2E),
    Color(0xFF7A5CFF), Color(0xFFB79CF0), Color(0xFF58C7FF), Color(0xFFFFB86B),
    Color(0xFFFFF6C8), Color(0xFFD9C9F5), Color(0xFF8DB85A), Color(0xFFE3A06F), Color(0xFFD9604F),
    tints = listOf(Color(0xFFD7E9FB), Color(0xFFF4DCE6), Color(0xFFFCEBD8), Color(0xFFEFE6D2), Color(0xFFDDEEFF)),
    tintInk = listOf(Color(0xFF285A99), Color(0xFF7A3D5C), Color(0xFF7A4A24), Color(0xFF5E5236), Color(0xFF163B6B)))

val DARK = ThemeTokens(Color(0xFF15121F), Color(0xFF1A1726), Color(0xFF1A1726),
    Color(0xFFF2EEF8), Color(0xFFA79FB8), Color(0xFF7E7790), Color(0xFFB79CF0), Color(0xFF15121F),
    Color(0xFF8FD35A), Color(0xFFF2B544), Color(0xFFF07167),
    Color(0xFF231F30), Color(0x1AFFFFFF), Color(0x14FFFFFF), Color(0x47B79CF0), Color(0xE6231F30),
    Color(0xD9231F30), Color(0x14FFFFFF),
    Color(0xFFE6DAFB), Color(0xFFA17DF0), Color(0xFF8A66E6), Color(0x993B2D5E), Color(0xFFF2EEF8),
    Color(0xFF7A5CFF), Color(0xFFB79CF0), Color(0xFF58C7FF), Color(0xFFFFB86B),
    Color(0xFF5A4A1E), Color(0xFF3B2D5E), Color(0xFF8FD35A), Color(0xFFF2B544), Color(0xFFF07167),
    tints = listOf(Color(0xFF1E3550), Color(0xFF4A2638), Color(0xFF4A3220), Color(0xFF3C3524), Color(0xFF162F4A)),
    tintInk = listOf(Color(0xFFBFD8F5), Color(0xFFF2C7D9), Color(0xFFF5D2AE), Color(0xFFE3D7B8), Color(0xFFB9D5F2)))

fun resolveDark(choice: ThemeChoice, systemDark: Boolean) = when (choice) {
    ThemeChoice.SYSTEM -> systemDark
    ThemeChoice.LIGHT -> false
    ThemeChoice.DARK -> true
}

val LocalTheme = staticCompositionLocalOf { LOOK }

enum class Tint { SKY, ROSE, PEACH, SAND, WATER }
