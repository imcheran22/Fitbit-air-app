package app.fitdash.ui.pages

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import app.fitdash.ui.components.cardSurface
import androidx.compose.ui.unit.dp
import app.fitdash.metrics.FitnessCard
import app.fitdash.metrics.MetricKind
import app.fitdash.metrics.debtLevel
import app.fitdash.ui.bedtimeLine
import app.fitdash.ui.formatHoursShort
import app.fitdash.ui.components.ScoreChip
import app.fitdash.metrics.Status
import app.fitdash.metrics.TYPICAL_AWAKE
import app.fitdash.metrics.TYPICAL_DEEP
import app.fitdash.metrics.TYPICAL_LIGHT
import app.fitdash.metrics.TYPICAL_REM
import app.fitdash.metrics.TodayData
import app.fitdash.metrics.VitalReading
import app.fitdash.metrics.asleepDuration
import app.fitdash.metrics.rangeStatus
import app.fitdash.metrics.rangeWord
import app.fitdash.metrics.efficiencyStatus
import app.fitdash.metrics.awakeningsStatus
import app.fitdash.metrics.scoreStatus
import app.fitdash.metrics.sleepScoreStatus
import app.fitdash.metrics.regularityBand
import app.fitdash.ui.theme.regularityColour
import app.fitdash.ui.theme.sleepScoreColour
import app.fitdash.metrics.shareStatus
import app.fitdash.ui.components.SmoothArea
import app.fitdash.ui.components.CardShape
import app.fitdash.ui.components.tappable
import app.fitdash.ui.components.EmptyState
import app.fitdash.ui.components.EmptyTrack
import app.fitdash.ui.components.Heading
import app.fitdash.ui.components.Hypnogram
import app.fitdash.ui.components.ListRow
import app.fitdash.ui.components.RowGroup
import app.fitdash.ui.components.NavIcons
import app.fitdash.ui.components.NumberTile
import app.fitdash.ui.components.RangeBar
import app.fitdash.ui.components.SectionCard
import app.fitdash.ui.components.SectionLabel
import app.fitdash.ui.components.ScoreChips
import app.fitdash.ui.components.SemiGauge
import app.fitdash.ui.sleepChips
import app.fitdash.ui.components.SpanBar
import app.fitdash.ui.components.StatTile
import app.fitdash.ui.components.TileGrid
import app.fitdash.ui.components.TypicalShareBar
import app.fitdash.ui.dayLetter
import app.fitdash.ui.formatDate
import app.fitdash.ui.formatDuration
import app.fitdash.ui.formatNumber
import app.fitdash.ui.clock
import app.fitdash.ui.formatTempDelta
import app.fitdash.ui.LocalPrefs
import app.fitdash.ui.sleepWord
import app.fitdash.ui.regularityWord
import androidx.compose.ui.text.style.TextAlign
import kotlin.math.roundToLong
import app.fitdash.ui.metricName
import app.fitdash.ui.rangeNote
import app.fitdash.ui.theme.Palette
import app.fitdash.ui.theme.Tint
import app.fitdash.ui.theme.Space
import app.fitdash.ui.theme.Type
import app.fitdash.ui.theme.scoreColor
import java.time.Duration
import java.time.ZoneId
import kotlin.math.roundToInt

private fun hoursMins(d: Duration): List<Pair<String, String>> =
    if (d.toHours() == 0L) listOf((d.toMinutes() % 60).toString() to "mins")
    else listOf(d.toHours().toString() to "hrs", (d.toMinutes() % 60).toString() to "mins")

