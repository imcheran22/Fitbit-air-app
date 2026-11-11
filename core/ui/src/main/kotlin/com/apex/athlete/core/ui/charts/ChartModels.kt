package com.apex.athlete.core.ui.charts

import androidx.compose.runtime.Immutable
import com.apex.athlete.core.domain.SleepStage
import com.apex.athlete.core.ui.theme.ApexColors
import com.apex.athlete.core.ui.theme.RecoveryBand
import com.apex.athlete.core.ui.theme.recoveryBandOf
import androidx.compose.ui.graphics.Color
import java.time.ZoneId

/*
 * Plain chart input models. core:ui does not depend on core:data or core:analytics, so screens map
 * their repository types onto these (for example TrendPoint(epochDay, value) -> ChartPoint(epochDay, value)).
 *
 * X conventions:
 * - Daily charts (trend, sparkline, ACWR, bars): x = epoch day (days since 1970-01-01, local date).
 * - Intraday charts (heart rate, hypnogram): x = epoch milliseconds (UTC instant); the chart converts to
 *   local time with the supplied [ChartClock].
 * A null y is a missing reading. It is never interpolated; the line breaks.
 */

/** One sample of a series. [y] == null is a gap. */
@Immutable
data class ChartPoint(val x: Long, val y: Double?)

/** A shaded range on the y axis, for example the 28-day personal baseline (mean -/+ 1 SD). */
@Immutable
data class ChartBand(val low: Double, val high: Double)

/** A shaded span on the x axis, for example a workout. Same x unit as the chart's points. */
@Immutable
data class ChartSpan(val startX: Long, val endX: Long, val label: String)

/** A horizontal guide line on the y axis, for example a heart-rate zone boundary. */
@Immutable
data class ChartGuide(val y: Double, val label: String)

/** Time zone and 12/24 hour preference used for every clock label. */
@Immutable
data class ChartClock(val zone: ZoneId = ZoneId.systemDefault(), val use24Hour: Boolean = true)

/** One sleep stage run on the hypnogram. Overlaps are drawn in list order; gaps stay empty. */
@Immutable
data class HypnogramSegment(val startMillis: Long, val endMillis: Long, val stage: SleepStage)

/** One heart-rate zone row. [seconds] == null means unknown (shows `--`), 0 means measured zero. */
@Immutable
data class ZoneMinutes(
    val zoneLabel: String,
    val rangeLabel: String?,
    val seconds: Long?,
)

/** Colour meaning of a bar. Maps to tokens in [toneColor] (DESIGN_SYSTEM.md section 2.2). */
enum class ChartTone { RECOVERY_GREEN, RECOVERY_YELLOW, RECOVERY_RED, STRAIN, SLEEP, OPTIMAL, WARNING, NEUTRAL }

fun ApexColors.toneColor(tone: ChartTone): Color = when (tone) {
    ChartTone.RECOVERY_GREEN -> recoveryGreen
    ChartTone.RECOVERY_YELLOW -> recoveryYellow
    ChartTone.RECOVERY_RED -> recoveryRed
    ChartTone.STRAIN -> strain
    ChartTone.SLEEP -> sleep
    ChartTone.OPTIMAL -> optimal
    ChartTone.WARNING -> warning
    ChartTone.NEUTRAL -> mutedForeground
}

/** One day of a bar chart. [value] == null is an empty slot (missing day). */
@Immutable
data class DailyBar(
    val epochDay: Long,
    val value: Double?,
    val tone: ChartTone = ChartTone.NEUTRAL,
    val provisional: Boolean = false,
)

/** ACWR band classification for the training-load chart (DESIGN_SYSTEM.md section 2.2). */
enum class AcwrBand { LOW, OPTIMAL, ELEVATED, HIGH }

/** 0.8 to < 1.3 optimal, 1.3 to < 1.5 elevated (warning), >= 1.5 high (red), < 0.8 low (muted). */
fun acwrBandOf(ratio: Double): AcwrBand = when {
    ratio >= 1.5 -> AcwrBand.HIGH
    ratio >= 1.3 -> AcwrBand.ELEVATED
    ratio >= 0.8 -> AcwrBand.OPTIMAL
    else -> AcwrBand.LOW
}

fun ApexColors.acwrColor(band: AcwrBand): Color = when (band) {
    AcwrBand.LOW -> mutedForeground
    AcwrBand.OPTIMAL -> optimal
    AcwrBand.ELEVATED -> warning
    AcwrBand.HIGH -> recoveryRed
}

/** Text colour for an ACWR band (uses the contrast-lifted variants). */
fun ApexColors.acwrTextColor(band: AcwrBand): Color = when (band) {
    AcwrBand.LOW -> mutedForeground
    AcwrBand.OPTIMAL -> optimalText
    AcwrBand.ELEVATED -> warningText
    AcwrBand.HIGH -> recoveryRedText
}

/** Bar tone for a recovery score (green >= 67, yellow 34-66, red <= 33; DESIGN_SYSTEM section 2.3). */
fun recoveryTone(score: Int): ChartTone = when (recoveryBandOf(score)) {
    RecoveryBand.GREEN -> ChartTone.RECOVERY_GREEN
    RecoveryBand.YELLOW -> ChartTone.RECOVERY_YELLOW
    RecoveryBand.RED -> ChartTone.RECOVERY_RED
}
