package com.apex.athlete.core.ui.icons

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathBuilder
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

/**
 * Original outline icons, drawn on a 24 x 24 grid with a 1.75 stroke, round caps and joins
 * (DESIGN_SYSTEM.md section 2.7). The stroke colour is a mask: tint with `Icon(tint = ...)`.
 * No Pulse, WHOOP, Oura, Fitbit or Google artwork is used or traced.
 */
object ApexIcons {

    private const val STROKE = 1.75f

    private fun outline(name: String, block: PathBuilder.() -> Unit): ImageVector =
        ImageVector.Builder(
            name = name,
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f,
        ).path(
            stroke = SolidColor(Color.Black),
            strokeLineWidth = STROKE,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round,
            pathBuilder = block,
        ).build()

    private fun PathBuilder.circle(cx: Float, cy: Float, r: Float) {
        moveTo(cx - r, cy)
        arcTo(r, r, 0f, true, true, cx + r, cy)
        arcTo(r, r, 0f, true, true, cx - r, cy)
        close()
    }

    /** House outline with a trend line: the Overview tab. */
    val Overview: ImageVector by lazy {
        outline("ApexOverview") {
            moveTo(4f, 10.5f); lineTo(12f, 4f); lineTo(20f, 10.5f); lineTo(20f, 19.5f)
            lineTo(4f, 19.5f); close()
            moveTo(8f, 15f); lineTo(10.5f, 12.5f); lineTo(12.5f, 14.5f); lineTo(16f, 11f)
        }
    }

    /** Heart outline: the Health tab and resting heart rate. */
    val Heart: ImageVector by lazy {
        outline("ApexHeart") {
            moveTo(12f, 20f)
            curveTo(6f, 15.5f, 3f, 12.5f, 3f, 9f)
            curveTo(3f, 6.5f, 5f, 4.5f, 7.5f, 4.5f)
            curveTo(9.3f, 4.5f, 11f, 5.5f, 12f, 7f)
            curveTo(13f, 5.5f, 14.7f, 4.5f, 16.5f, 4.5f)
            curveTo(19f, 4.5f, 21f, 6.5f, 21f, 9f)
            curveTo(21f, 12.5f, 18f, 15.5f, 12f, 20f)
            close()
        }
    }

    /** Alias used by the tab bar. */
    val Health: ImageVector get() = Heart

    /** Notebook page with ruled lines: the Journal tab. */
    val Journal: ImageVector by lazy {
        outline("ApexJournal") {
            moveTo(7f, 3.5f); lineTo(17f, 3.5f); lineTo(18.5f, 5f); lineTo(18.5f, 19f)
            lineTo(17f, 20.5f); lineTo(7f, 20.5f); lineTo(5.5f, 19f); lineTo(5.5f, 5f); close()
            moveTo(9f, 9f); lineTo(15f, 9f)
            moveTo(9f, 12.5f); lineTo(15f, 12.5f)
            moveTo(9f, 16f); lineTo(12.5f, 16f)
        }
    }

    /** Three bars: the More tab. */
    val More: ImageVector by lazy {
        outline("ApexMore") {
            moveTo(4f, 7f); lineTo(20f, 7f)
            moveTo(4f, 12f); lineTo(20f, 12f)
            moveTo(4f, 17f); lineTo(20f, 17f)
        }
    }

    /** Four-point spark: the Coach floating action. */
    val Coach: ImageVector by lazy {
        outline("ApexCoach") {
            moveTo(12f, 3f)
            curveTo(12.8f, 8f, 16f, 11.2f, 21f, 12f)
            curveTo(16f, 12.8f, 12.8f, 16f, 12f, 21f)
            curveTo(11.2f, 16f, 8f, 12.8f, 3f, 12f)
            curveTo(8f, 11.2f, 11.2f, 8f, 12f, 3f)
            close()
        }
    }

    /** The original APEX mark: a peak with a crossbar. */
    val ApexMark: ImageVector by lazy {
        outline("ApexMark") {
            moveTo(3.5f, 19f); lineTo(12f, 4.5f); lineTo(20.5f, 19f)
            moveTo(7.8f, 14f); lineTo(16.2f, 14f)
        }
    }

    val Info: ImageVector by lazy {
        outline("ApexInfo") {
            circle(12f, 12f, 9f)
            moveTo(12f, 11f); lineTo(12f, 16.5f)
            moveTo(12f, 7.6f); lineTo(12f, 7.7f)
        }
    }

    val ChevronRight: ImageVector by lazy {
        outline("ApexChevronRight") { moveTo(9f, 6f); lineTo(15f, 12f); lineTo(9f, 18f) }
    }

    val ChevronLeft: ImageVector by lazy {
        outline("ApexChevronLeft") { moveTo(15f, 6f); lineTo(9f, 12f); lineTo(15f, 18f) }
    }

    val ChevronDown: ImageVector by lazy {
        outline("ApexChevronDown") { moveTo(6f, 9f); lineTo(12f, 15f); lineTo(18f, 9f) }
    }

