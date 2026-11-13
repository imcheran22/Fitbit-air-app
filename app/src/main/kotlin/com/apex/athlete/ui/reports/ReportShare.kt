package com.apex.athlete.ui.reports

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import androidx.annotation.StringRes
import androidx.core.content.FileProvider
import com.apex.athlete.R
import com.apex.athlete.core.analytics.load.WorkloadZone
import com.apex.athlete.core.analytics.report.ChangeMissingReason
import com.apex.athlete.core.analytics.report.GoalAchievementMissingReason
import com.apex.athlete.core.analytics.report.LoadAtEndMissingReason
import com.apex.athlete.core.analytics.report.ReportPeriodType
import com.apex.athlete.core.database.entity.GoalKind
import com.apex.athlete.core.ui.components.provenanceLabelRes
import com.apex.athlete.core.ui.state.MetricFormat
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.ui.common.ApexFormatter
import com.apex.athlete.ui.goals.kindLabelRes
import java.io.File
import java.io.OutputStream
import java.time.LocalDate
import java.time.format.DateTimeFormatter

// --- Text of the report ------------------------------------------------------------------------------

@StringRes
fun metricLabelRes(metric: ReportMetric): Int = when (metric) {
    ReportMetric.RECOVERY -> R.string.reports_metric_recovery
    ReportMetric.SLEEP -> R.string.reports_metric_sleep
    ReportMetric.STRAIN -> R.string.reports_metric_strain
    ReportMetric.HRV -> R.string.reports_metric_hrv
    ReportMetric.RESTING_HR -> R.string.reports_metric_rhr
}

@StringRes
fun loadZoneRes(zone: WorkloadZone): Int = when (zone) {
    WorkloadZone.DETRAINING -> R.string.reports_zone_detraining
    WorkloadZone.SWEET_SPOT -> R.string.reports_zone_sweet_spot
    WorkloadZone.OVERREACHING -> R.string.reports_zone_overreaching
    WorkloadZone.HIGH_RISK -> R.string.reports_zone_high_risk
}

@StringRes
fun changeMissingRes(reason: ChangeMissingReason): Int = when (reason) {
    ChangeMissingReason.INSUFFICIENT_CURRENT -> R.string.reports_change_missing_current
    ChangeMissingReason.INSUFFICIENT_PREVIOUS -> R.string.reports_change_missing_previous
    ChangeMissingReason.INSUFFICIENT_BOTH -> R.string.reports_change_missing_both
}

@StringRes
fun goalMissingRes(reason: GoalAchievementMissingReason): Int = when (reason) {
    GoalAchievementMissingReason.NO_DATA_IN_PERIOD -> R.string.reports_goal_no_data
    GoalAchievementMissingReason.WEEKLY_GOAL_NOT_SUMMARISED_FOR_MONTH -> R.string.reports_goal_weekly_in_month
}

@StringRes
fun loadMissingRes(reason: LoadAtEndMissingReason?): Int = when (reason) {
    LoadAtEndMissingReason.CALIBRATING -> R.string.reports_load_calibrating
    else -> R.string.reports_load_not_recorded
}

/** The goal kind label; the engine and stored enums share names (asserted in a test). */
@StringRes
fun goalKindLabelRes(kind: com.apex.athlete.core.analytics.goals.GoalKind): Int = kindLabelRes(GoalKind.valueOf(kind.name))

private val MONTH_FORMAT = "LLLL y"

/** "Jan 1 to Jan 7" for a week, "January 2024" for a month. */
fun periodTitle(type: ReportPeriodType, startEpochDay: Long, endEpochDay: Long, f: ApexFormatter): String = when (type) {
    ReportPeriodType.WEEK -> f.string(
        R.string.reports_period_range,
        f.shortDate(LocalDate.ofEpochDay(startEpochDay)),
        f.shortDate(LocalDate.ofEpochDay(endEpochDay)),
    )
    ReportPeriodType.MONTH -> DateTimeFormatter.ofPattern(MONTH_FORMAT, f.locale).format(LocalDate.ofEpochDay(startEpochDay))
}

/** One value as plain text with its unit, or the missing marker. */
fun stateText(state: MetricState, f: ApexFormatter): String = when (state) {
    is MetricState.Value -> MetricFormat.withUnit(state.value, state.decimals, state.unit, f.locale)
    is MetricState.Stale -> MetricFormat.withUnit(state.value, state.decimals, state.unit, f.locale)
    else -> MetricFormat.MISSING
}

private fun provenanceText(state: MetricState, f: ApexFormatter): String? = when (state) {
    is MetricState.Value -> state.provenance?.let { f.string(provenanceLabelRes(it)) } ?: f.string(R.string.reports_source_unknown)
    else -> null
}