@Composable
fun SleepPage(data: TodayData, chrome: PageChrome) {
    val s = data.sleep
    val zone = ZoneId.systemDefault()
    val showScore = LocalPrefs.current.showSleepScore
    val weekHours = data.sleepWeek.mapNotNull { it.hours }
    @Composable fun opener(kind: MetricKind) = metricOpener(MetricRef.Kind(kind))
    PageColumn(chrome, accent = Palette.Rem) {
        if (s == null) {
            item(key = "empty") { EmptyState(if (data.isToday) "No sleep last night" else "No sleep that night", if (LocalPrefs.current.phoneOnly) "Add last night's sleep in the Log tab." else "Wear your device to bed and sync it. Your night will show up here.") }
        } else {
            item(key = "gauge") {
                val colour = sleepScoreColour(s.score)
                Column(Modifier.fillMaxWidth().padding(top = Space.m).clip(CardShape).tappable(opener(MetricKind.SLEEP_SCORE), "Sleep score details"), horizontalAlignment = Alignment.CenterHorizontally) {
                    if (showScore) {
                        SemiGauge(s.score, "Sleep", sleepScoreStatus(s.score), from = Palette.Deep, to = colour, tag = sleepWord(s.score))
                    } else {
                        val band = data.regularity?.let { regularityBand(it.value.sri) }
                        val regColour = band?.let { regularityColour(it) } ?: Palette.Accent
                        SemiGauge(
                            s.goalPercent, "Sleep", Status.GOOD, key = "gauge-hours-${data.date}", value = formatDuration(s.asleep),
                            from = Palette.Deep, to = regColour, tag = band?.let(::regularityWord) ?: "calibrating", chip = regColour,
                        )
                    }
                    Text(
                        "${formatDuration(s.asleep)} asleep · ${(s.efficiency * 100).roundToInt()}% efficient".uppercase(),
                        Modifier.padding(top = Space.s),
                        style = Type.tiny,
                        color = Palette.Muted,
                    )
                    val debt = data.fitness.sleepDebt.value.hours
                    val debtChip = ScoreChip("Sleep debt ${formatHoursShort(debt)}", debtLevel(debt), fitness = FitnessCard.SLEEP_DEBT)
                    ScoreChips(sleepChips(s, data.goals.sleepHours) + debtChip, Modifier.padding(top = Space.s))
                    if (s.goalPercent < 100) {
                        val avg = weekHours.takeIf { it.size >= 3 }?.average()
                        Text(
                            "One night on its own says little." + (avg?.let { " Your 7-night average is ${formatDuration(Duration.ofMinutes((it * 60).roundToLong()))}." } ?: ""),
                            Modifier.padding(top = Space.s, start = Space.xl, end = Space.xl), style = Type.body, color = Palette.Muted, textAlign = TextAlign.Center,
                        )
                    }
                }
            }
            item(key = "span") {
                Column(Modifier.padding(horizontal = Space.l).fillMaxWidth().cardSurface().padding(horizontal = Space.l, vertical = Space.m)) {
                    SpanBar(clock(s.start, zone), clock(s.end, zone))
                    if (data.isToday) bedtimeLine(data.fitness.sleepDebt.value.hours, data.bedtime, LocalPrefs.current.clock24)?.let {
                        Text(it, Modifier.padding(top = Space.s), style = Type.small, color = Palette.Muted)
                    }
                }
            }
            item(key = "regularity") { RegularityCard(data, zone) }
            item(key = "last-night") { Heading(if (data.isToday) "Last night" else "That night") }
            item(key = "sleep-tiles") {
                val hrCeiling = data.heart?.restingHrRange?.endInclusive
                val all = listOf<@Composable (Modifier) -> Unit>(
                        { m -> NumberTile("Total sleep", NavIcons.moonSmall, hoursMins(s.asleep), m, sleepScoreStatus(s.score), onClick = opener(MetricKind.SLEEP_HOURS), description = "Total sleep details", tint = Tint.SKY) },
                        { m -> NumberTile("Time in bed", NavIcons.clock, hoursMins(s.timeInBed), m, if (s.timeInBed >= Duration.ofMinutes((data.goals.sleepHours * 60).roundToInt().toLong())) Status.GOOD else Status.FAIR, onClick = opener(MetricKind.SLEEP_HOURS), description = "Time in bed details", tint = Tint.ROSE) },
                        { m ->
                            NumberTile(
                                "Efficiency", NavIcons.bed, listOf((s.efficiency * 100).roundToInt().toString() to "%"), m,
                                efficiencyStatus(s.efficiency),
                                onClick = opener(MetricKind.EFFICIENCY), description = "Sleep efficiency details", tint = Tint.SAND,
                            )
                        },
                        { m ->
                            NumberTile(
                                "Restorative", NavIcons.moonSmall,
                                listOf((s.restorative?.let { (it * 100).roundToInt().toString() } ?: "—") to if (s.restorative != null) "%" else ""),
                                m, s.restorative?.let { shareStatus(it, 0.33..0.48) },
                                onClick = opener(MetricKind.SLEEP_SCORE), description = "Restorative sleep details", tint = Tint.PEACH,
                            )
                        },
                        { m ->
                            NumberTile(
                                "Awakenings", NavIcons.sun,
                                listOf((s.awakenings?.toString() ?: "—") to if (s.awakenings != null) (if (s.awakenings == 1) "time" else "times") else ""),
                                m, s.awakenings?.let { awakeningsStatus(it) },
                                onClick = opener(MetricKind.AWAKENINGS), description = "Awakenings details", tint = Tint.ROSE,
                            )
                        },
                        { m ->
                            NumberTile(
                                "Overnight HR", NavIcons.heart,
                                listOf((s.overnightHr?.let { formatNumber(it) } ?: "—") to if (s.overnightHr != null) "bpm" else ""),
                                m, if (s.overnightHr != null && hrCeiling != null) (if (s.overnightHr <= hrCeiling) Status.GOOD else Status.FAIR) else null,
                                onClick = opener(MetricKind.RESTING_HR), description = "Overnight heart rate details", tint = Tint.SKY,
                            )
                        },
                )
                // Efficiency (index 2) and Awakenings (index 4) need stages.
                TileGrid(if (s.hasStages) all else all.filterIndexed { i, _ -> i != 2 && i != 4 })
            }
        }
        if (data.naps.isNotEmpty()) {
            item(key = "naps") {
                RowGroup {
                    data.naps.forEachIndexed { i, nap ->
                        ListRow(NavIcons.bed, "Nap", "${formatDuration(asleepDuration(nap))} · ${clock(nap.start, zone)} – ${clock(nap.end, zone)}", divider = i > 0)
                    }
                }
            }
        }
        if (s != null) {
            if (s.hasStages) {
                revealItem("stages", 0) {
                    SectionCard("STAGES") {
                        Hypnogram("sleep-hypnogram", s.stages)
                        Row(Modifier.fillMaxWidth().padding(top = Space.xs), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(clock(s.stages.minOf { it.start }, zone).uppercase(), style = Type.tiny, color = Palette.Muted)
                            Text(clock(s.stages.maxOf { it.end }, zone).uppercase(), style = Type.tiny, color = Palette.Muted)
                        }
                    }
                }
                val night = (s.asleep + s.awake).seconds.toFloat().coerceAtLeast(1f)
                revealItem("architecture", 1) {
                    SectionCard("SLEEP ARCHITECTURE") {
                        listOf(
                            Triple("Deep", s.deep, TYPICAL_DEEP) to MetricKind.DEEP,
                            Triple("Light", s.light, TYPICAL_LIGHT) to MetricKind.LIGHT,
                            Triple("REM", s.rem, TYPICAL_REM) to MetricKind.REM,
                            Triple("Awake", s.awake, TYPICAL_AWAKE) to MetricKind.AWAKE,
                        ).forEach { (stage, kind) ->
                            val (name, d, typical) = stage
                            val share = d.seconds / night
                            Column(Modifier.tappable(opener(kind), "${metricName(kind)} details").padding(vertical = Space.s)) {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text(name, style = Type.small, color = Palette.Text)
                                    Text("${formatDuration(d)} · ${(share * 100).roundToInt()}%".uppercase(), style = Type.tiny, color = Palette.Muted)
                                }
                                TypicalShareBar(share, typical.start.toFloat()..typical.endInclusive.toFloat(), Modifier.padding(top = Space.xs), key = "arch-$name-$share")
                            }
                        }
                        Text("DASHED BRACKET: TYPICAL RANGE", style = Type.tiny, color = Palette.Faint, modifier = Modifier.padding(top = Space.xs))
                    }
                }
            } else {
                revealItem("duration", 0) {
                    SectionCard("DURATION", trailing = "goal ${formatNumber(data.goals.sleepHours)}h") {
                        LinearProgressIndicator(
                            progress = { s.goalPercent / 100f },
                            modifier = Modifier.fillMaxWidth(),
                            color = sleepScoreColour(s.score),
                            trackColor = Palette.Divider,
                        )
                    }
                }
            }
        }
        if (data.vitals.isNotEmpty()) {
            item(key = "vitals-label") { SectionLabel("OVERNIGHT VITALS") }
            item(key = "vitals") {
                TileGrid(
                    data.vitals.mapIndexed<VitalReading, @Composable (Modifier) -> Unit> { i, v ->
                        { m ->
                            val f = LocalPrefs.current.fahrenheit && v.kind == MetricKind.SKIN_TEMP
                            StatTile(
                                v.label, if (f) formatTempDelta(v.value, true) else formatNumber(v.value), if (f) "°F" else v.unit, rangeNote(v.value, v.range, v.good), m,
                                status = v.range?.let { rangeWord(rangeStatus(v.value, it, v.good)) },
                                onClick = opener(v.kind),
                                description = "${metricName(v.kind)} details",
                                tint = VITAL_TINTS[i % VITAL_TINTS.size],
                            ) { v.range?.let { RangeBar("vital-${v.label}", v.value, it, v.good) } ?: EmptyTrack() }
                        }
                    },
                )
            }
        }
        if (weekHours.isNotEmpty()) {
            val known = weekHours
            revealItem("sleep-week", 2) {
                SectionCard(
                    "SLEEP · 7 NIGHTS",
                    trailing = "avg ${formatDuration(Duration.ofMinutes((known.average() * 60).roundToInt().toLong()))}",
                    onClick = opener(MetricKind.SLEEP_HOURS),
                    description = "Sleep details",
                ) {
                    SmoothArea(
                        "sleep-week",
                        data.sleepWeek.map { it.hours },
                        poor = { i -> (data.sleepWeek[i].score ?: 100) < 50 },
                        labels = data.sleepWeek.map { dayLetter(it.date) },
                        readout = { i -> "${formatDate(data.sleepWeek[i].date)} · ${data.sleepWeek[i].hours?.let { formatDuration(Duration.ofMinutes((it * 60).roundToInt().toLong())) } ?: "—"}" },
                        baseline = data.goals.sleepHours,
                        height = 80.dp,
                        color = Palette.Rem,
                    )
                }
            }
        }
    }
}

private val VITAL_TINTS = listOf(Tint.ROSE, Tint.SAND, Tint.PEACH, Tint.SKY)
