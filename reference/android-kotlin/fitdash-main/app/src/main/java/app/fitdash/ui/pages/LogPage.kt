package app.fitdash.ui.pages

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import java.time.LocalTime
import java.time.Duration
import app.fitdash.ui.formatHoursShort
import app.fitdash.ui.formatDuration
import app.fitdash.metrics.loggedNight
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.material3.TimePicker
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.fitdash.BuildConfig
import app.fitdash.health.SleepSession
import app.fitdash.metrics.TodayData
import app.fitdash.metrics.wakingWindow
import app.fitdash.metrics.waterDue
import app.fitdash.settings.JournalStore
import app.fitdash.settings.NutrientKind
import app.fitdash.settings.Tag
import app.fitdash.ui.LocalPrefs
import app.fitdash.ui.clock
import app.fitdash.ui.components.Bottle
import app.fitdash.ui.components.HeroCard
import app.fitdash.ui.components.ListRow
import app.fitdash.ui.components.MiniRing
import app.fitdash.ui.components.NumberWithUnits
import app.fitdash.ui.components.NavIcons
import app.fitdash.ui.components.Pill
import app.fitdash.ui.components.RowGroup
import app.fitdash.ui.components.SegmentedControl
import app.fitdash.ui.components.StripCard
import app.fitdash.ui.components.tappable
import app.fitdash.ui.formatDate
import app.fitdash.ui.formatLiters
import app.fitdash.ui.formatTime
import app.fitdash.ui.theme.LocalTheme
import app.fitdash.ui.theme.Palette
import app.fitdash.ui.theme.Space
import app.fitdash.ui.theme.Tint
import app.fitdash.ui.theme.Type
import kotlinx.coroutines.delay
import kotlin.math.roundToInt
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime

private const val UNDO_MILLIS = 3000L

