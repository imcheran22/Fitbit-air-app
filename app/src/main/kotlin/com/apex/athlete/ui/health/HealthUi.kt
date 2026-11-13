package com.apex.athlete.ui.health

import androidx.annotation.StringRes
import androidx.compose.runtime.Immutable
import com.apex.athlete.R
import com.apex.athlete.core.analytics.baseline.Baseline
import com.apex.athlete.core.analytics.baseline.BaselineStatus
import com.apex.athlete.core.analytics.baseline.ValueTransform
import com.apex.athlete.core.analytics.trend.RangeStatus
import com.apex.athlete.core.data.pipeline.MissingReason
import com.apex.athlete.core.data.repository.DailyDashboardState
import com.apex.athlete.core.data.repository.HeartRateTick
import com.apex.athlete.core.data.repository.MetricTrend
import com.apex.athlete.core.data.repository.MonitorItem
import com.apex.athlete.core.data.repository.StrainLoadState
import com.apex.athlete.core.data.repository.TrendIntelligenceState
import com.apex.athlete.core.data.repository.TrendPoint
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.analytics.strain.HeartRateZone
import com.apex.athlete.core.ui.charts.ChartBand
import com.apex.athlete.core.ui.charts.ChartPoint
import com.apex.athlete.core.ui.charts.ChartTone
import com.apex.athlete.core.ui.charts.ZoneMinutes
import com.apex.athlete.core.ui.components.GoodDirection
import com.apex.athlete.core.ui.components.provenanceLabelRes
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.ui.common.ApexFormatter
import com.apex.athlete.ui.common.MetricStateMapper
import java.time.LocalDate
import com.apex.athlete.core.ui.R as KitR

/*
 * Maps repository results to the small UI models the Health screens draw. Nothing here is Compose;
 * copy is read through the formatter so the models carry finished strings. A missing value stays
 * missing: it becomes Unavailable or Calibrating, never zero.
 */

@Immutable
data class MonitorRowUi(
    val metric: MetricType,
    @StringRes val titleRes: Int,
    val state: MetricState,
    val average: Double?,
    val decimals: Int,
    val sd: Double?,
    val good: GoodDirection,
)

@Immutable
data class TrendCardUi(
    val metric: MetricType,
    @StringRes val titleRes: Int,
    val valueText: String?,
    val unit: String,
    val statusLabel: String?,
    val points: List<ChartPoint>,
    val baseline: ChartBand?,
    val zScore: Double?,
    val zTone: ChartTone,
    val provenance: String,
    val baselineText: String,
)

@Immutable
data class HeartRateEntryUi(val state: MetricState)

@Immutable
data class HealthUi(
    val monitor: List<MonitorRowUi>,
    val trends: List<TrendCardUi>,
    val trendsStartDay: Long,
    val trendsEndDay: Long,
    val heartRate: HeartRateEntryUi,
)

@StringRes
fun metricTitleRes(metric: MetricType): Int = when (metric) {
    MetricType.HRV_RMSSD -> R.string.health_metric_hrv
    MetricType.HRV_DEEP_SLEEP_RMSSD -> R.string.health_metric_hrv_deep
    MetricType.HRV_SLEEP_SAMPLES -> R.string.health_metric_hrv_sleep_samples
    MetricType.HRV_LOW_FREQUENCY -> R.string.health_metric_hrv_lf
    MetricType.HRV_HIGH_FREQUENCY -> R.string.health_metric_hrv_hf
    MetricType.SPO2_LOWER_BOUND -> R.string.health_metric_spo2_low
    MetricType.SPO2_UPPER_BOUND -> R.string.health_metric_spo2_high
    MetricType.SKIN_TEMP_NIGHTLY -> R.string.health_metric_skin_nightly
    MetricType.DISTANCE -> R.string.health_metric_distance
    MetricType.FLOORS -> R.string.health_metric_floors
    MetricType.CALORIES_TOTAL -> R.string.health_metric_kcal_total
    MetricType.CALORIES_ACTIVE -> R.string.health_metric_kcal_active
    MetricType.ACTIVE_ZONE_MINUTES -> R.string.health_metric_azm
    MetricType.LIGHTLY_ACTIVE_MINUTES -> R.string.health_metric_light_min
    MetricType.MODERATELY_ACTIVE_MINUTES -> R.string.health_metric_moderate_min
    MetricType.VERY_ACTIVE_MINUTES -> R.string.health_metric_very_min
    MetricType.SEDENTARY_MINUTES -> R.string.health_metric_sedentary_min
    MetricType.WEIGHT -> R.string.health_metric_weight
    MetricType.BODY_FAT -> R.string.health_metric_body_fat
    MetricType.BMI -> R.string.health_metric_bmi
    MetricType.STRESS_SCORE -> R.string.health_metric_stress
    MetricType.STRESS_DAY_AGGREGATE_BPM -> R.string.health_metric_stress_bpm
    MetricType.STRESS_HIGH_MINUTES -> R.string.health_metric_stress_high
    MetricType.HR_DIP -> R.string.health_metric_hr_dip
    MetricType.RESTING_HEART_RATE -> R.string.health_metric_rhr
    MetricType.SLEEPING_HEART_RATE -> R.string.health_metric_sleeping_hr
    MetricType.RESPIRATORY_RATE -> R.string.health_metric_resp
    MetricType.SPO2_AVG -> R.string.health_metric_spo2
    MetricType.SKIN_TEMP_DEVIATION -> R.string.health_metric_skin
    MetricType.VO2_MAX -> R.string.health_metric_vo2
    MetricType.RECOVERY_SCORE -> R.string.health_metric_recovery
    MetricType.SLEEP_SCORE -> R.string.health_metric_sleep_score
    MetricType.SLEEP_DURATION -> R.string.health_metric_sleep_duration
    MetricType.STRAIN_SCORE -> R.string.health_metric_strain
    MetricType.DAILY_TRIMP -> R.string.health_metric_trimp
    MetricType.STEPS -> R.string.health_metric_steps
    else -> R.string.health_metric_other
}

