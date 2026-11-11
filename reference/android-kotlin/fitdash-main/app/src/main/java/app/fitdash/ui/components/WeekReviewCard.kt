package app.fitdash.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.fitdash.metrics.MetricKind
import app.fitdash.metrics.WeekReview
import app.fitdash.metrics.WeekRow
import app.fitdash.ui.formatDuration
import app.fitdash.ui.formatSigned
import app.fitdash.ui.formatSteps
import app.fitdash.ui.theme.Palette
import app.fitdash.ui.theme.Space
import app.fitdash.ui.theme.Type
import java.time.Duration
import kotlin.math.roundToInt
import kotlin.math.roundToLong

private fun name(kind: MetricKind) = when (kind) {
    MetricKind.RECOVERY -> "Recovery"
    MetricKind.SLEEP_HOURS -> "Sleep a night"
    MetricKind.STEPS -> "Steps a day"
    MetricKind.ACTIVE_MINUTES -> "Active a day"
    else -> kind.name
}

private fun value(kind: MetricKind, v: Double) = when (kind) {
    MetricKind.SLEEP_HOURS -> formatDuration(Duration.ofMinutes((v * 60).roundToLong()))
    MetricKind.STEPS -> formatSteps(v.roundToLong())
    MetricKind.ACTIVE_MINUTES -> "${v.roundToInt()} min"
    else -> v.roundToInt().toString()
}

// Recovery moves in points and sleep in minutes; the rest read best as a share.
private fun change(r: WeekRow): String? {
    val last = r.lastWeek ?: return null
    val d = r.thisWeek - last
    return when (r.kind) {
        MetricKind.RECOVERY -> d.roundToInt().takeIf { it != 0 }?.let(::formatSigned)
        MetricKind.SLEEP_HOURS -> (d * 60).roundToInt().takeIf { it != 0 }?.let { "${formatSigned(it)}m" }
        else -> if (last <= 0) null else (d / last * 100).roundToInt().takeIf { it != 0 }?.let { "${formatSigned(it)}%" }
    }
}

// Last seven complete days against the seven before: one sentence on the biggest change, then a row per metric.
@Composable
fun WeekReviewCard(review: WeekReview, modifier: Modifier = Modifier, regularity: Int? = null, regularityLast: Int? = null, onDismiss: (() -> Unit)? = null) {
    SectionCard("LAST 7 DAYS", modifier, trailing = "vs week before") {
        if (onDismiss != null) {
            Row(Modifier.fillMaxWidth().padding(bottom = Space.s), verticalAlignment = Alignment.Top) {
                Text(review.headline.orEmpty(), Modifier.weight(1f), style = Type.body, color = Palette.Text)
                Text(
                    "×", Modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp).clickable(role = Role.Button, onClick = onDismiss).semantics { contentDescription = "Dismiss weekly review" }.wrapContentSize(Alignment.Center),
                    style = Type.body, color = Palette.Muted,
                )
            }
        } else if (review.headline != null) {
            Text(review.headline, Modifier.fillMaxWidth().padding(bottom = Space.s), style = Type.body, color = Palette.Text)
        }
        review.rows.forEach { r ->
            Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(name(r.kind), Modifier.weight(1f), style = Type.small, color = Palette.Muted)
                Text(value(r.kind, r.thisWeek), style = Type.small, color = Palette.Text)
                val c = change(r)
                if (c != null) {
                    DeltaArrow(r.thisWeek > (r.lastWeek ?: r.thisWeek), Modifier.padding(start = Space.s, end = 4.dp))
                    Text(c, style = Type.secondary, color = Palette.Muted)
                }
            }
        }
        if (regularity != null) {
            Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Sleep regularity", Modifier.weight(1f), style = Type.small, color = Palette.Muted)
                Text(regularity.toString(), style = Type.small, color = Palette.Text)
                val d = regularityLast?.let { regularity - it }?.takeIf { it != 0 }
                if (d != null) {
                    DeltaArrow(d > 0, Modifier.padding(start = Space.s, end = 4.dp))
                    Text(formatSigned(d), style = Type.secondary, color = Palette.Muted)
                }
            }
        }
    }
}
