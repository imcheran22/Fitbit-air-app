package com.apex.athlete.core.ui.charts

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.tooling.preview.PreviewParameterProvider
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.domain.SleepStage
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.core.ui.theme.ThemePreference
import java.time.ZoneId
import java.time.ZoneOffset
import kotlin.math.sin

/*
 * Previews only. Every number below is deterministic SAMPLE data for the IDE preview pane; it is never shipped
 * to screens and is not health data. Each @Preview renders in light (false) and dark (true) via the parameter.
 */

private class ThemeFlags : PreviewParameterProvider<Boolean> {
    override val values: Sequence<Boolean> = sequenceOf(false, true)
}

@Composable
private fun PreviewSurface(dark: Boolean, content: @Composable () -> Unit) {
    ApexTheme(preference = if (dark) ThemePreference.DARK else ThemePreference.LIGHT) {
        Column(Modifier.background(ApexTheme.colors.card).padding(16.dp)) { content() }
    }
}

private const val DAY0 = 20_000L
private const val MS_HOUR = 3_600_000L
private const val MS_MIN = 60_000L
private const val MS_DAY = 86_400_000L
private val UTC: ZoneId = ZoneOffset.UTC
private val clock24 = ChartClock(UTC, true)
private val clock12 = ChartClock(UTC, false)

private fun hrSample(): List<ChartPoint> = (0..144).map { i ->
    val t = DAY0 * MS_DAY + 6 * MS_HOUR + i * 5 * MS_MIN
    val hour = 6.0 + i / 12.0
    val y: Double? = when {
        hour in 11.0..11.7 -> null
        hour in 14.0..15.0 -> 140.0 + 15.0 * sin(i * 0.7)
        else -> 64.0 + 12.0 * sin(i * 0.15)
    }
    ChartPoint(t, y)
}

private fun hypnogramSample(): List<HypnogramSegment> {
    val plan = listOf(
        SleepStage.AWAKE to 6, SleepStage.LIGHT to 20, SleepStage.DEEP to 45, SleepStage.LIGHT to 25,
        SleepStage.REM to 15, SleepStage.LIGHT to 30, SleepStage.DEEP to 30, SleepStage.LIGHT to 35,
        SleepStage.REM to 25, SleepStage.AWAKE to 5, SleepStage.LIGHT to 40, SleepStage.REM to 35,
        SleepStage.LIGHT to 45, SleepStage.AWAKE to 4, SleepStage.LIGHT to 30, SleepStage.REM to 40,
        SleepStage.LIGHT to 25, SleepStage.AWAKE to 8,
    )
    val out = ArrayList<HypnogramSegment>()
    var t = DAY0 * MS_DAY + 22 * MS_HOUR + 48 * MS_MIN
    for ((i, p) in plan.withIndex()) {
        val end = t + p.second * MS_MIN
        out.add(HypnogramSegment(t, end, p.first))
        t = end
        if (i == 9) t += 10 * MS_MIN // a real hole in the record
    }
    return out
}

private fun zonesSample() = listOf(
    ZoneMinutes("Zone 5", "175+ bpm", 61L),
    ZoneMinutes("Zone 4", "161 - 174 bpm", 1_500L),
    ZoneMinutes("Zone 3", "140 - 160 bpm", 2_400L),
    ZoneMinutes("Zone 2", "119 - 139 bpm", 1_800L),
    ZoneMinutes("Zone 1", "98 - 118 bpm", 600L),
    ZoneMinutes("Zone 0", "below 98 bpm", 0L),
)

private fun acwrSample(): Triple<List<ChartPoint>, List<ChartPoint>, List<ChartPoint>> {
    val acute = ArrayList<ChartPoint>()
    val chronic = ArrayList<ChartPoint>()
    val ratio = ArrayList<ChartPoint>()
    for (d in 0 until 56) {
        val day = DAY0 + d
        val missing = d in 30..31
        val a = 40.0 + 18.0 * sin(d * 0.3)
        val c = 38.0 + 5.0 * sin(d * 0.1)
        acute.add(ChartPoint(day, if (missing) null else a))
        chronic.add(ChartPoint(day, if (missing) null else c))
        ratio.add(ChartPoint(day, if (missing || d < 14) null else a / c))
    }
    return Triple(acute, chronic, ratio)
}

private fun trendSample(days: Int): List<ChartPoint> = (0 until days).map { d ->
    val missing = d == 10 || d == 11 || d == 20
    ChartPoint(DAY0 + d, if (missing) null else 55.0 + 8.0 * sin(d * 0.5))
}

private fun barsSample(): List<DailyBar> = (0 until 14).map { d ->
    val score = (60.0 + 35.0 * sin(d * 0.9)).toInt().coerceIn(5, 100)
    DailyBar(DAY0 + d, if (d == 5 || d == 6) null else score.toDouble(), recoveryTone(score), provisional = d == 13)
}

// ---- Intraday heart rate ----