fun goodDirectionOf(metric: MetricType): GoodDirection = when (metric.polarity) {
    com.apex.athlete.core.domain.Polarity.HIGHER_IS_BETTER -> GoodDirection.UP
    com.apex.athlete.core.domain.Polarity.LOWER_IS_BETTER -> GoodDirection.DOWN
    com.apex.athlete.core.domain.Polarity.NEUTRAL -> GoodDirection.NEUTRAL
}

private fun ZSide.toChartTone(): ChartTone = when (this) {
    ZSide.GOOD -> ChartTone.OPTIMAL
    ZSide.BAD -> ChartTone.WARNING
    ZSide.NEUTRAL -> ChartTone.NEUTRAL
}

internal fun displayOf(metric: MetricType, f: ApexFormatter): MetricDisplay =
    metricDisplay(
        metric,
        f.temperatureDeltaUnit(),
        f::temperatureDeltaValue,
        f.units,
        UnitLabels(
            km = f.string(R.string.common_unit_km),
            mi = f.string(R.string.common_unit_mi),
            kg = f.string(R.string.common_unit_kg),
            lb = f.string(R.string.common_unit_lb),
        ),
    )

fun provenanceText(provenance: DataProvenance?, f: ApexFormatter): String =
    f.string(provenance?.let(::provenanceLabelRes) ?: KitR.string.provenance_unknown)

fun rangeStatusText(status: RangeStatus, f: ApexFormatter): String = f.string(
    when (status) {
        RangeStatus.NO_READING -> R.string.health_status_no_reading
        RangeStatus.CALIBRATING -> R.string.health_status_calibrating
        RangeStatus.WITHIN_NORMAL -> R.string.health_status_within
        RangeStatus.ABOVE_NORMAL -> R.string.health_status_above
        RangeStatus.BELOW_NORMAL -> R.string.health_status_below
    },
)

/** The personal normal range on the display scale, only once the baseline is established. */
fun baselineBand(baseline: Baseline, display: MetricDisplay): ChartBand? {
    if (baseline.status != BaselineStatus.ESTABLISHED) return null
    val lo = baseline.lowerNormal ?: return null
    val hi = baseline.upperNormal ?: return null
    if (!lo.isFinite() || !hi.isFinite()) return null
    val a = display.convert(lo)
    val b = display.convert(hi)
    return ChartBand(minOf(a, b), maxOf(a, b))
}

fun chartPoints(points: List<TrendPoint>, display: MetricDisplay): List<ChartPoint> =
    points.map { p -> ChartPoint(p.epochDay, p.value?.takeIf { it.isFinite() }?.let(display.convert)) }

// --- Health tab -----------------------------------------------------------------------------------

fun buildMonitorRows(items: List<MonitorItem>, mapper: MetricStateMapper, f: ApexFormatter): List<MonitorRowUi> =
    items.map { item ->
        val display = displayOf(item.metric, f)
        val i = item.intelligence
        var state = mapper.intelligence(i, item.metric, item.provenance)
        if (state is MetricState.Unavailable) {
            mapper.calibrationDaysLeft(i)?.let { state = MetricState.Calibrating(it) }
        }
        val band = baselineBand(i.baseline, display)
        MonitorRowUi(
            metric = item.metric,
            titleRes = metricTitleRes(item.metric),
            state = state,
            average = i.baseline.center?.takeIf { band != null && it.isFinite() }?.let(display.convert),
            decimals = display.decimals,
            sd = band?.let { (it.high - it.low) / 2.0 },
            good = goodDirectionOf(item.metric),
        )
    }