fun changeText(row: MetricRowUi, f: ApexFormatter): String = when (val c = row.change) {
    is ChangeUi.Delta -> f.string(R.string.reports_change, MetricFormat.delta(c.delta, c.decimals, f.locale))
    is ChangeUi.Missing -> f.string(changeMissingRes(c.reason))
}

fun goalText(g: com.apex.athlete.core.analytics.report.GoalAchievement, type: ReportPeriodType, f: ApexFormatter): String {
    val label = f.string(goalKindLabelRes(g.kind))
    val missing = g.missingReason
    val count = g.achievedCount
    if (missing != null || count == null) {
        return f.string(R.string.reports_goal_line_missing, label, f.string(goalMissingRes(missing ?: GoalAchievementMissingReason.NO_DATA_IN_PERIOD)))
    }
    return when {
        g.kind.isDaily -> f.string(R.string.reports_goal_line_daily, label, count, g.outOf, g.recordedDays)
        count > 0 -> f.string(R.string.reports_goal_line_weekly_reached, label)
        else -> f.string(R.string.reports_goal_line_weekly_not_reached, label)
    }
}

// --- What gets shared --------------------------------------------------------------------------------

data class ShareRow(val label: String, val value: String, val note: String?)

data class ShareContent(val title: String, val subtitle: String, val rows: List<ShareRow>, val footer: String)

/** The report as plain rows: every number carries its source, missing values say `--` and why. */
fun buildShareContent(ui: ReportDetailUi, f: ApexFormatter): ShareContent {
    val rows = ArrayList<ShareRow>()
    ui.metrics.forEach { m ->
        val note = buildList {
            provenanceText(m.mean, f)?.let { add(it) }
            add(f.string(R.string.reports_recorded_days, m.recordedDays, ui.daysInPeriod))
            if (m.mean is MetricState.Value) add(changeText(m, f))
            m.best?.let { add(f.string(R.string.reports_best_day, f.shortDate(LocalDate.ofEpochDay(it.epochDay)), MetricFormat.withUnit(it.value, 0, it.unit, f.locale))) }
            m.worst?.let { add(f.string(R.string.reports_worst_day, f.shortDate(LocalDate.ofEpochDay(it.epochDay)), MetricFormat.withUnit(it.value, 0, it.unit, f.locale))) }
        }.joinToString(". ")
        rows += ShareRow(f.string(metricLabelRes(m.metric)), stateText(m.mean, f), note)
    }
    rows += ShareRow(f.string(R.string.reports_workouts_label), stateText(ui.workouts, f), provenanceText(ui.workouts, f))
    rows += ShareRow(
        f.string(R.string.reports_workout_strain_label), stateText(ui.meanStrainOnWorkoutDays, f),
        f.string(R.string.reports_workout_strain_days, ui.workoutDaysWithStrain),
    )
    val zone = ui.loadAtEnd.zone
    rows += ShareRow(
        f.string(R.string.reports_load_label),
        zone?.let { f.string(loadZoneRes(it)) } ?: MetricFormat.MISSING,
        if (zone == null) f.string(loadMissingRes(ui.loadAtEnd.reason)) else f.string(R.string.reports_load_note),
    )
    ui.goals.forEach { g -> rows += ShareRow(f.string(R.string.reports_goals_title), goalText(g, ui.type, f), null) }
    rows += ShareRow(
        f.string(R.string.reports_coverage_label),
        f.string(R.string.reports_coverage_value, ui.coverageDays, ui.daysInPeriod, ui.coveragePercent),
        buildList {
            if (ui.sparse) add(f.string(R.string.reports_sparse_note))
            if (ui.partial) add(f.string(R.string.reports_partial_note))
        }.joinToString(" ").takeIf { it.isNotEmpty() },
    )
    return ShareContent(
        title = f.string(R.string.reports_share_title_line),
        subtitle = periodTitle(ui.type, ui.startEpochDay, ui.endEpochDay, f),
        rows = rows,
        footer = f.string(R.string.reports_footer),
    )
}

// --- Rendering (android.graphics, no Compose capture) ------------------------------------------------

/** Colour ints for the share image. The image uses the app theme's colours; the PDF uses plain black on white for printing. */
data class ShareColors(val background: Int, val text: Int, val muted: Int, val accent: Int)

object ReportRenderer {
    const val IMAGE_WIDTH_PX = 1080
    const val PDF_WIDTH_PT = 595
    private const val DESIGN_WIDTH = 360f
    private const val MAX_IMAGE_HEIGHT_PX = 12_000

    private class Laid(val blocks: List<Block>, val height: Int, val unit: Float, val margin: Float)
    private class Block(val layout: StaticLayout, val gapAfter: Float, val color: Int)