@Preview(name = "HR full", showBackground = true)
@Composable
private fun IntradayHrFullPreview(@PreviewParameter(ThemeFlags::class) dark: Boolean) = PreviewSurface(dark) {
    IntradayHrChart(
        points = hrSample(),
        windowStartMillis = DAY0 * MS_DAY + 6 * MS_HOUR,
        windowEndMillis = DAY0 * MS_DAY + 18 * MS_HOUR,
        clock = clock24,
        workoutSpans = listOf(ChartSpan(DAY0 * MS_DAY + 14 * MS_HOUR, DAY0 * MS_DAY + 15 * MS_HOUR, "Run")),
        zoneGuides = listOf(ChartGuide(105.0, "Z1"), ChartGuide(140.0, "Z3")),
        nowMillis = DAY0 * MS_DAY + 16 * MS_HOUR,
        provenance = "Fitbit, synced 16:02",
        reducedMotion = true,
    )
}

@Preview(name = "HR sparse, 12 h clock", showBackground = true)
@Composable
private fun IntradayHrSparsePreview(@PreviewParameter(ThemeFlags::class) dark: Boolean) = PreviewSurface(dark) {
    val t = DAY0 * MS_DAY + 9 * MS_HOUR
    IntradayHrChart(
        points = listOf(ChartPoint(t, 70.0), ChartPoint(t + 3 * MS_HOUR, 88.0), ChartPoint(t + 3 * MS_HOUR + 20 * MS_MIN, 90.0)),
        windowStartMillis = DAY0 * MS_DAY + 6 * MS_HOUR,
        windowEndMillis = DAY0 * MS_DAY + 18 * MS_HOUR,
        clock = clock12,
        reducedMotion = true,
    )
}

@Preview(name = "HR empty", showBackground = true)
@Composable
private fun IntradayHrEmptyPreview(@PreviewParameter(ThemeFlags::class) dark: Boolean) = PreviewSurface(dark) {
    IntradayHrChart(emptyList(), 0L, MS_DAY, clock24, reducedMotion = true)
}

// ---- Hypnogram ----

@Preview(name = "Hypnogram full", showBackground = true)
@Composable
private fun HypnogramFullPreview(@PreviewParameter(ThemeFlags::class) dark: Boolean) = PreviewSurface(dark) {
    SleepHypnogramChart(hypnogramSample(), clock24, provenance = "Fitbit, synced 07:02", reducedMotion = true)
}

@Preview(name = "Hypnogram sparse", showBackground = true)
@Composable
private fun HypnogramSparsePreview(@PreviewParameter(ThemeFlags::class) dark: Boolean) = PreviewSurface(dark) {
    SleepHypnogramChart(hypnogramSample().take(3), clock12, reducedMotion = true)
}

@Preview(name = "Hypnogram empty", showBackground = true)
@Composable
private fun HypnogramEmptyPreview(@PreviewParameter(ThemeFlags::class) dark: Boolean) = PreviewSurface(dark) {
    SleepHypnogramChart(emptyList(), clock24, reducedMotion = true)
}

// ---- Zone bars ----

@Preview(name = "Zones full", showBackground = true)
@Composable
private fun ZoneBarsFullPreview(@PreviewParameter(ThemeFlags::class) dark: Boolean) = PreviewSurface(dark) {
    ZoneBars(zonesSample(), caption = "Zones from your max heart rate of 186 bpm.", provenance = "Fitbit", reducedMotion = true)
}

@Preview(name = "Zones sparse", showBackground = true)
@Composable
private fun ZoneBarsSparsePreview(@PreviewParameter(ThemeFlags::class) dark: Boolean) = PreviewSurface(dark) {
    ZoneBars(
        listOf(ZoneMinutes("Zone 2", "119 - 139 bpm", 420L), ZoneMinutes("Zone 1", "98 - 118 bpm", null)),
        reducedMotion = true,
    )
}

@Preview(name = "Zones empty", showBackground = true)
@Composable
private fun ZoneBarsEmptyPreview(@PreviewParameter(ThemeFlags::class) dark: Boolean) = PreviewSurface(dark) {
    ZoneBars(emptyList(), reducedMotion = true)
}

// ---- ACWR ----

@Preview(name = "ACWR full", showBackground = true)
@Composable
private fun AcwrFullPreview(@PreviewParameter(ThemeFlags::class) dark: Boolean) = PreviewSurface(dark) {
    val (a, c, r) = acwrSample()
    AcwrTrendChart(
        acute = a, chronic = c, acwr = r,
        monotony = 1.4,
        caveat = "Load is a TRIMP estimate from heart rate; fewer than 28 days of history.",
        provenance = "Calculated by Apex from Fitbit heart rate",
        reducedMotion = true,
    )
}

@Preview(name = "ACWR sparse", showBackground = true)
@Composable
private fun AcwrSparsePreview(@PreviewParameter(ThemeFlags::class) dark: Boolean) = PreviewSurface(dark) {
    val (a, c, r) = acwrSample()
    AcwrTrendChart(a.take(5), c.take(5), r.take(5), caveat = "Not enough history for a ratio yet.", reducedMotion = true)
}

