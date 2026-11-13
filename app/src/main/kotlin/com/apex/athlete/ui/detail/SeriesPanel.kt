package com.apex.athlete.ui.detail

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.apex.athlete.R
import com.apex.athlete.core.data.repository.MetricTrend
import com.apex.athlete.core.data.repository.TrendPoint
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.charts.DaySeries
import com.apex.athlete.core.ui.charts.DaySeriesChart
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.ReasonPlaceholder
import com.apex.athlete.core.ui.components.ReasonSize
import com.apex.athlete.core.ui.components.SkeletonLineFill
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.ui.common.ApexFormatter
import com.apex.athlete.ui.health.MetricDisplay
import com.apex.athlete.ui.health.TrendLoad
import com.apex.athlete.ui.health.baselineBand
import com.apex.athlete.ui.health.chartPoints
import com.apex.athlete.ui.health.displayOf
import com.apex.athlete.ui.health.provenanceText

/** One daily series ready to chart: values on the display scale, the window it covers and where it came from. */
@Immutable
data class SeriesUi(
    val metric: MetricType,
    val series: DaySeries,
    val startDay: Long,
    val endDay: Long,
    val provenance: String,
)

/** The state of a chart card: waiting, nothing stored for this metric, or a series. */
sealed interface SeriesPanel {
    data object Loading : SeriesPanel
    data object Empty : SeriesPanel
    data class Ready(val ui: SeriesUi) : SeriesPanel
}

private fun suffixOf(display: MetricDisplay): String = display.unit?.takeIf { it.isNotBlank() }?.let { " $it" }.orEmpty()

/**
 * [trend] on the display scale (kilometres or miles, kilograms or pounds ...). Gaps stay null. The baseline band is only drawn
 * when [withBand] and the baseline is established.
 */
fun seriesUi(trend: MetricTrend, rangeDays: Int, endDay: Long, label: String, f: ApexFormatter, withBand: Boolean = false): SeriesUi {
    val display = displayOf(trend.metric, f)
    return SeriesUi(
        metric = trend.metric,
        series = DaySeries(
            label = label,
            points = chartPoints(trend.points, display),
            valueSuffix = suffixOf(display),
            decimals = display.decimals,
            baseline = if (withBand) baselineBand(trend.intelligence.baseline, display) else null,
        ),
        startDay = endDay - (rangeDays - 1),
        endDay = endDay,
        provenance = provenanceText(trend.provenance, f),
    )
}

/**
 * A repository series for a metric that is not in the trend list (for example the VO2 history): [points] are already on the
 * display scale.
 */
fun seriesUiOf(
    metric: MetricType,
    points: List<TrendPoint>,
    endDay: Long,
    rangeDays: Int,
    label: String,
    provenance: DataProvenance?,
    f: ApexFormatter,
): SeriesUi {
    val display = displayOf(metric, f)
    return SeriesUi(
        metric = metric,
        series = DaySeries(label, chartPoints(points, display), suffixOf(display), display.decimals),
        startDay = endDay - (rangeDays - 1),
        endDay = endDay,
        provenance = provenanceText(provenance, f),
    )
}

/** Maps the trend flow's state to a panel. A trend whose window holds no reading is still Ready (the chart says so itself). */
fun seriesPanel(load: TrendLoad, label: String, f: ApexFormatter, withBand: Boolean = false): SeriesPanel = when (load) {
    TrendLoad.Loading -> SeriesPanel.Loading
    TrendLoad.Empty -> SeriesPanel.Empty
    is TrendLoad.Loaded -> SeriesPanel.Ready(seriesUi(load.trend, load.rangeDays, load.endDay, label, f, withBand))
}

/** True when at least one day in the window has a reading. */
fun SeriesUi.hasReadings(): Boolean = series.points.any { it.y != null && it.x in startDay..endDay }

/**
 * A card with a daily chart, the selected day and the button that opens it. [onOpenDay] gets the epoch day.
 * [dayLabel] formats an epoch day ("Mon, Nov 9"). [emptyText] is the honest reason shown when nothing is stored for the metric.
 */
@Composable
fun SeriesChartCard(
    title: String,
    panel: SeriesPanel,
    selectedDay: Long?,
    onSelectDay: (Long?) -> Unit,
    dayLabel: (Long) -> String,
    onOpenDay: (Long) -> Unit,
    emptyText: String,
    modifier: Modifier = Modifier,
) {
    ApexCard(modifier) {
        when (panel) {
            SeriesPanel.Loading -> SkeletonLineFill(height = 180.dp)
            SeriesPanel.Empty -> ReasonPlaceholder(emptyText, ApexIcons.Info, size = ReasonSize.Medium)
            is SeriesPanel.Ready -> Column {
                val ui = panel.ui
                DaySeriesChart(
                    title = title,
                    primary = ui.series,
                    startDay = ui.startDay,
                    endDay = ui.endDay,
                    selectedDay = selectedDay,
                    onSelectDay = onSelectDay,
                    provenance = ui.provenance,
                )
                val inWindow = selectedDay?.takeIf { it in ui.startDay..ui.endDay }
                SelectedDayRow(inWindow?.let(dayLabel), onOpen = { inWindow?.let(onOpenDay) })
                Caption(stringResource(R.string.detail_chart_note_gaps), Modifier.padding(top = ApexSpacing.xs))
            }
        }
    }
}
