package app.fitdash.ui.theme

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.spring

object Motion {
    const val DRAW = 1400
    const val RISE = 600
    const val COUNT = 1600
    const val RING = 1200
    const val STAGGER = 60
    const val COLOUR = 1800
    const val PAGE = 450
    const val ENTER = 700
    val press = spring<Float>(dampingRatio = 0.55f, stiffness = 600f)
    val settle = spring<Float>(dampingRatio = 0.7f, stiffness = 300f)
    val ease = CubicBezierEasing(0.2f, 0.8f, 0.2f, 1f)
}
