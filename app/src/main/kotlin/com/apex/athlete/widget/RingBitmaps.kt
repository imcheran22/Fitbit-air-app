package com.apex.athlete.widget

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import com.apex.athlete.core.ui.components.DialMath

/**
 * Draws the dial rings of the widgets. Glance has no canvas, so each ring is drawn here with
 * `android.graphics.Canvas` and shown as an image. The geometry is the app's own dial (`DialMath`): it starts
 * 4 degrees after 12 o'clock and runs clockwise with a gap at the top.
 *
 * The pixels are opaque white and only their shape matters: the widget tints each bitmap with a theme colour
 * from [WidgetPalette], so the same bitmap is correct in light and dark.
 */
internal object RingBitmaps {

    /** The full track behind the fill. */
    fun track(sizePx: Int, strokePx: Float): Bitmap = arc(sizePx, strokePx, DialMath.TRACK_SWEEP)

    /** The filled part for a 0..1 [fraction]; empty (fully transparent) at zero. */
    fun fill(sizePx: Int, strokePx: Float, fraction: Float): Bitmap = arc(sizePx, strokePx, DialMath.sweepFor(fraction))

    private fun arc(sizePx: Int, strokePx: Float, sweep: Float): Bitmap {
        val size = sizePx.coerceAtLeast(1)
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        if (sweep <= 0f) return bitmap
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeCap = Paint.Cap.ROUND
            strokeWidth = strokePx
            color = Color.WHITE
        }
        val inset = strokePx / 2f
        val oval = RectF(inset, inset, size - inset, size - inset)
        Canvas(bitmap).drawArc(oval, DialMath.START_ANGLE, sweep, false, paint)
        return bitmap
    }
}
