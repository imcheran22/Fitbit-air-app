package app.fitdash.widget

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb

// Glance has no canvas, so the ring and sparklines are drawn into bitmaps at the widget's pixel size.

fun ringBitmap(sizePx: Int, fraction: Float, color: Color, track: Color): Bitmap {
    val bmp = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bmp)
    val stroke = sizePx * 0.11f
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = stroke; strokeCap = Paint.Cap.ROUND }
    val box = RectF(stroke / 2, stroke / 2, sizePx - stroke / 2, sizePx - stroke / 2)
    canvas.drawArc(box, 0f, 360f, false, paint.apply { this.color = track.toArgb() })
    if (fraction > 0f) canvas.drawArc(box, -90f, 360f * fraction.coerceIn(0f, 1f), false, paint.apply { this.color = color.toArgb() })
    return bmp
}

// Seven days as a line with a dot on the latest; gaps are skipped. Null values only: an empty bitmap.
fun sparkBitmap(widthPx: Int, heightPx: Int, values: List<Double?>, color: Color): Bitmap {
    val bmp = Bitmap.createBitmap(widthPx, heightPx, Bitmap.Config.ARGB_8888)
    val known = values.filterNotNull()
    if (known.size < 2) return bmp
    val canvas = Canvas(bmp)
    val pad = heightPx * 0.15f
    val lo = known.min()
    val span = (known.max() - lo).takeIf { it > 0 } ?: 1.0
    fun x(i: Int) = pad + (widthPx - 2 * pad) * i / (values.size - 1).coerceAtLeast(1)
    fun y(v: Double) = (heightPx - pad - (heightPx - 2 * pad) * ((v - lo) / span)).toFloat()
    val path = Path()
    var started = false
    values.forEachIndexed { i, v ->
        if (v == null) return@forEachIndexed
        if (!started) path.moveTo(x(i), y(v)) else path.lineTo(x(i), y(v))
        started = true
    }
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeWidth = heightPx * 0.07f; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND; this.color = color.toArgb()
    }
    canvas.drawPath(path, paint)
    val last = values.indexOfLast { it != null }
    canvas.drawCircle(x(last), y(values[last]!!), heightPx * 0.09f, Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color.toArgb() })
    return bmp
}
