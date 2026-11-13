package com.apex.athlete.ui.health

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.data.repository.VITALS_METRICS
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.charts.BiometricSparklineCard
import com.apex.athlete.core.ui.charts.ChartBand
import com.apex.athlete.core.ui.charts.ChartPoint
import com.apex.athlete.core.ui.charts.ChartTone
import com.apex.athlete.core.ui.charts.TrendLineChart
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.ChipTone
import com.apex.athlete.core.ui.components.DatePill
import com.apex.athlete.core.ui.components.GoodDirection
import com.apex.athlete.core.ui.components.KeyStatRow
import com.apex.athlete.core.ui.components.MetricProvenance
import com.apex.athlete.core.ui.components.SkeletonLineFill
import com.apex.athlete.core.ui.components.Tag
import com.apex.athlete.core.ui.components.apexClickable
import com.apex.athlete.core.ui.components.spoken
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.shell.SectionShell
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.state.MetricStateView
import com.apex.athlete.core.ui.state.MetricValueText
import com.apex.athlete.core.ui.state.metricSpoken
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.navigation.ApexNavigator
import com.apex.athlete.ui.common.LocalFormatter
import com.apex.athlete.ui.common.MetricStateMapper
import com.apex.athlete.ui.common.apexViewModel
import java.time.LocalDate

/** The Health tab: monitor, trends, fitness and the heart rate entry (DESIGN_SYSTEM section 4, Health). */
@Composable
fun HealthRoute(
    navigator: ApexNavigator,
    day: LocalDate,
    onDayChange: (LocalDate) -> Unit,
    contentPadding: PaddingValues,
) {
    val vm = apexViewModel { container, _ -> HealthViewModel(container.repository, day.toEpochDay()) }
    LaunchedEffect(day) { vm.setDay(day.toEpochDay()) }
    val dashboard by vm.dashboard.collectAsStateWithLifecycle()
    val trends by vm.trends.collectAsStateWithLifecycle()
    val body by vm.body.collectAsStateWithLifecycle()
    val vitals by vm.vitals.collectAsStateWithLifecycle()
    val fitness by vm.fitness.collectAsStateWithLifecycle()
    val formatter = LocalFormatter.current
    val mapper = remember(formatter) { MetricStateMapper(formatter) }
    // Both reads must have arrived; until then the screen shows skeletons, never an empty list.
    val ui = remember(dashboard, trends, mapper, formatter) {
        val d = dashboard
        val t = trends
        if (d != null && t != null) buildHealthUi(d, t, mapper, formatter) else null
    }
    // Each new section loads on its own: null is "still loading" (skeletons), never an empty section.
    val bodyUi = remember(body, formatter) { body?.let { buildBodyUi(it, formatter) } }
    val vitalsUi = remember(vitals, trends, formatter) { vitals?.let { buildVitalsUi(it, trends, formatter) } }
    val cardioUi = remember(fitness, formatter) { fitness?.let { buildCardioUi(it, formatter) } }
    HealthScreen(
        ui = ui,
        body = bodyUi,
        vitals = vitalsUi,
        cardio = cardioUi,
        dayLabel = formatter.dayLabel(day),
        canGoNext = day < formatter.today(),
        onPreviousDay = { onDayChange(day.minusDays(1)) },
        onNextDay = { onDayChange(day.plusDays(1)) },
        onToday = { onDayChange(formatter.today()) },
        onOpenTrend = navigator::openTrend,
        onOpenHeartRate = { navigator.openHeartRateDay(day) },
        onOpenProfile = navigator::openProfile,
        contentPadding = contentPadding,
    )
}

private val MONITOR_PLACEHOLDERS = listOf(
    R.string.health_metric_hrv,
    R.string.health_metric_rhr,
    R.string.health_metric_resp,
    R.string.health_metric_spo2,
    R.string.health_metric_skin,
)

