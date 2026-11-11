package app.fitdash.ui.pages

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.fitdash.metrics.FitnessCard
import app.fitdash.metrics.debtLevel
import app.fitdash.metrics.LoadBand
import app.fitdash.metrics.MissingInput
import app.fitdash.metrics.Status
import app.fitdash.metrics.TodayData
import app.fitdash.ui.components.Chart
import app.fitdash.ui.components.EmptyTrack
import app.fitdash.ui.components.SectionCard
import app.fitdash.ui.components.SectionLabel
import app.fitdash.ui.components.SmoothArea
import app.fitdash.ui.components.StatTile
import app.fitdash.ui.components.TileGrid
import app.fitdash.ui.fitnessAgeWord
import app.fitdash.ui.fitnessCardName
import app.fitdash.ui.formatHoursShort
import app.fitdash.ui.formatSteps
import app.fitdash.ui.loadWord
import app.fitdash.ui.missingWord
import app.fitdash.ui.theme.LocalReduceMotion
import app.fitdash.ui.theme.Motion
import app.fitdash.ui.theme.Palette
import app.fitdash.ui.theme.Space
import app.fitdash.ui.theme.Tint
import app.fitdash.ui.theme.Type
import kotlinx.coroutines.delay
import java.util.Locale

// Band colours: good, middle, watch, poor, all from the theme so each look stays coherent.
@Composable
private fun bandColour(level: Int): Color = when (level) {
    0 -> Palette.Good
    1 -> Palette.Accent
    2 -> Palette.Warn
    else -> Palette.Bad
}

private fun ageLevel(delta: Int) = when {
    delta < -1 -> 0
    delta <= 1 -> 1
    delta < 10 -> 2
    else -> 3
}

private fun loadLevel(band: LoadBand) = when (band) {
    LoadBand.STEADY -> 0
    LoadBand.EASING -> 1
    LoadBand.RAMPING -> 2
}

fun LazyListScope.fitnessSection(data: TodayData, chrome: PageChrome) {
    val f = data.fitness
    item(key = "fitness-label") { SectionLabel("FITNESS") }
    item(key = "fitness-age") { FitnessAgeCard(data, chrome) }
    item(key = "fitness-tiles") {
        val tiles = buildList<@Composable (Modifier) -> Unit> {
            if (!f.watchVo2) add { m -> Vo2Tile(data, chrome, m, Tint.SKY) }
            add { m -> SleepDebtTile(data, m, Tint.SAND) }
            if (f.trainingLoad != null) add { m -> LoadTile(data, m, Tint.ROSE) }
            add { m -> CaloriesTile(data, chrome, m, Tint.PEACH) }
        }
        TileGrid(tiles)
    }
}

@Composable
private fun FitnessAgeCard(data: TodayData, chrome: PageChrome) {
    val f = data.fitness
    val age = f.fitnessAge
    val missing = f.missing[FitnessCard.FITNESS_AGE]
    val open = metricOpener(MetricRef.Fitness(FitnessCard.FITNESS_AGE))
    SectionCard(
        "FITNESS AGE",
        trailing = if (age != null) "tap for the formula" else null,
        onClick = if (age != null) open else if (missing == MissingInput.WEIGHT) null else chrome.onMenu,
        description = if (age != null) metricDescription(MetricRef.Fitness(FitnessCard.FITNESS_AGE)) else missing?.let(::missingWord),
    ) {
        if (age == null) {
            Text("—", style = Type.hero, color = Palette.Faint)
            Text(missing?.let(::missingWord) ?: "", style = Type.tiny, color = Palette.Muted)
            return@SectionCard
        }
        val colour = bandColour(ageLevel(age.value.delta))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                // Counts from the real age to the fitness age so the delta is visible as motion.
                AgeCountUp(age.value.realAge, age.value.years)
                Text(fitnessAgeWord(age.value.delta), style = Type.body.copy(fontWeight = FontWeight.Medium), color = colour)
                Text("VO₂max est. ${String.format(Locale.ENGLISH, "%.1f", age.value.vo2)} ml/kg/min", style = Type.tiny, color = Palette.Muted, modifier = Modifier.padding(top = Space.xs))
            }
            Box(Modifier.width(140.dp)) {
                val values = f.fitnessAgeSeries.map { it.value }
                if (values.count { it != null } >= 2) SmoothArea("fitness-age-series", values, height = 64.dp, color = colour)
                else EmptyTrack()
            }
        }
    }
}

@Composable
private fun AgeCountUp(from: Int, to: Int) {
    val reduce = LocalReduceMotion.current
    val value = remember { Animatable(if (reduce) to.toFloat() else from.toFloat()) }
    LaunchedEffect(to) { if (reduce) value.snapTo(to.toFloat()) else value.animateTo(to.toFloat(), tween(Motion.COUNT, easing = Motion.ease)) }
    Row(verticalAlignment = Alignment.Bottom) {
        Text(value.value.toInt().toString(), style = Type.hero, color = Palette.Text)
        Text("years", style = Type.secondary, color = Palette.Muted, modifier = Modifier.padding(start = Space.xs, bottom = 10.dp))
    }
}

