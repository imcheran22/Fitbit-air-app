package com.apex.athlete.core.ui.theme

import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/**
 * WCAG 2.1 contrast checks for the text tokens (DESIGN_SYSTEM.md §9): every text token must reach
 * 4.5:1 on a card and on the top of the ground, in both themes.
 */
class ColorContrastTest {

    private fun channel(c: Float): Double {
        val v = c.toDouble()
        return if (v <= 0.03928) v / 12.92 else ((v + 0.055) / 1.055).pow(2.4)
    }

    private fun luminance(c: Color): Double =
        0.2126 * channel(c.red) + 0.7152 * channel(c.green) + 0.0722 * channel(c.blue)

    private fun contrast(a: Color, b: Color): Double {
        val la = luminance(a)
        val lb = luminance(b)
        return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
    }

    private fun textTokens(c: ApexColors) = mapOf(
        "foreground" to c.foreground,
        "foregroundSecondary" to c.foregroundSecondary,
        "mutedForeground" to c.mutedForeground,
        "recoveryRedText" to c.recoveryRedText,
        "strainText" to c.strainText,
        "optimalText" to c.optimalText,
        "warningText" to c.warningText,
        "coachText" to c.coachText,
    )

    private fun assertReadable(theme: ApexColors) {
        val surfaces = mapOf("card" to theme.card, "backgroundTop" to theme.backgroundTop)
        val failures = buildList {
            for ((tName, t) in textTokens(theme)) for ((sName, s) in surfaces) {
                val ratio = contrast(t, s)
                if (ratio < 4.5) add("$tName on $sName = ${"%.2f".format(ratio)}")
            }
        }
        assertTrue("Text tokens below 4.5:1 (dark=${theme.isDark}): $failures", failures.isEmpty())
    }

    @Test
    fun darkTextTokensMeetAa() = assertReadable(ApexDarkColors)

    @Test
    fun lightTextTokensMeetAa() = assertReadable(ApexLightColors)

    @Test
    fun recoveryBandsFollowThresholds() {
        assertEquals(RecoveryBand.RED, recoveryBandOf(0))
        assertEquals(RecoveryBand.RED, recoveryBandOf(33))
        assertEquals(RecoveryBand.YELLOW, recoveryBandOf(34))
        assertEquals(RecoveryBand.YELLOW, recoveryBandOf(66))
        assertEquals(RecoveryBand.GREEN, recoveryBandOf(67))
        assertEquals(RecoveryBand.GREEN, recoveryBandOf(100))
    }

    @Test
    fun redTextUsesLiftedVariant() {
        assertEquals(ApexDarkColors.recoveryRedText, ApexDarkColors.recoveryTextColor(RecoveryBand.RED))
        assertEquals(ApexDarkColors.recoveryRed, ApexDarkColors.recoveryFill(RecoveryBand.RED))
    }
}
