package app.fitdash.ui.pages

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.fitdash.metrics.Explanation
import app.fitdash.metrics.FitnessCard
import app.fitdash.metrics.TodayData
import app.fitdash.ui.NOT_MEDICAL
import app.fitdash.ui.components.ValueText
import app.fitdash.ui.fitnessAgeWord
import app.fitdash.ui.fitnessCardName
import app.fitdash.ui.formatHoursShort
import app.fitdash.ui.formatSteps
import app.fitdash.ui.loadWord
import app.fitdash.metrics.regularityBand
import app.fitdash.ui.regularityWord
import app.fitdash.ui.theme.LocalReduceMotion
import app.fitdash.ui.theme.LocalTheme
import app.fitdash.ui.theme.Palette
import app.fitdash.ui.theme.Space
import app.fitdash.ui.theme.Type
import kotlinx.coroutines.delay
import java.util.Locale

private const val FORMULA_DELAY_MS = 120L

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FitnessSheet(card: FitnessCard, data: TodayData, onDismiss: () -> Unit) {
    val f = data.fitness
    val shown = when (card) {
        FitnessCard.FITNESS_AGE -> f.fitnessAge?.let { Shown(it.value.years.toString(), "years", fitnessAgeWord(it.value.delta), it.explanation) }
        FitnessCard.VO2 -> f.vo2Estimate?.let { Shown(String.format(Locale.ENGLISH, "%.1f", it.value), "ml/kg/min", null, it.explanation) }
        FitnessCard.SLEEP_DEBT -> f.sleepDebt.let { Shown(formatHoursShort(it.value.hours).removeSuffix(" h"), "h", "over the last 7 nights", it.explanation) }
        FitnessCard.TRAINING_LOAD -> f.trainingLoad?.let { Shown(String.format(Locale.ENGLISH, "%.1f", it.value.ratio), null, loadWord(it.value.band), it.explanation) }
        FitnessCard.CALORIES -> f.calories?.let { Shown(formatSteps(it.value.resting.toLong()), "kcal at rest", "${formatSteps(it.value.daily.toLong())} kcal a day with your steps", it.explanation) }
        FitnessCard.REGULARITY -> data.regularity?.let { Shown(it.value.sri.toString(), null, regularityWord(regularityBand(it.value.sri)), it.explanation) }
    } ?: Shown("—", null, null, null)
    val reduce = LocalReduceMotion.current
    var showFormula by remember { mutableStateOf(reduce) }
    // The value is read first; the formula fades in a beat later.
    LaunchedEffect(Unit) { if (!reduce) { delay(FORMULA_DELAY_MS); showFormula = true } }

    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = LocalTheme.current.bgMid) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = Space.xl).padding(bottom = Space.xxl)) {
            Text(fitnessCardName(card).uppercase(), style = Type.label, color = Palette.Muted)
            ValueText(shown.value, shown.unit, Modifier.padding(top = Space.xs), style = Type.hero.copy(fontSize = 56.sp))
            if (shown.word != null) Text(shown.word, style = Type.body, color = Palette.Muted)
            AnimatedVisibility(visible = showFormula, enter = fadeIn(tween(220))) {
                Column {
                    if (shown.explanation != null) ExplanationBlock(shown.explanation)
                    HorizontalDivider(Modifier.padding(vertical = Space.l), color = Palette.Divider)
                    Text(NOT_MEDICAL, style = Type.tiny, color = Palette.Faint)
                    if (card == FitnessCard.FITNESS_AGE || card == FitnessCard.CALORIES) {
                        Text(
                            "The study behind this grouped people by sex at birth. Gender in Settings picks which equation is used; choose whichever matches your physiology.",
                            style = Type.tiny, color = Palette.Faint, modifier = Modifier.padding(top = Space.s),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ExplanationBlock(e: Explanation) {
    Text("HOW THIS IS WORKED OUT", style = Type.label, color = Palette.Muted, modifier = Modifier.padding(top = Space.xl, bottom = Space.s))
    Text(e.formula, style = Type.small, color = Palette.Text)
    Text("INPUTS USED", style = Type.label, color = Palette.Muted, modifier = Modifier.padding(top = Space.l, bottom = Space.s))
    e.inputs.forEach { (k, v) ->
        Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(k, style = Type.small, color = Palette.Muted)
            Text(v, style = Type.small, color = Palette.Text)
        }
    }
    e.note?.let { Text(it, style = Type.secondary, color = Palette.Muted, modifier = Modifier.padding(top = Space.s)) }
    Text("SOURCE", style = Type.label, color = Palette.Muted, modifier = Modifier.padding(top = Space.l, bottom = Space.s))
    Text(e.source.title, style = Type.small, color = Palette.Text)
    Text(e.source.citation, style = Type.secondary, color = Palette.Muted)
}

private data class Shown(val value: String, val unit: String?, val word: String?, val explanation: Explanation?)