@Preview(name = "ACWR empty", showBackground = true)
@Composable
private fun AcwrEmptyPreview(@PreviewParameter(ThemeFlags::class) dark: Boolean) = PreviewSurface(dark) {
    AcwrTrendChart(emptyList(), emptyList(), emptyList(), reducedMotion = true)
}

// ---- Trend line ----

@Preview(name = "Trend full", showBackground = true)
@Composable
private fun TrendFullPreview(@PreviewParameter(ThemeFlags::class) dark: Boolean) = PreviewSurface(dark) {
    TrendLineChart(
        title = "Heart rate variability",
        points = trendSample(30),
        rangeDays = 30,
        endDay = DAY0 + 29,
        baseline = ChartBand(50.0, 62.0),
        valueSuffix = " ms",
        provenance = "Fitbit, 30 days",
        reducedMotion = true,
    )
}

@Preview(name = "Trend sparse", showBackground = true)
@Composable
private fun TrendSparsePreview(@PreviewParameter(ThemeFlags::class) dark: Boolean) = PreviewSurface(dark) {
    TrendLineChart(
        title = "Resting heart rate",
        points = listOf(ChartPoint(DAY0 + 1, 52.0), ChartPoint(DAY0 + 4, 54.0), ChartPoint(DAY0 + 5, 53.0)),
        rangeDays = 7,
        endDay = DAY0 + 6,
        valueSuffix = " bpm",
        reducedMotion = true,
    )
}

@Preview(name = "Trend empty", showBackground = true)
@Composable
private fun TrendEmptyPreview(@PreviewParameter(ThemeFlags::class) dark: Boolean) = PreviewSurface(dark) {
    TrendLineChart("Heart rate variability", emptyList(), 90, DAY0 + 89, reducedMotion = true)
}

// ---- Daily bars ----

@Preview(name = "Bars full", showBackground = true)
@Composable
private fun DailyBarsFullPreview(@PreviewParameter(ThemeFlags::class) dark: Boolean) = PreviewSurface(dark) {
    DailyBarChart(
        title = "Recovery", bars = barsSample(), startDay = DAY0, endDay = DAY0 + 13,
        yMax = 100.0, valueSuffix = "%", provenance = "Calculated by Apex", reducedMotion = true,
    )
}

@Preview(name = "Bars sparse", showBackground = true)
@Composable
private fun DailyBarsSparsePreview(@PreviewParameter(ThemeFlags::class) dark: Boolean) = PreviewSurface(dark) {
    DailyBarChart(
        title = "Strain", bars = listOf(DailyBar(DAY0 + 2, 11.2, ChartTone.STRAIN), DailyBar(DAY0 + 12, 8.4, ChartTone.STRAIN)),
        startDay = DAY0, endDay = DAY0 + 13, yMax = 21.0, targetBand = ChartBand(10.0, 14.0), decimals = 1, reducedMotion = true,
    )
}

@Preview(name = "Bars empty", showBackground = true)
@Composable
private fun DailyBarsEmptyPreview(@PreviewParameter(ThemeFlags::class) dark: Boolean) = PreviewSurface(dark) {
    DailyBarChart("Strain", emptyList(), DAY0, DAY0 + 13, reducedMotion = true)
}

// ---- Biometric sparkline card ----

@Preview(name = "Sparkline card full", showBackground = true)
@Composable
private fun SparklineFullPreview(@PreviewParameter(ThemeFlags::class) dark: Boolean) = PreviewSurface(dark) {
    BiometricSparklineCard(
        title = "Heart rate variability", valueText = "58", unit = "ms",
        points = trendSample(14), startDay = DAY0, endDay = DAY0 + 13,
        baseline = ChartBand(50.0, 62.0), zScore = 0.4, provenance = "Fitbit, synced 07:02",
        onClick = {}, reducedMotion = true,
    )
}

@Preview(name = "Sparkline card sparse", showBackground = true)
@Composable
private fun SparklineSparsePreview(@PreviewParameter(ThemeFlags::class) dark: Boolean) = PreviewSurface(dark) {
    BiometricSparklineCard(
        title = "Skin temperature", valueText = "-0.3", unit = "C",
        points = listOf(ChartPoint(DAY0 + 3, -0.1), ChartPoint(DAY0 + 11, -0.3)),
        startDay = DAY0, endDay = DAY0 + 13, baseline = null, zScore = null,
        statusLabel = "Calibrating", provenance = "Fitbit, synced 07:02", onClick = {}, reducedMotion = true,
    )
}

@Preview(name = "Sparkline card empty", showBackground = true)
@Composable
private fun SparklineEmptyPreview(@PreviewParameter(ThemeFlags::class) dark: Boolean) = PreviewSurface(dark) {
    BiometricSparklineCard(
        title = "Blood oxygen", valueText = null, unit = "%",
        points = emptyList(), startDay = DAY0, endDay = DAY0 + 13, baseline = null, zScore = null,
        statusLabel = "Unavailable", provenance = "No source reported this metric", onClick = {}, reducedMotion = true,
    )
}
