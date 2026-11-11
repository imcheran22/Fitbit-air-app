package app.fitdash.ui.pages

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.fitdash.metrics.FitnessCard
import app.fitdash.metrics.MIN_PAIRS
import app.fitdash.metrics.NightSpan
import app.fitdash.metrics.TodayData
import app.fitdash.metrics.nightAxisFraction
import app.fitdash.metrics.regularityBand
import app.fitdash.ui.components.Chart
import app.fitdash.ui.components.CountUpText
import app.fitdash.ui.components.ScoreChips
import app.fitdash.ui.components.SectionCard
import app.fitdash.ui.regularityChips
import app.fitdash.ui.components.rememberDrawProgress
import app.fitdash.ui.regularityWord
import app.fitdash.ui.theme.Motion
import app.fitdash.ui.theme.Palette
import app.fitdash.ui.theme.Space
import app.fitdash.ui.theme.Type
import app.fitdash.ui.theme.regularityColour
import java.time.ZoneId

@Composable
fun RegularityCard(data: TodayData, zone: ZoneId) {
    val r = data.regularity
    if (r == null) {
        SectionCard("REGULARITY", trailing = "last 14 nights") {
            Text("Calibrating · ${data.regularityProgress} of $MIN_PAIRS night pairs", style = Type.body, color = Palette.Muted)
            Text("Regularity needs five pairs of back-to-back nights. It compares when you are asleep with the same time the day before.", style = Type.tiny, color = Palette.Faint, modifier = Modifier.padding(top = Space.xs))
        }
        return
    }
    val v = r.value
    val band = regularityBand(v.sri)
    val colour = regularityColour(band)
    val open = metricOpener(MetricRef.Fitness(FitnessCard.REGULARITY))
    SectionCard("REGULARITY", trailing = "last 14 nights · tap for the formula", onClick = open, description = metricDescription(MetricRef.Fitness(FitnessCard.REGULARITY))) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.width(120.dp)) {
                CountUpText("regularity-${data.date}", v.sri.toLong(), Type.hero, color = Palette.Text)
                Text(regularityWord(band), style = Type.body.copy(fontWeight = FontWeight.Medium), color = colour)
                ScoreChips(regularityChips(v), Modifier.padding(top = Space.xs))
            }
            Spacer(Modifier.width(Space.m))
            NightBars(v.nights, zone, colour, Modifier.weight(1f))
        }
    }
}

@Composable
private fun NightBars(nights: List<NightSpan>, zone: ZoneId, colour: Color, modifier: Modifier) {
    Column(modifier) {
        nights.forEachIndexed { i, n ->
            val progress by rememberDrawProgress("night-${n.date}", Motion.RISE, 40 * i)
            Box(Modifier.fillMaxWidth().height(5.dp).padding(vertical = 0.5.dp).clip(RoundedCornerShape(2.dp)).background(Chart.track)) {
                if (n.start != null && n.end != null) {
                    val s = nightAxisFraction(n.start, zone)
                    // A night outside the axis (an afternoon sleeper) still gets a visible stub at its start.
                    val span = (nightAxisFraction(n.end, zone) - s).coerceAtLeast(0.03f)
                    val start = s.coerceAtMost(1f - span)
                    Row(Modifier.fillMaxWidth()) {
                        if (start > 0f) Spacer(Modifier.weight(start))
                        Box(Modifier.weight(span * progress + 0.0001f).height(4.dp).clip(RoundedCornerShape(2.dp)).background(colour))
                        val rest = 1f - start - span * progress
                        if (rest > 0f) Spacer(Modifier.weight(rest))
                    }
                }
            }
        }
    }
}