@Composable
internal fun HealthScreen(
    ui: HealthUi?,
    body: BodyUi?,
    vitals: VitalsUi?,
    cardio: CardioUi?,
    dayLabel: String,
    canGoNext: Boolean,
    onPreviousDay: () -> Unit,
    onNextDay: () -> Unit,
    onToday: () -> Unit,
    onOpenTrend: (MetricType) -> Unit,
    onOpenHeartRate: () -> Unit,
    onOpenProfile: () -> Unit,
    contentPadding: PaddingValues,
) {
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .windowInsetsPadding(WindowInsets.statusBars)
            .padding(horizontal = ApexSpacing.gutter)
            .padding(top = ApexSpacing.sm, bottom = contentPadding.calculateBottomPadding() + ApexSpacing.xl),
        verticalArrangement = Arrangement.spacedBy(ApexSpacing.sectionGap),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
            Text(
                stringResource(R.string.health_title),
                style = ApexTheme.type.sectionTitle,
                color = ApexTheme.colors.foreground,
                modifier = Modifier.weight(1f).semantics { heading() },
            )
            DatePill(
                label = dayLabel,
                onPrevious = onPreviousDay,
                onNext = onNextDay,
                onLabelClick = onToday,
                canGoNext = canGoNext,
                previousDescription = stringResource(R.string.health_hr_prev_day),
                nextDescription = stringResource(R.string.health_hr_next_day),
                labelClickDescription = stringResource(R.string.health_hr_go_today),
            )
        }
        MonitorSection(ui, onOpenTrend)
        TrendsSection(ui, onOpenTrend)
        BodySection(body, onOpenTrend, onOpenProfile)
        VitalsSection(vitals, onOpenTrend)
        CardioSection(cardio, onOpenVo2 = { onOpenTrend(MetricType.VO2_MAX) }, onOpenProfile = onOpenProfile)
        HeartRateSection(ui?.heartRate, onOpenHeartRate)
    }
}

@Composable
private fun Caption(text: String) {
    Text(text, style = ApexTheme.type.caption, color = ApexTheme.colors.mutedForeground)
}

@Composable
private fun MonitorSection(ui: HealthUi?, onOpenTrend: (MetricType) -> Unit) {
    SectionShell(stringResource(R.string.health_section_monitor)) {
        Caption(stringResource(R.string.health_monitor_caption))
        ApexCard(contentPadding = PaddingValues(horizontal = ApexSpacing.cardPadding, vertical = ApexSpacing.sm)) {
            if (ui == null) {
                MONITOR_PLACEHOLDERS.forEach { res ->
                    KeyStatRow(label = stringResource(res), state = MetricState.Loading)
                }
            } else {
                ui.monitor.forEach { row ->
                    KeyStatRow(
                        label = stringResource(row.titleRes),
                        state = row.state,
                        average = row.average,
                        averageDecimals = row.decimals,
                        sd = row.sd,
                        goodDirection = row.good,
                        onClick = { onOpenTrend(row.metric) },
                    )
                }
            }
        }
    }
}

@Composable
private fun TrendsSection(ui: HealthUi?, onOpenTrend: (MetricType) -> Unit) {
    SectionShell(stringResource(R.string.health_section_trends)) {
        Caption(stringResource(R.string.health_trends_caption))
        when {
            ui == null -> repeat(3) {
                ApexCard {
                    SkeletonLineFill(height = 20.dp)
                    SkeletonLineFill(Modifier.padding(top = ApexSpacing.md), height = 56.dp)
                }
            }
            ui.trends.isEmpty() -> ApexCard {
                Text(stringResource(R.string.health_trends_empty), style = ApexTheme.type.body, color = ApexTheme.colors.foregroundBody)
            }
            else -> ui.trends.forEach { c ->
                BiometricSparklineCard(
                    title = stringResource(c.titleRes),
                    valueText = c.valueText,
                    unit = c.unit,
                    points = c.points,
                    startDay = ui.trendsStartDay,
                    endDay = ui.trendsEndDay,
                    baseline = c.baseline,
                    zScore = c.zScore,
                    provenance = c.provenance,
                    onClick = { onOpenTrend(c.metric) },
                    statusLabel = c.statusLabel,
                    zTone = c.zTone,
                    baselineLabel = c.baselineText,
                )
            }
        }
    }
}