fun buildTrendCards(state: TrendIntelligenceState, f: ApexFormatter): List<TrendCardUi> =
    HEALTH_TREND_METRICS.mapNotNull { metric -> state.trends.firstOrNull { it.metric == metric } }
        .map { t -> trendCard(t, f) }

private fun trendCard(t: MetricTrend, f: ApexFormatter): TrendCardUi {
    val display = displayOf(t.metric, f)
    val i = t.intelligence
    val band = baselineBand(i.baseline, display)
    val value = i.current?.takeIf { it.isFinite() }?.let(display.convert)
    return TrendCardUi(
        metric = t.metric,
        titleRes = metricTitleRes(t.metric),
        valueText = value?.let { f.number(it, display.decimals) },
        unit = display.unit.orEmpty(),
        statusLabel = rangeStatusText(i.rangeStatus, f),
        points = chartPoints(t.points, display),
        baseline = band,
        zScore = i.zScore?.takeIf { it.isFinite() },
        zTone = zSide(t.metric, i.zScore).toChartTone(),
        provenance = provenanceText(t.provenance, f),
        baselineText = if (band != null) {
            f.string(R.string.health_baseline_range, f.number(band.low, display.decimals), f.number(band.high, display.decimals))
        } else {
            f.string(R.string.health_baseline_none)
        },
    )
}

fun buildHealthUi(
    dashboard: DailyDashboardState,
    trends: TrendIntelligenceState?,
    mapper: MetricStateMapper,
    f: ApexFormatter,
): HealthUi {
    val a = dashboard.analysis
    val hrTick: HeartRateTick? = dashboard.latestHeartRate
    val hrState = mapper.heartRate(hrTick).let { s ->
        // The intraday store does not record which source a minute came from; only the demo store is known.
        if (s is MetricState.Value && dashboard.isDemo) s.copy(provenance = DataProvenance.SYNTHETIC_DEMO) else s
    }
    return HealthUi(
        monitor = buildMonitorRows(dashboard.monitor, mapper, f),
        trends = trends?.let { buildTrendCards(it, f) }.orEmpty(),
        trendsStartDay = (trends?.asOfDay ?: a.epochDay) - (SPARKLINE_DAYS - 1),
        trendsEndDay = trends?.asOfDay ?: a.epochDay,
        heartRate = HeartRateEntryUi(hrState),
    )
}

// --- Trend detail ---------------------------------------------------------------------------------

@Immutable
data class TrendDetailUi(
    val metric: MetricType,
    @StringRes val titleRes: Int,
    val headline: MetricState,
    val statusLabel: String,
    val zScore: Double?,
    val zTone: ChartTone,
    val points: List<ChartPoint>,
    val baseline: ChartBand?,
    val decimals: Int,
    val unit: String,
    val provenance: String,
    val rangeDays: Int,
    val endDay: Long,
    val min: MetricState,
    val max: MetricState,
    val mean: MetricState,
    val readings: Int,
    val days: Int,
    val baselineEstablished: Boolean,
    val baselineValidDays: Int,
    val baselineRequiredDays: Int,
    val logScale: Boolean,
)

fun buildTrendDetail(trend: MetricTrend, rangeDays: Int, endDay: Long, mapper: MetricStateMapper, f: ApexFormatter): TrendDetailUi {
    val display = displayOf(trend.metric, f)
    val i = trend.intelligence
    val points = chartPoints(trend.points, display)
    val summary = summarize(points.map { it.y })
    val derived = DataProvenance.MATHEMATICALLY_DERIVED

    fun stat(v: Double?): MetricState =
        mapper.value(v, display.decimals, display.unit, derived)

    // The headline is today's reading. When today has none, the newest reading in range is shown
    // with its date, never a made-up value.
    val headline: MetricState = run {
        // Built from this file's display table (not the mapper's) so weight and distance follow the unit system.
        val currentRaw = i.current?.takeIf { it.isFinite() }
        val today: MetricState = if (currentRaw == null) {
            MetricState.Unavailable()
        } else {
            mapper.value(display.convert(currentRaw), display.decimals, display.unit, trend.provenance)
        }
        if (today !is MetricState.Unavailable) return@run today
        val latest = points.lastOrNull { it.y != null }
        val latestY = latest?.y
        when {
            latest != null && latestY != null -> MetricState.Value(
                value = latestY,
                decimals = display.decimals,
                unit = display.unit,
                provenance = trend.provenance,
                asOf = f.dayLabel(LocalDate.ofEpochDay(latest.x)),
            )
            mapper.calibrationDaysLeft(i) != null -> MetricState.Calibrating(mapper.calibrationDaysLeft(i))
            else -> today
        }
    }
    return TrendDetailUi(
        metric = trend.metric,
        titleRes = metricTitleRes(trend.metric),
        headline = headline,
        statusLabel = rangeStatusText(i.rangeStatus, f),
        zScore = i.zScore?.takeIf { it.isFinite() },
        zTone = zSide(trend.metric, i.zScore).toChartTone(),
        points = points,
        baseline = baselineBand(i.baseline, display),
        decimals = display.decimals,
        unit = display.unit.orEmpty(),
        provenance = provenanceText(trend.provenance, f),
        rangeDays = rangeDays,
        endDay = endDay,
        min = stat(summary.min),
        max = stat(summary.max),
        mean = stat(summary.mean),
        readings = summary.readings,
        days = summary.days,
        baselineEstablished = i.baseline.status == BaselineStatus.ESTABLISHED,
        baselineValidDays = i.baseline.validDays,
        baselineRequiredDays = i.baseline.requiredDays,
        logScale = i.baseline.transform == ValueTransform.NATURAL_LOG,
    )
}