    private fun paint(color: Int, size: Float, bold: Boolean) = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        this.color = color
        textSize = size
        typeface = if (bold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
    }

    private fun layout(text: CharSequence, p: TextPaint, width: Int) =
        StaticLayout.Builder.obtain(text, 0, text.length, p, width).setAlignment(Layout.Alignment.ALIGN_NORMAL).setIncludePad(false).build()

    private fun lay(content: ShareContent, colors: ShareColors, widthPx: Int): Laid {
        val unit = widthPx / DESIGN_WIDTH
        val margin = 20f * unit
        val inner = (widthPx - 2 * margin).toInt()
        val blocks = ArrayList<Block>()
        blocks += Block(layout(content.title, paint(colors.muted, 12f * unit, true), inner), 4f * unit, colors.muted)
        blocks += Block(layout(content.subtitle, paint(colors.text, 24f * unit, true), inner), 18f * unit, colors.text)
        content.rows.forEach { row ->
            blocks += Block(layout(row.label, paint(colors.muted, 12f * unit, true), inner), 2f * unit, colors.muted)
            blocks += Block(layout(row.value, paint(colors.text, 20f * unit, true), inner), 2f * unit, colors.text)
            if (!row.note.isNullOrBlank()) blocks += Block(layout(row.note, paint(colors.muted, 12f * unit, false), inner), 12f * unit, colors.muted)
            else blocks += Block(layout(" ", paint(colors.muted, 1f * unit, false), inner), 12f * unit, colors.muted)
        }
        blocks += Block(layout(content.footer, paint(colors.muted, 11f * unit, false), inner), 0f, colors.muted)
        val total = margin + blocks.sumOf { (it.layout.height + it.gapAfter).toDouble() }.toFloat() + margin
        return Laid(blocks, total.toInt(), unit, margin)
    }

    private fun draw(canvas: Canvas, laid: Laid, colors: ShareColors) {
        canvas.drawColor(colors.background)
        var y = laid.margin
        laid.blocks.forEach { b ->
            canvas.save()
            canvas.translate(laid.margin, y)
            b.layout.draw(canvas)
            canvas.restore()
            y += b.layout.height + b.gapAfter
        }
    }

    /** A PNG-ready bitmap of the report, 1080 px wide. Content beyond [MAX_IMAGE_HEIGHT_PX] is cut (never reached by a real report). */
    fun renderBitmap(content: ShareContent, colors: ShareColors): Bitmap {
        val laid = lay(content, colors, IMAGE_WIDTH_PX)
        val bitmap = Bitmap.createBitmap(IMAGE_WIDTH_PX, laid.height.coerceIn(1, MAX_IMAGE_HEIGHT_PX), Bitmap.Config.ARGB_8888)
        draw(Canvas(bitmap), laid, colors)
        return bitmap
    }

    /** A one-page PDF as tall as the content, 595 pt wide. */
    fun writePdf(content: ShareContent, colors: ShareColors, out: OutputStream) {
        val laid = lay(content, colors, PDF_WIDTH_PT)
        val doc = PdfDocument()
        try {
            val page = doc.startPage(PdfDocument.PageInfo.Builder(PDF_WIDTH_PT, laid.height.coerceAtLeast(1), 1).create())
            draw(page.canvas, laid, colors)
            doc.finishPage(page)
            doc.writeTo(out)
        } finally {
            doc.close()
        }
    }
}

// --- Writing and sharing -----------------------------------------------------------------------------

object ReportSharer {
    /** The FileProvider authority: `<applicationId>.reports` (see the manifest entry in the wiring notes). */
    fun authority(context: Context): String = context.packageName + ".reports"

    fun directory(context: Context): File = File(context.cacheDir, "reports")

    /** `apex-report-week-2024-01-01.png`: ISO date and fixed words only, safe on every file system. */
    fun fileName(type: ReportPeriodType, startEpochDay: Long, extension: String): String =
        "apex-report-${type.name.lowercase()}-${LocalDate.ofEpochDay(startEpochDay)}.$extension"

    /** Clears older shared reports (they hold health values), then writes the new file in cacheDir/reports. */
    fun write(context: Context, name: String, writer: (OutputStream) -> Unit): File {
        val dir = directory(context)
        dir.mkdirs()
        dir.listFiles()?.forEach { it.delete() }
        val file = File(dir, name)
        file.outputStream().use(writer)
        return file
    }

    fun chooser(context: Context, file: File, mime: String, subject: String, chooserTitle: String): Intent {
        val uri = FileProvider.getUriForFile(context, authority(context), file)
        val send = Intent(Intent.ACTION_SEND).apply {
            type = mime
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, subject)
            clipData = ClipData.newRawUri(file.name, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        return Intent.createChooser(send, chooserTitle)
    }
}