@Composable
private fun SectionSkeletonCard() {
    ApexCard {
        SkeletonLineFill(height = 20.dp)
        SkeletonLineFill(Modifier.padding(top = ApexSpacing.md), height = 56.dp)
    }
}

/** A full-width link row: caps label and chevron, at least 48 dp tall, spoken with [description]. */
@Composable
private fun LinkRow(text: String, description: String, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .apexClickable(onClick = onClick, role = Role.Button)
            .heightIn(min = ApexSpacing.minTouch)
            .spoken(description),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(ApexSpacing.xs),
    ) {
        Text(text.uppercase(), style = ApexTheme.type.linkAction, color = ApexTheme.colors.foregroundSecondary, modifier = Modifier.weight(1f))
        Icon(ApexIcons.ChevronRight, contentDescription = null, modifier = Modifier.size(16.dp), tint = ApexTheme.colors.foregroundSecondary)
    }
}

@Composable
private fun BodySection(body: BodyUi?, onOpenTrend: (MetricType) -> Unit, onOpenProfile: () -> Unit) {
    SectionShell(stringResource(R.string.health_section_body)) {
        Caption(stringResource(R.string.health_body_caption))
        if (body == null) {
            repeat(3) { SectionSkeletonCard() }
        } else {
            BodyMetricCard(body.weight, body, showProfileLink = false, onOpenTrend, onOpenProfile)
            BodyMetricCard(body.bodyFat, body, showProfileLink = false, onOpenTrend, onOpenProfile)
            BodyMetricCard(body.bmi, body, showProfileLink = body.bmiNeedsHeight, onOpenTrend, onOpenProfile)
        }
    }
}

@Composable
private fun BodyMetricCard(
    m: BodyMetricUi,
    body: BodyUi,
    showProfileLink: Boolean,
    onOpenTrend: (MetricType) -> Unit,
    onOpenProfile: () -> Unit,
) {
    val label = stringResource(m.titleRes)
    ApexCard {
        Text(label.uppercase(), style = ApexTheme.type.statLabel, color = ApexTheme.colors.foreground)
        Column(
            Modifier.padding(top = ApexSpacing.sm).spoken(metricSpoken(label, m.state)),
            verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs),
        ) {
            MetricStateView(m.state, label = label) { v ->
                Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
                    MetricValueText(v, valueStyle = ApexTheme.type.statValueLarge)
                    MetricProvenance(v)
                }
            }
        }
        if (m.hasChart) {
            TrendLineChart(
                title = label,
                points = m.points,
                rangeDays = body.historyDays,
                endDay = body.endDay,
                modifier = Modifier.padding(top = ApexSpacing.md),
                valueSuffix = if (m.unit.isEmpty()) "" else " ${m.unit}",
                decimals = m.decimals,
                provenance = m.provenance,
            )
        }
        if (showProfileLink) {
            LinkRow(
                text = stringResource(R.string.health_open_profile),
                description = stringResource(R.string.health_bmi_profile_link_cd),
                onClick = onOpenProfile,
            )
        }
        if (m.opensTrend) {
            LinkRow(
                text = stringResource(R.string.health_fitness_action),
                description = stringResource(R.string.health_trend_link_cd, label),
                onClick = { onOpenTrend(m.metric) },
            )
        }
    }
}

private val VITAL_PLACEHOLDERS: List<Int> = VITALS_METRICS.map { metricTitleRes(it) }

