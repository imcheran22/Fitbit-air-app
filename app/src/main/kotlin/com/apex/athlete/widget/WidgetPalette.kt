package com.apex.athlete.widget

import androidx.glance.color.ColorProvider
import com.apex.athlete.core.ui.theme.ApexDarkColors
import com.apex.athlete.core.ui.theme.ApexLightColors
import com.apex.athlete.core.ui.theme.RecoveryBand
import com.apex.athlete.core.ui.theme.recoveryFill

/**
 * Widget colours, all taken from the `:core:ui` tokens (no hex here). Each is a day/night pair, so the launcher
 * switches them with the system theme without Apex running. Glance cannot draw on a canvas, so the rings are
 * white alpha masks (see [RingBitmaps]) that are tinted with these pairs; that keeps the rings in step with the
 * theme too.
 */
internal object WidgetPalette {
    private val light = ApexLightColors
    private val dark = ApexDarkColors

    val surface = ColorProvider(light.card, dark.card)
    val foreground = ColorProvider(light.foreground, dark.foreground)
    val secondary = ColorProvider(light.foregroundSecondary, dark.foregroundSecondary)
    val muted = ColorProvider(light.mutedForeground, dark.mutedForeground)
    val track = ColorProvider(light.dialTrack, dark.dialTrack)
    val accentText = ColorProvider(light.strainText, dark.strainText)

    /** Ring fill for [kind]; recovery follows its band (green, yellow, red). */
    fun fill(kind: RingKind, band: RecoveryBand?) = when (kind) {
        RingKind.RECOVERY -> {
            val b = band ?: RecoveryBand.RED
            ColorProvider(light.recoveryFill(b), dark.recoveryFill(b))
        }
        RingKind.SLEEP -> ColorProvider(light.sleep, dark.sleep)
        RingKind.STRAIN -> ColorProvider(light.strain, dark.strain)
    }
}