@Composable
private fun Vo2Tile(data: TodayData, chrome: PageChrome, m: Modifier, tint: Tint) {
    val f = data.fitness
    val v = f.vo2Estimate
    val missing = f.missing[FitnessCard.VO2]
    if (v == null) {
        StatTile(fitnessCardName(FitnessCard.VO2), "—", null, missing?.let(::missingWord) ?: "", m, onClick = if (missing == MissingInput.BIRTH_YEAR) chrome.onMenu else null, tint = tint) { EmptyTrack() }
        return
    }
    val open = metricOpener(MetricRef.Fitness(FitnessCard.VO2))
    StatTile(fitnessCardName(FitnessCard.VO2), String.format(Locale.ENGLISH, "%.1f", v.value), "ml/kg/min", "tap for the formula", m, onClick = open, description = metricDescription(MetricRef.Fitness(FitnessCard.VO2)), tint = tint) {
        val values = f.vo2Series.map { it.value }
        if (values.size >= 2) SmoothArea("vo2-series", values, height = 28.dp) else EmptyTrack()
    }
}

@Composable
private fun SleepDebtTile(data: TodayData, m: Modifier, tint: Tint) {
    val d = data.fitness.sleepDebt
    val open = metricOpener(MetricRef.Fitness(FitnessCard.SLEEP_DEBT))
    val colour = bandColour(when (debtLevel(d.value.hours)) { Status.GOOD -> 0; Status.BELOW_USUAL -> 2; else -> 3 })
    StatTile(fitnessCardName(FitnessCard.SLEEP_DEBT), formatHoursShort(d.value.hours).removeSuffix(" h"), "h", "last 7 nights · tap for the formula", m, onClick = open, description = metricDescription(MetricRef.Fitness(FitnessCard.SLEEP_DEBT)), tint = tint) {
        NightStrip(d.value.nights, data.goals.sleepHours, colour)
    }
}

// Seven blocks, one per night, filled by that night's shortfall; fills night by night unless Reduce motion is on.
@Composable
private fun NightStrip(nights: List<Double>, goal: Double, colour: Color) {
    val reduce = LocalReduceMotion.current
    Row(Modifier.fillMaxWidth().height(22.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        nights.forEachIndexed { i, short ->
            val fill = (short / goal).coerceIn(0.0, 1.0).toFloat()
            val progress = remember(i) { Animatable(if (reduce) 1f else 0f) }
            LaunchedEffect(i) { if (!reduce) { delay(60L * i); progress.animateTo(1f, tween(Motion.RISE, easing = Motion.ease)) } }
            Box(Modifier.weight(1f).height(22.dp).clip(RoundedCornerShape(4.dp)).background(Chart.track), contentAlignment = Alignment.BottomCenter) {
                Box(Modifier.fillMaxWidth().height((22 * fill * progress.value).dp).background(colour))
            }
        }
    }
}

@Composable
private fun LoadTile(data: TodayData, m: Modifier, tint: Tint) {
    val l = data.fitness.trainingLoad ?: return
    val open = metricOpener(MetricRef.Fitness(FitnessCard.TRAINING_LOAD))
    val colour = bandColour(loadLevel(l.value.band))
    StatTile(fitnessCardName(FitnessCard.TRAINING_LOAD), String.format(Locale.ENGLISH, "%.1f", l.value.ratio), null, "${loadWord(l.value.band)} · tap for the formula", m, onClick = open, description = metricDescription(MetricRef.Fitness(FitnessCard.TRAINING_LOAD)), tint = tint) {
        LoadBar(l.value.ratio, colour)
    }
}

// A track from 0 to 2.0 with the 0.8–1.3 zone marked; the marker slides into place over 400 ms.
@Composable
private fun LoadBar(ratio: Double, colour: Color) {
    val reduce = LocalReduceMotion.current
    val target = (ratio / 2.0).coerceIn(0.0, 1.0).toFloat()
    val pos = remember { Animatable(if (reduce) target else 0f) }
    LaunchedEffect(target) { if (reduce) pos.snapTo(target) else pos.animateTo(target, tween(400, easing = Motion.ease)) }
    BoxWithConstraints(Modifier.fillMaxWidth().height(14.dp)) {
        val w = maxWidth
        Box(Modifier.fillMaxWidth().height(6.dp).align(Alignment.Center).clip(RoundedCornerShape(3.dp)).background(Chart.track))
        Box(Modifier.offset(x = w * 0.4f).width(w * 0.25f).height(6.dp).align(Alignment.CenterStart).clip(RoundedCornerShape(3.dp)).background(Palette.Good.copy(alpha = 0.35f)))
        Box(Modifier.offset(x = (w - 10.dp) * pos.value).size(10.dp).align(Alignment.CenterStart).clip(CircleShape).background(colour))
    }
}

@Composable
private fun CaloriesTile(data: TodayData, chrome: PageChrome, m: Modifier, tint: Tint) {
    val f = data.fitness
    val c = f.calories
    val missing = f.missing[FitnessCard.CALORIES]
    if (c == null) {
        StatTile(fitnessCardName(FitnessCard.CALORIES), "—", null, missing?.let(::missingWord) ?: "", m, onClick = if (missing == MissingInput.WEIGHT) null else chrome.onMenu, tint = tint) { EmptyTrack() }
        return
    }
    val open = metricOpener(MetricRef.Fitness(FitnessCard.CALORIES))
    // ValueText always appends the unit, so the number goes through it as a plain value; no count-up here.
    StatTile(fitnessCardName(FitnessCard.CALORIES), formatSteps(c.value.resting.toLong()), "kcal", "${formatSteps(c.value.daily.toLong())} kcal a day with your steps", m, onClick = open, description = metricDescription(MetricRef.Fitness(FitnessCard.CALORIES)), tint = tint) {
        Text("at rest", style = Type.tiny, color = Palette.Muted)
    }
}