@Composable
private fun VitalsSection(vitals: VitalsUi?, onOpenTrend: (MetricType) -> Unit) {
    SectionShell(stringResource(R.string.health_section_vitals)) {
        Caption(stringResource(R.string.health_vitals_caption))
        ApexCard(contentPadding = PaddingValues(horizontal = ApexSpacing.cardPadding, vertical = ApexSpacing.sm)) {
            if (vitals == null) {
                VITAL_PLACEHOLDERS.forEach { res -> KeyStatRow(label = stringResource(res), state = MetricState.Loading) }
            } else {
                vitals.rows.forEach { row ->
                    KeyStatRow(
                        label = stringResource(row.titleRes),
                        state = row.state,
                        average = row.average,
                        averageDecimals = row.decimals,
                        sd = row.sd,
                        goodDirection = row.good,
                        onClick = if (row.opensTrend) ({ onOpenTrend(row.metric) }) else null,
                    )
                    if (row.sampleNote != null) Caption(row.sampleNote)
                }
            }
        }
        Caption(stringResource(R.string.health_vitals_units_note))
    }
}

@Composable
private fun CardioLine(line: CardioLineUi, extras: List<String> = emptyList()) {
    val label = stringResource(line.titleRes)
    Column(
        Modifier.fillMaxWidth().spoken(metricSpoken(label, line.state, extras = listOfNotNull(line.headline, line.note) + extras)),
        verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs),
    ) {
        Text(label.uppercase(), style = ApexTheme.type.statLabel, color = ApexTheme.colors.foreground)
        MetricStateView(line.state, label = label) { v ->
            Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
                if (line.headline != null) {
                    Text(line.headline, style = ApexTheme.type.sectionTitle, color = ApexTheme.colors.foreground)
                }
                MetricValueText(v, valueStyle = ApexTheme.type.statValueLarge)
                MetricProvenance(v)
            }
        }
        if (line.note != null) Caption(line.note)
    }
}

@Composable
private fun CardioSection(cardio: CardioUi?, onOpenVo2: () -> Unit, onOpenProfile: () -> Unit) {
    SectionShell(stringResource(R.string.health_section_cardio)) {
        Caption(stringResource(R.string.health_cardio_caption))
        if (cardio == null) {
            SectionSkeletonCard()
        } else {
            val caveat = if (cardio.isEstimate) stringResource(R.string.health_fitness_estimate_caveat) else null
            val method = cardio.method?.let { stringResource(R.string.health_fitness_method, it) }
            ApexCard {
              Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(ApexSpacing.lg)) {
                Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
                    CardioLine(cardio.vo2, extras = listOfNotNull(caveat, method))
                    if (cardio.isEstimate) Tag(stringResource(R.string.health_cardio_estimated), tone = ChipTone.INFO)
                    if (caveat != null) Caption(caveat)
                    if (method != null) Caption(method)
                }
                CardioLine(cardio.category)
                CardioLine(cardio.fitnessAge)
                if (cardio.needsProfile) {
                    LinkRow(
                        text = stringResource(R.string.health_open_profile),
                        description = stringResource(R.string.health_cardio_profile_link_cd),
                        onClick = onOpenProfile,
                    )
                }
                LinkRow(
                    text = stringResource(R.string.health_fitness_action),
                    description = stringResource(R.string.health_trend_link_cd, stringResource(R.string.health_metric_vo2)),
                    onClick = onOpenVo2,
                )
              }
            }
        }
    }
}

@Composable
private fun ActionLine(text: String) {
    Row(
        Modifier.padding(top = ApexSpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(ApexSpacing.xs),
    ) {
        Text(text.uppercase(), style = ApexTheme.type.linkAction, color = ApexTheme.colors.foregroundSecondary)
        Icon(ApexIcons.ChevronRight, contentDescription = null, modifier = Modifier.size(16.dp), tint = ApexTheme.colors.foregroundSecondary)
    }
}

@Composable
private fun HeartRateSection(entry: HeartRateEntryUi?, onOpen: () -> Unit) {
    SectionShell(stringResource(R.string.health_section_heart_rate)) {
        val title = stringResource(R.string.health_hr_entry_title)
        val state = entry?.state ?: MetricState.Loading
        val action = stringResource(R.string.health_hr_entry_action)
        ApexCard(
            onClick = onOpen,
            onClickLabel = stringResource(R.string.health_hr_entry_cd),
            spokenDescription = metricSpoken(title, state, extras = listOf(action)),
        ) {
            Text(title.uppercase(), style = ApexTheme.type.statLabel, color = ApexTheme.colors.foreground)
            Column(Modifier.padding(top = ApexSpacing.sm), verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
                MetricStateView(state, label = title) { v ->
                    Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
                        MetricValueText(v, valueStyle = ApexTheme.type.statValueLarge)
                        MetricProvenance(v)
                    }
                }
            }
            ActionLine(action)
        }
    }
}

