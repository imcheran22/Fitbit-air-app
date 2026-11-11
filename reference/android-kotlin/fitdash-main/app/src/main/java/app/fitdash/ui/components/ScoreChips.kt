package app.fitdash.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import app.fitdash.metrics.FitnessCard
import app.fitdash.metrics.MetricKind
import app.fitdash.metrics.Status
import app.fitdash.ui.pages.LocalOpenMetric
import app.fitdash.ui.pages.MetricRef
import app.fitdash.ui.theme.Type

data class ScoreChip(val label: String, val status: Status, val kind: MetricKind? = null, val fitness: FitnessCard? = null)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ScoreChips(chips: List<ScoreChip>, modifier: Modifier = Modifier) {
    val open = LocalOpenMetric.current
    FlowRow(modifier, horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        chips.forEach { chip ->
            val colour = statusColour(chip.status)
            val ref = chip.kind?.let { MetricRef.Kind(it) } ?: chip.fitness?.let { MetricRef.Fitness(it) }
            Text(
                chip.label,
                Modifier
                    .tappable(ref?.let { { open(it) } }, "${chip.label} details")
                    .clip(RoundedCornerShape(12.dp))
                    .background(colour.copy(alpha = 0.14f))
                    .padding(horizontal = 10.dp, vertical = 5.dp),
                style = Type.status,
                color = colour,
            )
        }
    }
}
