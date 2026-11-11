package app.fitdash.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color
import app.fitdash.metrics.BmiBand
import app.fitdash.metrics.RegularityBand
import kotlin.math.roundToInt

fun scoreColor(score: Int, bad: Color, warn: Color, good: Color): Color {
    val s = score.coerceIn(0, 100)
    val (lo, hi, t) = if (s <= 50) Triple(bad, warn, s / 50f) else Triple(warn, good, (s - 50) / 50f)
    fun mix(a: Float, b: Float) = (((a + (b - a) * t) * 255).roundToInt())
    return Color(mix(lo.red, hi.red), mix(lo.green, hi.green), mix(lo.blue, hi.blue))
}

// Three clear pastels: a blend of the dark text greens and ambers turns olive on white.
fun scoreColor(score: Int, t: ThemeTokens): Color = when {
    score >= 70 -> t.scoreGood
    score >= 50 -> t.scoreWarn
    else -> t.scoreBad
}

@Composable
@ReadOnlyComposable
fun scoreColor(score: Int): Color = scoreColor(score, LocalTheme.current)

// A single night's score never reaches the alarm colour.
@Composable
@ReadOnlyComposable
fun sleepScoreColour(score: Int): Color = scoreColor(score.coerceAtLeast(50))

@Composable
@ReadOnlyComposable
fun regularityColour(band: RegularityBand): Color = LocalTheme.current.let {
    when (band) {
        RegularityBand.VERY_REGULAR -> it.good
        RegularityBand.REGULAR -> it.accent
        RegularityBand.VARIES, RegularityBand.IRREGULAR -> it.warn
    }
}

@Composable
@ReadOnlyComposable
fun bmiColour(band: BmiBand): Color = LocalTheme.current.let {
    when (band) {
        BmiBand.UNDER, BmiBand.OVER -> it.warn
        BmiBand.HEALTHY -> it.good
        BmiBand.OBESE -> it.bad
    }
}

fun breathMillis(score: Int): Int = (7000 - (score.coerceIn(15, 98) - 15) / 83.0 * 3000).roundToInt()