// --- Previews -------------------------------------------------------------------------------------

private const val PREVIEW_END = 20_400L

private fun sampleSeries(base: Double, step: Double, gapAt: Int = -1): List<ChartPoint> =
    (0 until SPARKLINE_DAYS).map { i ->
        ChartPoint(PREVIEW_END - (SPARKLINE_DAYS - 1) + i, if (i == gapAt) null else base + step * ((i * 7) % 5 - 2))
    }

private fun previewUi(): HealthUi {
    val measured = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API
    fun card(metric: MetricType, res: Int, value: String?, unit: String, base: Double, step: Double, z: Double?, tone: ChartTone, gap: Int = -1) =
        TrendCardUi(
            metric, res, value, unit, "Within your usual range", sampleSeries(base, step, gap),
            ChartBand(base - step * 2, base + step * 2), z, tone, "Measured", "30-day range ${base - step * 2} to ${base + step * 2}",
        )
    return HealthUi(
        monitor = listOf(
            MonitorRowUi(MetricType.HRV_RMSSD, R.string.health_metric_hrv, MetricState.Value(68.0, 0, "ms", measured), 62.0, 0, 8.0, GoodDirection.UP),
            MonitorRowUi(MetricType.RESTING_HEART_RATE, R.string.health_metric_rhr, MetricState.Value(52.0, 0, "bpm", measured), 53.0, 0, 2.0, GoodDirection.DOWN),
            MonitorRowUi(MetricType.RESPIRATORY_RATE, R.string.health_metric_resp, MetricState.Calibrating(3), null, 1, null, GoodDirection.NEUTRAL),
            MonitorRowUi(MetricType.SPO2_AVG, R.string.health_metric_spo2, MetricState.Value(96.5, 1, "%", measured), 96.8, 1, 0.5, GoodDirection.UP),
            MonitorRowUi(MetricType.SKIN_TEMP_DEVIATION, R.string.health_metric_skin, MetricState.Unavailable(), null, 1, null, GoodDirection.NEUTRAL),
        ),
        trends = listOf(
            card(MetricType.HRV_RMSSD, R.string.health_metric_hrv, "68", "ms", 62.0, 3.0, 0.8, ChartTone.NEUTRAL),
            card(MetricType.RESTING_HEART_RATE, R.string.health_metric_rhr, "52", "bpm", 53.0, 1.0, -0.5, ChartTone.NEUTRAL, gap = 6),
            card(MetricType.SPO2_AVG, R.string.health_metric_spo2, null, "%", 96.0, 0.3, null, ChartTone.NEUTRAL),
        ),
        trendsStartDay = PREVIEW_END - (SPARKLINE_DAYS - 1),
        trendsEndDay = PREVIEW_END,
        heartRate = HeartRateEntryUi(MetricState.Value(61.0, 0, "bpm", DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API, asOf = "4 min ago")),
    )
}