    val ChevronUp: ImageVector by lazy {
        outline("ApexChevronUp") { moveTo(6f, 15f); lineTo(12f, 9f); lineTo(18f, 15f) }
    }

    val Back: ImageVector by lazy {
        outline("ApexBack") {
            moveTo(15f, 5f); lineTo(8f, 12f); lineTo(15f, 19f)
        }
    }

    val ArrowRight: ImageVector by lazy {
        outline("ApexArrowRight") {
            moveTo(5f, 12f); lineTo(19f, 12f)
            moveTo(13f, 6f); lineTo(19f, 12f); lineTo(13f, 18f)
        }
    }

    val Sync: ImageVector by lazy {
        outline("ApexSync") {
            moveTo(19.5f, 12f); arcTo(7.5f, 7.5f, 0f, false, false, 6.2f, 7.2f)
            moveTo(6f, 3.5f); lineTo(6f, 7.5f); lineTo(10f, 7.5f)
            moveTo(4.5f, 12f); arcTo(7.5f, 7.5f, 0f, false, false, 17.8f, 16.8f)
            moveTo(18f, 20.5f); lineTo(18f, 16.5f); lineTo(14f, 16.5f)
        }
    }

    val Moon: ImageVector by lazy {
        outline("ApexMoon") {
            moveTo(20f, 14.5f)
            arcTo(8f, 8f, 0f, true, true, 9.5f, 4f)
            arcTo(6.5f, 6.5f, 0f, false, false, 20f, 14.5f)
            close()
        }
    }

    val Bolt: ImageVector by lazy {
        outline("ApexBolt") {
            moveTo(13f, 3f); lineTo(5.5f, 13.5f); lineTo(11.5f, 13.5f); lineTo(10.5f, 21f)
            lineTo(18.5f, 10f); lineTo(12.5f, 10f); close()
        }
    }

    val Plus: ImageVector by lazy {
        outline("ApexPlus") {
            moveTo(12f, 5f); lineTo(12f, 19f)
            moveTo(5f, 12f); lineTo(19f, 12f)
        }
    }

    val Check: ImageVector by lazy {
        outline("ApexCheck") { moveTo(5f, 12.5f); lineTo(10f, 17.5f); lineTo(19f, 7f) }
    }

    val Warning: ImageVector by lazy {
        outline("ApexWarning") {
            moveTo(12f, 4f); lineTo(21f, 19.5f); lineTo(3f, 19.5f); close()
            moveTo(12f, 10f); lineTo(12f, 14f)
            moveTo(12f, 16.6f); lineTo(12f, 16.7f)
        }
    }

    val Hourglass: ImageVector by lazy {
        outline("ApexHourglass") {
            moveTo(7f, 3.5f); lineTo(17f, 3.5f)
            moveTo(7f, 20.5f); lineTo(17f, 20.5f)
            moveTo(7.5f, 3.5f); lineTo(7.5f, 7f); lineTo(12f, 12f); lineTo(16.5f, 7f); lineTo(16.5f, 3.5f)
            moveTo(7.5f, 20.5f); lineTo(7.5f, 17f); lineTo(12f, 12f); lineTo(16.5f, 17f); lineTo(16.5f, 20.5f)
        }
    }

    /** Heartbeat trace: heart rate variability. */
    val Pulse: ImageVector by lazy {
        outline("ApexPulse") {
            moveTo(3f, 12f); lineTo(7f, 12f); lineTo(9.5f, 6f); lineTo(13f, 18f); lineTo(15.5f, 12f); lineTo(21f, 12f)
        }
    }

    /** Three wind lines: respiratory rate. */
    val Wind: ImageVector by lazy {
        outline("ApexWind") {
            moveTo(3f, 9f); lineTo(14f, 9f); arcTo(2.5f, 2.5f, 0f, true, false, 11.5f, 6.5f)
            moveTo(3f, 14f); lineTo(17f, 14f); arcTo(2.5f, 2.5f, 0f, true, true, 14.5f, 16.5f)
            moveTo(3f, 18.5f); lineTo(10f, 18.5f)
        }
    }

    val Cloud: ImageVector by lazy {
        outline("ApexCloud") {
            moveTo(7f, 18f)
            arcTo(4f, 4f, 0f, false, true, 6.5f, 10.1f)
            arcTo(5.5f, 5.5f, 0f, false, true, 17f, 9f)
            arcTo(4.5f, 4.5f, 0f, false, true, 17.5f, 18f)
            close()
        }
    }

    /** Head and shoulders in a circle-less outline: the profile entry. */
    val Profile: ImageVector by lazy {
        outline("ApexProfile") {
            circle(12f, 8.5f, 3.75f)
            moveTo(4.5f, 20f)
            arcTo(7.5f, 7.5f, 0f, false, true, 19.5f, 20f)
        }
    }

    val Close: ImageVector by lazy {
        outline("ApexClose") {
            moveTo(6f, 6f); lineTo(18f, 18f)
            moveTo(18f, 6f); lineTo(6f, 18f)
        }
    }
}