// --- Heart rate day -------------------------------------------------------------------------------

@Immutable
data class HeartRateDayUi(
    val points: List<ChartPoint>,
    val windowStartMillis: Long,
    val windowEndMillis: Long,
    val resting: MetricState,
    val lowest: MetricState,
    val highest: MetricState,
    /** Null when the zone minutes cannot be computed; [zonesMissing] then says why. */
    val zones: List<ZoneMinutes>?,
    val zonesMissing: MetricState?,
    val provenance: DataProvenance?,
)

fun buildHeartRateDay(s: StrainLoadState, mapper: MetricStateMapper, f: ApexFormatter): HeartRateDayUi {
    val a = s.analysis
    val points = s.heartRate.map { ChartPoint(it.epochMillis, it.bpm?.takeIf { v -> v.isFinite() }) }
    val extremes = heartRateExtremes(s.heartRate.map { it.bpm })
    val derived = DataProvenance.MATHEMATICALLY_DERIVED

    val restingMetric = a.restingHeartRateMetric
    var resting = mapper.intelligence(a.restingHeartRate, restingMetric, a.provenance[restingMetric])
    if (resting is MetricState.Unavailable) {
        mapper.calibrationDaysLeft(a.restingHeartRate)?.let { resting = MetricState.Calibrating(it) }
    }

    val strain = a.strain
    val model = a.zones
    val zones: List<ZoneMinutes>? = if (strain != null && model != null) {
        ZONE_ORDER.map { zone ->
            ZoneMinutes(
                zoneLabel = if (zone == HeartRateZone.BELOW_ZONES) f.string(R.string.health_zone_rest) else f.string(R.string.health_zone_label, zone.number),
                rangeLabel = zoneRangeLabel(zone, model, f),
                seconds = minutesToSeconds(strain.minutesByZone[zone]),
            )
        }
    } else {
        null
    }
    val zonesMissing = if (zones == null) {
        if (strain == null) mapper.missing(a.strainMissing) else mapper.missing(MissingReason.NEEDS_MAX_HEART_RATE)
    } else {
        null
    }
    return HeartRateDayUi(
        points = points,
        windowStartMillis = s.dayStartMillis,
        windowEndMillis = s.dayEndMillis,
        resting = resting,
        lowest = mapper.value(extremes.lowest, 0, "bpm", derived),
        highest = mapper.value(extremes.highest, 0, "bpm", derived),
        zones = zones,
        zonesMissing = zonesMissing,
        provenance = if (s.isDemo) DataProvenance.SYNTHETIC_DEMO else null,
    )
}

private val ZONE_ORDER = listOf(
    HeartRateZone.ZONE_5, HeartRateZone.ZONE_4, HeartRateZone.ZONE_3,
    HeartRateZone.ZONE_2, HeartRateZone.ZONE_1, HeartRateZone.BELOW_ZONES,
)

private fun zoneRangeLabel(
    zone: HeartRateZone,
    model: com.apex.athlete.core.analytics.strain.HeartRateZoneModel,
    f: ApexFormatter,
): String =
    if (zone == HeartRateZone.BELOW_ZONES) {
        f.string(R.string.health_zone_below, Math.round(model.lowerBounds[0]).toInt())
    } else {
        val r = model.rangeOf(zone)
        f.string(R.string.health_zone_range, Math.round(r.start).toInt(), Math.round(r.endInclusive).toInt())
    }
