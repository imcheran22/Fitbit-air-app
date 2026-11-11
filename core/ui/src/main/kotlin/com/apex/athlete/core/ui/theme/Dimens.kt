package com.apex.athlete.core.ui.theme

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Easing
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Corner radii (DESIGN_SYSTEM.md §2.4). Do not mix: cards 16, rows 10, buttons in cards 12,
 * chips 8, sheets 28, pills full. Bars, tracks and dashes are always [bar] (2 dp), never pill-ended.
 */
object ApexRadius {
    val bar: Dp = 2.dp
    val swatch: Dp = 4.dp
    val chip: Dp = 8.dp
    val row: Dp = 10.dp
    val button: Dp = 12.dp
    val card: Dp = 16.dp
    val infoCard: Dp = 24.dp
    val sheet: Dp = 28.dp
    val glass: Dp = 22.dp
}

object ApexShapes {
    val bar = RoundedCornerShape(ApexRadius.bar)
    val swatch = RoundedCornerShape(ApexRadius.swatch)
    val chip = RoundedCornerShape(ApexRadius.chip)
    val row = RoundedCornerShape(ApexRadius.row)
    val button = RoundedCornerShape(ApexRadius.button)
    val card = RoundedCornerShape(ApexRadius.card)
    val infoCard = RoundedCornerShape(ApexRadius.infoCard)
    val sheetTop = RoundedCornerShape(topStart = ApexRadius.sheet, topEnd = ApexRadius.sheet)
    val glass = RoundedCornerShape(ApexRadius.glass)
    val pill = RoundedCornerShape(percent = 50)
}

/** Spacing and layout metrics on a 4 dp grid (DESIGN_SYSTEM.md §2.5, phone sizes). */
object ApexSpacing {
    val xxs: Dp = 2.dp
    val xs: Dp = 4.dp
    val sm: Dp = 8.dp
    val md: Dp = 12.dp
    val lg: Dp = 16.dp
    val xl: Dp = 24.dp
    val xxl: Dp = 32.dp

    /** Horizontal page gutter. */
    val gutter: Dp = 16.dp
    /** Inner padding of a card. */
    val cardPadding: Dp = 16.dp
    /** Gap between cards in a group. */
    val cardGap: Dp = 12.dp
    /** Gap between sections. */
    val sectionGap: Dp = 32.dp
    /** List row height inside cards. */
    val rowHeight: Dp = 56.dp
    /** Minimum touch target (the Apex brief requires 48 dp, stricter than the reference's 44). */
    val minTouch: Dp = 48.dp
    /** Floating glass tab bar height. */
    val tabBarHeight: Dp = 62.dp
    /** Round floating action button diameter. */
    val floatingAction: Dp = 62.dp
    /** Detail header height (excluding status bar inset). */
    val detailHeader: Dp = 52.dp
}

/** Score dial geometry (DESIGN_SYSTEM.md §5.1). Rings start after a 4° gap either side of 12 o'clock. */
object ApexDial {
    val miniDiameter: Dp = 22.dp
    val miniStroke: Dp = 3.dp
    val smallDiameter: Dp = 56.dp
    val smallStroke: Dp = 5.dp
    val homeDiameter: Dp = 96.dp
    val homeStroke: Dp = 6.dp
    val heroDiameter: Dp = 240.dp
    val heroStroke: Dp = 14.dp
    const val TOP_GAP_DEGREES: Float = 4f
}

/** Motion tokens (DESIGN_SYSTEM.md §2.7). Every animation must honour the system "remove animations" setting. */
object ApexMotion {
    const val FAST_MS: Int = 150
    const val BASE_MS: Int = 220
    const val ENTER_MS: Int = 300
    const val OVERLAY_IN_MS: Int = 320
    const val OVERLAY_OUT_MS: Int = 200
    const val DIAL_SWEEP_MS: Int = 700
    const val MINI_RING_MS: Int = 500
    const val CHART_DRAW_MS: Int = 500
    const val PRESS_SCALE: Float = 0.96f

    val standard: Easing = CubicBezierEasing(0.2f, 0f, 0f, 1f)
    val outExpo: Easing = CubicBezierEasing(0.16f, 1f, 0.3f, 1f)
    val inQuick: Easing = CubicBezierEasing(0.4f, 0f, 1f, 1f)
}