private fun previewBody(needsHeight: Boolean): BodyUi {
    val own = DataProvenance.USER_REPORTED
    fun series(base: Double, step: Double) =
        (0 until BODY_CHART_DAYS).map { i -> ChartPoint(PREVIEW_END - (BODY_CHART_DAYS - 1) + i, if (i % 9 == 4) null else base + step * ((i * 3) % 7 - 3)) }
    return BodyUi(
        weight = BodyMetricUi(MetricType.WEIGHT, R.string.health_metric_weight, MetricState.Value(72.4, 1, "kg", own, "Mon, Nov 9"), series(72.0, 0.2), 1, "kg", "Self-reported", true),
        bodyFat = BodyMetricUi(MetricType.BODY_FAT, R.string.health_metric_body_fat, MetricState.Unavailable(), emptyList(), 1, "%", "Source unknown", true),
        bmi = if (needsHeight) {
            BodyMetricUi(MetricType.BMI, R.string.health_metric_bmi, MetricState.Unavailable(detail = "Add your height in Profile to see BMI"), emptyList(), 1, "kg/m²", "Source unknown", false)
        } else {
            BodyMetricUi(MetricType.BMI, R.string.health_metric_bmi, MetricState.Value(22.9, 1, "kg/m²", DataProvenance.MATHEMATICALLY_DERIVED), series(22.8, 0.1), 1, "kg/m²", "Calculated", false)
        },
        endDay = PREVIEW_END,
        historyDays = BODY_CHART_DAYS,
        bmiNeedsHeight = needsHeight,
    )
}

private fun previewVitals(): VitalsUi {
    val measured = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API
    return VitalsUi(
        listOf(
            VitalRowUi(MetricType.SKIN_TEMP_NIGHTLY, R.string.health_metric_skin_nightly, MetricState.Value(33.8, 1, "°C", measured), 33.6, 0.3, 1, GoodDirection.NEUTRAL, true, null),
            VitalRowUi(MetricType.SPO2_LOWER_BOUND, R.string.health_metric_spo2_low, MetricState.Value(93.0, 1, "%", measured), 93.5, 0.6, 1, GoodDirection.UP, true, null),
            VitalRowUi(MetricType.SPO2_UPPER_BOUND, R.string.health_metric_spo2_high, MetricState.Unavailable(), null, null, 1, GoodDirection.NEUTRAL, true, null),
            VitalRowUi(MetricType.HRV_LOW_FREQUENCY, R.string.health_metric_hrv_lf, MetricState.Value(412.0, 0, "ms²", measured), null, null, 0, GoodDirection.NEUTRAL, false, "Night average of 9 samples"),
        ),
    )
}

private fun previewCardio(missing: Boolean): CardioUi {
    val derived = DataProvenance.MATHEMATICALLY_DERIVED
    val vo2 = CardioLineUi(R.string.health_metric_vo2, MetricState.Value(47.5, 1, "ml/kg/min", DataProvenance.ESTIMATED), null, null, false)
    return if (missing) {
        CardioUi(
            vo2, true, "Heart-rate ratio (Uth et al. 2004)",
            CardioLineUi(R.string.health_cardio_category, MetricState.Unavailable(detail = "Choose your sex in Profile to see this."), null, null, true),
            CardioLineUi(R.string.health_cardio_age, MetricState.Unavailable(detail = "Choose your sex in Profile to see this."), null, null, true),
        )
    } else {
        CardioUi(
            vo2, true, "Heart-rate ratio (Uth et al. 2004)",
            CardioLineUi(R.string.health_cardio_category, MetricState.Value(71.0, 0, "percentile", derived), "Good", "Compared with adults of your age and sex", false),
            CardioLineUi(R.string.health_cardio_age, MetricState.Value(31.0, 0, "years", derived), null, "4 years younger than your age", false),
        )
    }
}

@HealthThemePreviews
@Composable
private fun HealthScreenPreview() = HealthPreviewFrame {
    HealthScreen(previewUi(), previewBody(needsHeight = false), previewVitals(), previewCardio(missing = false), "Today", false, {}, {}, {}, {}, {}, {}, PaddingValues(0.dp))
}

@HealthThemePreviews
@Composable
private fun HealthScreenNeedsProfilePreview() = HealthPreviewFrame {
    HealthScreen(previewUi(), previewBody(needsHeight = true), previewVitals(), previewCardio(missing = true), "Today", false, {}, {}, {}, {}, {}, {}, PaddingValues(0.dp))
}

@HealthThemePreviews
@Composable
private fun HealthScreenLoadingPreview() = HealthPreviewFrame {
    HealthScreen(null, null, null, null, "Today", false, {}, {}, {}, {}, {}, {}, PaddingValues(0.dp))
}