private val tagIcon = mapOf(
    Tag.LATE_CAFFEINE to NavIcons.cup, Tag.ALCOHOL to NavIcons.wine, Tag.LATE_MEAL to NavIcons.meal,
    Tag.ILLNESS to NavIcons.thermometer, Tag.TRAVEL to NavIcons.plane, Tag.SCREEN_IN_BED to NavIcons.phone,
    Tag.STRESS to NavIcons.stress, Tag.LATE_WORKOUT to NavIcons.walk, Tag.NAP to NavIcons.moonSmall,
    Tag.EARLY_BED to NavIcons.moonSmall,
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LogPage(
    data: TodayData,
    chrome: PageChrome,
    journal: JournalStore,
    onAddWater: (Int) -> Unit,
    onUndoWater: () -> Unit,
    onAddNutrient: (NutrientKind, Double) -> Unit,
    onRemoveNutrient: (NutrientKind, Instant) -> Unit,
    onAddSleep: (Instant, Instant) -> Unit = { _, _ -> },
    onRemoveSleep: () -> Unit = {},
    initialSegment: Int = 0,
) {
    val prefs = LocalPrefs.current
    val haptic = LocalHapticFeedback.current
    val segments = if (BuildConfig.FLAVOR == "play") listOf("Water", "Sleep", "Tags") else listOf("Water", "Sleep", "Protein", "Caffeine", "Tags")
    // Without a watch, typing in last night's sleep is the main thing to do here.
    var segment by rememberSaveable { mutableIntStateOf(if (prefs.phoneOnly && initialSegment == 0) 1 else initialSegment) }
    val kind = when (segments[segment]) {
        "Protein" -> NutrientKind.PROTEIN
        "Caffeine" -> NutrientKind.CAFFEINE
        else -> null
    }
    val pillBorder = Palette.Accent.copy(alpha = 0.45f)
    // This session's adds only: Health Connect does not hand back which water records are ours.
    var entries by rememberSaveable { mutableStateOf(listOf<String>()) }
    var lastMl by remember { mutableIntStateOf(0) }
    var adds by remember { mutableIntStateOf(0) }
    var canUndo by remember { mutableStateOf(false) }
    var custom by remember { mutableStateOf(false) }
    var bed by rememberSaveable { mutableStateOf(data.bedtime ?: LocalTime.of(23, 0)) }
    var wake by rememberSaveable { mutableStateOf(LocalTime.of(7, 0)) }
    var picking by remember { mutableStateOf<Boolean?>(null) }
    var savedNight by rememberSaveable { mutableStateOf<String?>(null) }
    val days by journal.flow.collectAsState()
    val day = days[data.date]
    val zone = ZoneId.systemDefault()
    LaunchedEffect(adds) {
        if (adds > 0) {
            canUndo = true
            delay(UNDO_MILLIS)
            canUndo = false
        }
    }
    val add = { ml: Int ->
        onAddWater(ml)
        entries = listOf("Added $ml ml · ${formatTime(Instant.now(), ZoneId.systemDefault(), prefs.clock24)}") + entries
        lastMl = ml
        adds++
    }
    Box(Modifier.fillMaxSize()) {
        PageColumn(chrome, accent = Palette.Rem) {
            item(key = "segments") { SegmentedControl(segments, segment, { segment = it }) }
            if (segments[segment] == "Water") {
                revealItem("water", 0) {
                    HeroCard(null, "Water", tint = Tint.WATER) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Bottle((data.waterLiters / data.waterGoal).toFloat())
                            Column(Modifier.padding(start = Space.l)) {
                                NumberWithUnits(listOf(formatLiters(data.waterLiters) to "L"), style = Type.hero)
                                Text("of ${formatLiters(data.waterGoal)} L", style = Type.body, color = Palette.Muted)
                                if (data.isToday) {
                                    val now = ZonedDateTime.now()
                                    val window = wakingWindow(listOfNotNull(data.sleep?.let { SleepSession(it.start, it.end, it.stages) }), now, data.goals.sleepHours)
                                    val behind = waterDue(data.waterLiters, data.waterGoal, now, window, null)
                                    Text(
                                        if (behind) "Behind" else "On pace",
                                        Modifier.padding(top = Space.s).clip(RoundedCornerShape(8.dp)).background(Palette.Chip).padding(horizontal = 10.dp, vertical = 6.dp),
                                        style = Type.tiny.copy(fontWeight = FontWeight.Medium),
                                        color = if (behind) Palette.Warn else Palette.Text,
                                    )
                                }
                            }
                        }
                    }
                }
                if (data.isToday) {
                    item(key = "water-add") {
                        Row(Modifier.padding(horizontal = Space.l).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Pill("+250", Palette.Accent, pillBorder, { add(250) }, Modifier.weight(1f))
                            Pill("+500", Palette.Accent, pillBorder, { add(500) }, Modifier.weight(1f))
                            Pill("Custom", Palette.Text, Palette.Divider, { custom = true }, Modifier.weight(1f))
                        }
                    }
                    if (entries.isNotEmpty()) item(key = "water-entries") {
                        Column(Modifier.padding(horizontal = Space.xl), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                            entries.forEach { Text(it, style = Type.secondary, color = Palette.Muted) }
                        }
                    }
                }
            } else if (segments[segment] == "Sleep") {
                val (start, end) = loggedNight(bed, wake, data.date, zone)
                val hours = Duration.between(start, end).toMinutes() / 60.0
                val problem = when {
                    data.sleep != null -> "This night is already in Health Connect"
                    end > Instant.now() -> "Wake-up time is still to come"
                    hours < 1 || hours > 16 -> "A night is between 1 and 16 hours"
                    else -> null
                }
                revealItem("sleep", 0) {
                    HeroCard(null, "Sleep", tint = Tint.SKY) {
                        Column {
                            NumberWithUnits(listOf((data.sleep?.asleep?.let { formatDuration(it) } ?: "Not logged") to ""), style = Type.hero)
                            Text(if (data.isToday) "Last night" else "Night before ${formatDate(data.date)}", style = Type.body, color = Palette.Muted)
                        }
                    }
                }
                item(key = "sleep-times") {
                    RowGroup {
                        ListRow(NavIcons.moonSmall, "Went to bed", formatTime(bed, prefs.clock24), onClick = { picking = true })
                        ListRow(NavIcons.sun, "Woke up", formatTime(wake, prefs.clock24), onClick = { picking = false }, divider = true)
                    }
                }
                item(key = "sleep-add") {
                    Column(Modifier.padding(horizontal = Space.l), verticalArrangement = Arrangement.spacedBy(Space.s)) {
                        Pill(
                            "Save ${formatHoursShort(hours)}", if (problem == null) Palette.Accent else Palette.Faint, pillBorder,
                            {
                                if (problem == null) {
                                    onAddSleep(start, end)
                                    savedNight = "Saved ${formatTime(bed, prefs.clock24)} to ${formatTime(wake, prefs.clock24)}"
                                }
                            },
                            Modifier.fillMaxWidth(),
                        )
                        Text(problem ?: "Saved to Health Connect, like a watch would", style = Type.small, color = if (problem != null) Palette.Warn else Palette.Muted)
                    }
                }
                savedNight?.let { saved ->
                    item(key = "sleep-saved") {
                        RowGroup {
                            ListRow(
                                NavIcons.moonSmall, saved, null,
                                trailing = {
                                    Text(
                                        "Remove",
                                        Modifier.clip(RoundedCornerShape(8.dp)).tappable({ savedNight = null; onRemoveSleep() }, "Remove $saved").padding(Space.s),
                                        style = Type.label,
                                        color = Palette.Accent,
                                    )
                                },
                            )
                        }
                    }
                }
            } else if (kind != null) {
                val list = day?.entries(kind).orEmpty()
                if (kind == NutrientKind.PROTEIN) revealItem("protein", 0) {
                    val grams = list.sumOf { it.amount }
                    HeroCard(null, "Protein", tint = Tint.PEACH) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            MiniRing("protein", (grams / prefs.proteinGoalG).toFloat(), Palette.Text, diameter = 72.dp, stroke = 7.dp)
                            Column(Modifier.padding(start = Space.l)) {
                                NumberWithUnits(listOf(grams.roundToInt().toString() to "g"), style = Type.hero)
                                Text("of ${prefs.proteinGoalG} g", style = Type.body, color = Palette.Muted)
                            }
                        }
                    }
                } else revealItem("caffeine", 0) {
                    HeroCard(null, "Caffeine", tint = Tint.SAND) {
                        Column {
                            NumberWithUnits(listOf(list.size.toString() to if (list.size == 1) "cup" else "cups"), style = Type.hero)
                            Text(list.maxOfOrNull { it.at }?.let { "Last at ${clock(it, zone)}" } ?: "None today", style = Type.body, color = Palette.Muted)
                        }
                    }
                }
                if (data.isToday) item(key = "${kind.name}-add") {
                    Row(Modifier.padding(horizontal = Space.l).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        if (kind == NutrientKind.PROTEIN) {
                            Pill("+10 g", Palette.Accent, pillBorder, { onAddNutrient(kind, 10.0) }, Modifier.weight(1f))
                            Pill("+25 g", Palette.Accent, pillBorder, { onAddNutrient(kind, 25.0) }, Modifier.weight(1f))
                            Pill("Custom", Palette.Text, Palette.Divider, { custom = true }, Modifier.weight(1f))
                        } else {
                            Pill("+1 coffee", Palette.Accent, pillBorder, { onAddNutrient(kind, 95.0) }, Modifier.weight(1f))
                            Pill("+1 tea", Palette.Accent, pillBorder, { onAddNutrient(kind, 47.0) }, Modifier.weight(1f))
                        }
                    }
                }
                if (list.isNotEmpty()) item(key = "${kind.name}-entries") {
                    RowGroup {
                        list.sortedByDescending { it.at }.forEachIndexed { i, entry ->
                            val amount = if (kind == NutrientKind.PROTEIN) "${entry.amount.roundToInt()} g" else "${entry.amount.roundToInt()} mg"
                            ListRow(
                                if (kind == NutrientKind.PROTEIN) NavIcons.bolt else NavIcons.cup, amount, clock(entry.at, zone),
                                trailing = {
                                    Text(
                                        "Remove",
                                        Modifier.clip(RoundedCornerShape(8.dp)).tappable({ onRemoveNutrient(kind, entry.at) }, "Remove $amount").padding(Space.s),
                                        style = Type.label,
                                        color = Palette.Accent,
                                    )
                                },
                                divider = i > 0,
                            )
                        }
                    }
                }
            } else {
                item(key = "tags") {
                    Column(Modifier.padding(horizontal = Space.l), verticalArrangement = Arrangement.spacedBy(Space.m)) {
                        Text(if (data.isToday) "Tags for today" else "Tags for ${formatDate(data.date)}", style = Type.body, color = Palette.Text)
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Tag.entries.forEach { tag ->
                                val on = day != null && tag in day.tags
                                Row(
                                    Modifier.clip(RoundedCornerShape(14.dp)).background(if (on) Palette.Accent else Palette.Chip)
                                        .tappable({ journal.toggle(data.date, tag) }, tag.label)
                                        .padding(horizontal = 12.dp, vertical = 8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Icon(tagIcon.getValue(tag), null, Modifier.size(16.dp), tint = if (on) Palette.OnAccent else Palette.Text)
                                    Text(tag.label, Modifier.padding(start = 6.dp), style = Type.label, color = if (on) Palette.OnAccent else Palette.Text)
                                }
                            }
                        }
                        Text("Tag a day to find patterns on Trends after 10 days", style = Type.small, color = Palette.Muted)
                    }
                }
            }
        }
        AnimatedVisibility(
            canUndo,
            Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 96.dp),
            enter = fadeIn() + slideInVertically { it / 2 },
            exit = fadeOut() + slideOutVertically { it / 2 },
        ) {
            StripCard(null, null) {
                Text("Added $lastMl ml", Modifier.weight(1f), style = Type.body, color = Palette.Text)
                Text(
                    "Undo",
                    Modifier.clip(RoundedCornerShape(8.dp)).tappable({ canUndo = false; entries = entries.drop(1); onUndoWater() }, "Undo water").padding(Space.s),
                    style = Type.label,
                    color = Palette.Accent,
                )
            }
        }
    }
    picking?.let { isBed ->
        TimeDialog(if (isBed) "WENT TO BED" else "WOKE UP", if (isBed) bed else wake, prefs.clock24, onDismiss = { picking = null }) { t ->
            if (isBed) bed = t else wake = t
            picking = null
        }
    }
    if (custom) {
        val protein = kind == NutrientKind.PROTEIN
        var ml by remember { mutableStateOf("") }
        val amount = ml.toIntOrNull()?.takeIf { it > 0 }
        AlertDialog(
            onDismissRequest = { custom = false },
            containerColor = LocalTheme.current.bgMid,
            title = { Text(if (protein) "PROTEIN" else "WATER", style = Type.label, color = Palette.Muted) },
            text = { NumberField(ml, if (protein) "g" else "ml", Modifier.fillMaxWidth(), digits = if (protein) 3 else 4) { ml = it } },
            confirmButton = {
                TextButton(
                    onClick = {
                        if (prefs.haptics) haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        if (protein) onAddNutrient(NutrientKind.PROTEIN, amount!!.toDouble()) else add(amount!!)
                        custom = false
                    },
                    enabled = amount != null,
                ) { Text("ADD", style = Type.label, color = if (amount != null) Palette.Accent else Palette.Faint) }
            },
            dismissButton = { TextButton(onClick = { custom = false }) { Text("CANCEL", style = Type.label, color = Palette.Muted) } },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TimeDialog(title: String, current: LocalTime, clock24: Boolean, onDismiss: () -> Unit, onSave: (LocalTime) -> Unit) {
    val state = rememberTimePickerState(current.hour, current.minute, clock24)
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = LocalTheme.current.bgMid,
        title = { Text(title, style = Type.label, color = Palette.Muted) },
        text = { TimePicker(state) },
        confirmButton = { TextButton(onClick = { onSave(LocalTime.of(state.hour, state.minute)) }) { Text("OK", style = Type.label, color = Palette.Accent) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("CANCEL", style = Type.label, color = Palette.Muted) } },
    )
}
