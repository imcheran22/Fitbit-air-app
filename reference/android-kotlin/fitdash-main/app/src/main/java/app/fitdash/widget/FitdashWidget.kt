package app.fitdash.widget

import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import app.fitdash.MainActivity
import app.fitdash.health.SnapshotCache
import app.fitdash.metrics.Goals
import app.fitdash.metrics.MetricKind
import app.fitdash.metrics.ReadinessResult
import app.fitdash.metrics.TodayData
import app.fitdash.metrics.buildToday
import app.fitdash.settings.SettingsStore
import app.fitdash.ui.formatDuration
import app.fitdash.ui.morningReadout
import app.fitdash.ui.formatSteps
import app.fitdash.ui.theme.DARK
import app.fitdash.ui.theme.LOOK
import app.fitdash.ui.theme.ThemeTokens
import app.fitdash.ui.theme.resolveDark
import app.fitdash.ui.theme.scoreColor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.ZonedDateTime
import kotlin.math.roundToInt

const val EXTRA_PAGE = "app.fitdash.PAGE"

private val SMALL = DpSize(110.dp, 110.dp)
private val WIDE = DpSize(250.dp, 110.dp)

// The hero number and what it is, the same choice as Today: recovery, else last night's sleep score, else steps progress.
private fun hero(data: TodayData): Pair<Int?, String> {
    val recovery = (data.readiness as? ReadinessResult.Ready)?.score
    return when {
        recovery != null -> recovery to "recovery"
        data.sleep?.score != null -> data.sleep.score to "sleep"
        (data.activity?.steps ?: 0L) > 0L -> data.movementScore to "steps"
        else -> null to "no data"
    }
}

class FitdashWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Responsive(setOf(SMALL, WIDE))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val settings = SettingsStore.get(context).flow.value
        val data = withContext(Dispatchers.IO) {
            SnapshotCache(context).load()?.takeIf { c -> c.snapshot.sources.any { it.hasData } }?.let {
                buildToday(it.snapshot, ZonedDateTime.now(), goals = Goals(settings.stepGoal, settings.sleepHours, settings.waterGoalMl / 1000.0, settings.activeGoal))
            }
        }
        val systemDark = (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        provideContent { WidgetContent(if (resolveDark(settings.theme, systemDark)) DARK else LOOK, data, settings.showSuggestions) }
    }
}

class FitdashWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = FitdashWidget()
}

private fun open(context: Context, page: Int) = actionStartActivity(
    Intent(context, MainActivity::class.java).putExtra(EXTRA_PAGE, page).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP),
)

private fun color(c: Color) = ColorProvider(c)

@Composable
private fun WidgetContent(t: ThemeTokens, data: TodayData?, showSuggestions: Boolean) {
    val context = LocalContext.current
    val wide = LocalSize.current.width >= WIDE.width
    Box(
        GlanceModifier.fillMaxSize().background(color(t.card)).cornerRadius(24.dp).padding(14.dp).clickable(open(context, 0)),
        contentAlignment = Alignment.Center,
    ) {
        if (data == null) {
            Text("Open fitdash to load your data", style = TextStyle(color = color(t.muted), fontSize = 13.sp))
            return@Box
        }
        val (score, label) = hero(data)
        if (!wide) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Ring(t, score, label, 76)
                Spacer(GlanceModifier.height(6.dp))
                Text(smallLine(data), style = TextStyle(color = color(t.muted), fontSize = 12.sp), maxLines = 1)
            }
        } else {
            Row(GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
                Ring(t, score, label, 84)
                Spacer(GlanceModifier.width(14.dp))
                Column(GlanceModifier.defaultWeight()) {
                    morningReadout(data.sleep?.asleep, data.heart, data.suggestions.firstOrNull().takeIf { showSuggestions })?.let {
                        Text(it, style = TextStyle(color = color(t.text), fontSize = 12.sp), maxLines = 2)
                        Spacer(GlanceModifier.height(4.dp))
                    }
                    MetricRow(t, "Sleep", data.sleep?.let { formatDuration(it.asleep) } ?: "—", data.week(MetricKind.SLEEP_HOURS), t.rem, open(context, 1))
                    MetricRow(t, "Steps", data.activity?.let { formatSteps(it.steps) } ?: "—", data.week(MetricKind.STEPS), t.accent, open(context, 2))
                    MetricRow(t, "Resting HR", data.heart?.restingHr?.let { "${it.roundToInt()} bpm" } ?: "—", data.week(MetricKind.RESTING_HR), t.bad, open(context, 0))
                }
            }
        }
    }
}

private fun TodayData.week(kind: MetricKind): List<Double?> = series[kind].orEmpty().takeLast(7).map { it.value }

private fun smallLine(data: TodayData): String = listOfNotNull(
    data.sleep?.let { formatDuration(it.asleep) },
    data.activity?.let { "${formatSteps(it.steps)} steps" },
).joinToString(" · ").ifEmpty { "fitdash" }

@Composable
private fun Ring(t: ThemeTokens, score: Int?, label: String, sizeDp: Int) {
    val context = LocalContext.current
    val px = (sizeDp * context.resources.displayMetrics.density).roundToInt()
    val ringColor = score?.let { scoreColor(it, t) } ?: t.faint
    val track = t.bgBottom
    Box(GlanceModifier.size(sizeDp.dp), contentAlignment = Alignment.Center) {
        Image(ImageProvider(ringBitmap(px, (score ?: 0) / 100f, ringColor, track)), contentDescription = null, modifier = GlanceModifier.size(sizeDp.dp))
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(score?.toString() ?: "—", style = TextStyle(color = color(t.text), fontSize = (sizeDp * 0.3).sp, fontWeight = FontWeight.Medium))
            Text(label, style = TextStyle(color = color(t.muted), fontSize = 10.sp))
        }
    }
}

@Composable
private fun MetricRow(t: ThemeTokens, name: String, value: String, week: List<Double?>, line: Color, action: androidx.glance.action.Action) {
    val context = LocalContext.current
    val d = context.resources.displayMetrics.density
    Row(GlanceModifier.fillMaxWidth().padding(vertical = 3.dp).clickable(action), verticalAlignment = Alignment.CenterVertically) {
        Column(GlanceModifier.defaultWeight()) {
            Text(name, style = TextStyle(color = color(t.muted), fontSize = 11.sp))
            Text(value, style = TextStyle(color = color(t.text), fontSize = 15.sp, fontWeight = FontWeight.Medium))
        }
        Image(ImageProvider(sparkBitmap((56 * d).roundToInt(), (22 * d).roundToInt(), week, line)), contentDescription = null, modifier = GlanceModifier.width(56.dp).height(22.dp))
    }
}
