package app.fitdash.ui.pages

import android.Manifest
import android.content.Intent
import android.os.Build
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.appwidget.updateAll
import androidx.health.connect.client.HealthConnectClient
import app.fitdash.BuildConfig
import app.fitdash.health.HealthSnapshot
import app.fitdash.health.SourceStatus
import app.fitdash.metrics.Gender
import app.fitdash.metrics.TodayData
import app.fitdash.metrics.genderLabel
import app.fitdash.metrics.maxHrForAge
import app.fitdash.settings.JournalStore
import app.fitdash.settings.SettingsStore
import app.fitdash.settings.ThemeChoice
import app.fitdash.ui.GITHUB_REPO_URL
import app.fitdash.ui.components.ListRow
import app.fitdash.ui.components.NavIcons
import app.fitdash.ui.components.RowGroup
import app.fitdash.ui.components.SectionCard
import app.fitdash.ui.components.SegmentedControl
import app.fitdash.health.PhoneSteps
import app.fitdash.ui.components.ToggleRow
import app.fitdash.ui.formatHeight
import app.fitdash.ui.formatLiters
import app.fitdash.ui.formatSteps
import app.fitdash.ui.formatTime
import app.fitdash.ui.issueUrl
import app.fitdash.ui.share.exportDaily
import app.fitdash.ui.share.exportRaw
import app.fitdash.ui.theme.LocalTheme
import app.fitdash.ui.theme.Palette
import app.fitdash.ui.theme.Space
import app.fitdash.ui.theme.Type
import app.fitdash.ui.today.BackgroundAccess
import app.fitdash.widget.FitdashWidget
import kotlinx.coroutines.launch
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.Locale
import kotlin.coroutines.cancellation.CancellationException
import kotlin.math.roundToInt

private const val GITHUB_URL = GITHUB_REPO_URL
private const val WHY =
    "Google Fit and Health Connect hold your data but show it plainly. fitdash is a calm, private dashboard on top of them: no account, no cloud, no internet access."

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsSheet(
    store: SettingsStore,
    data: TodayData,
    snapshot: HealthSnapshot?,
    sources: List<SourceStatus>,
    heightMeters: Double?,
    onSetHeight: (Int) -> Unit,
    onPhoneOnly: (Boolean) -> Unit,
    canAskHistory: Boolean = false,
    onAskHistory: () -> Unit = {},
    background: BackgroundAccess = BackgroundAccess.UNSUPPORTED,
    onAskBackground: () -> Unit = {},
    onDismiss: () -> Unit,
) {
    val settings by store.flow.collectAsState()
    val askNotifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
    val uri = LocalUriHandler.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var exporting by remember { mutableStateOf<String?>(null) }
    var showInfo by remember { mutableStateOf(false) }
    var showHeight by remember { mutableStateOf(false) }
    var showName by remember { mutableStateOf(false) }
    var showBedtime by remember { mutableStateOf(false) }
    val heightCm = heightMeters?.let { (it * 100).roundToInt() } ?: settings.heightCm
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = LocalTheme.current.bgMid,
    ) {
        LazyColumn(contentPadding = PaddingValues(bottom = Space.xxl), verticalArrangement = Arrangement.spacedBy(Space.l)) {
            item {
                SectionCard("Goals") {
                    Stepper(
                        "Daily steps", formatSteps(settings.stepGoal.toLong()), settings.stepGoal > 2000, settings.stepGoal < 30000,
                        { store.update { it.copy(stepGoal = it.stepGoal - 500) } }, { store.update { it.copy(stepGoal = it.stepGoal + 500) } },
                    )
                    Stepper(
                        "Sleep", String.format(Locale.ENGLISH, "%.1f h", settings.sleepHours), settings.sleepHours > 5.0, settings.sleepHours < 10.0,
                        { store.update { it.copy(sleepHours = it.sleepHours - 0.5) } }, { store.update { it.copy(sleepHours = it.sleepHours + 0.5) } },
                    )
                    Stepper(
                        "Water", "${formatLiters(settings.waterGoalMl / 1000.0)} L", settings.waterGoalMl > 1000, settings.waterGoalMl < 5000,
                        { store.update { it.copy(waterGoalMl = it.waterGoalMl - 250) } }, { store.update { it.copy(waterGoalMl = it.waterGoalMl + 250) } },
                    )
                    Stepper(
                        "Active minutes", "${settings.activeGoal} min", settings.activeGoal > 10, settings.activeGoal < 120,
                        { store.update { it.copy(activeGoal = it.activeGoal - 5) } }, { store.update { it.copy(activeGoal = it.activeGoal + 5) } },
                    )
                    if (BuildConfig.FLAVOR != "play") Stepper(
                        "Protein", "${settings.proteinGoalG} g", settings.proteinGoalG > 50, settings.proteinGoalG < 250,
                        { store.update { it.copy(proteinGoalG = it.proteinGoalG - 10) } }, { store.update { it.copy(proteinGoalG = it.proteinGoalG + 10) } },
                    )
                }
            }
            item {
                RowGroup {
                    ListRow(NavIcons.walk, "Height", heightCm?.let { formatHeight(it, settings.miles) } ?: "Not set", onClick = { showHeight = true })
                    ListRow(NavIcons.moonSmall, "Bedtime", settings.bedtimeTarget?.let { formatTime(it, settings.clock24) } ?: "From your last 14 nights", onClick = { showBedtime = true }, divider = true)
                    ListRow(NavIcons.info, "Name", settings.name ?: "Not set", onClick = { showName = true }, divider = true)
                }
            }
            item {
                // Age sets maximum heart rate for workout zones; unset, the zones card asks for it.
                val year = java.time.Year.now().value
                val age = settings.birthYear?.let { year - it }
                SectionCard("Heart-rate zones", Modifier.padding(top = Space.s), trailing = age?.let { "max ≈ ${maxHrForAge(it)} bpm" }) {
                    Stepper(
                        "Age", age?.toString() ?: "Not set", age != null && age > 13, age == null || age < 90,
                        { store.update { s -> s.copy(birthYear = s.birthYear?.plus(1)) } },
                        { store.update { s -> s.copy(birthYear = s.birthYear?.minus(1) ?: (year - 30)) } },
                    )
                    GenderRow(settings.gender) { g -> store.update { s -> s.copy(gender = g) } }
                }
            }
            item { Label("UNITS") }
            item { SegmentedControl(listOf("km", "miles"), if (settings.miles) 1 else 0, { i -> store.update { it.copy(miles = i == 1) } }) }
            item { SegmentedControl(listOf("kg", "lb"), if (settings.weightLb) 1 else 0, { i -> store.update { it.copy(weightLb = i == 1) } }) }
            item { SegmentedControl(listOf("°C", "°F"), if (settings.fahrenheit) 1 else 0, { i -> store.update { it.copy(fahrenheit = i == 1) } }) }
            item { SegmentedControl(listOf("12-hour", "24-hour"), if (settings.clock24) 1 else 0, { i -> store.update { it.copy(clock24 = i == 1) } }) }
            item { Label("SHOW ON TODAY") }
            item { ToggleRow("Show sleep score", settings.showSleepScore, { v -> store.update { it.copy(showSleepScore = v) } }, "Off shows hours and regularity instead of a score") }
            item { ToggleRow("Workouts", settings.showWorkouts, { v -> store.update { it.copy(showWorkouts = v) } }) }
            item { ToggleRow("Heart rate", settings.showHeartRate, { v -> store.update { it.copy(showHeartRate = v) } }) }
            item { ToggleRow("Suggestions", settings.showSuggestions, { v -> store.update { it.copy(showSuggestions = v) } }, "Do this today") }
            item { ToggleRow("Body and fitness on Trends", settings.showBody, { v -> store.update { it.copy(showBody = v) } }, "BMI, body composition, fitness age and calories") }
            item { Label("REMINDERS") }
            item {
                ToggleRow("Water", settings.waterReminders, { v ->
                    store.update { it.copy(waterReminders = v) }
                    if (v && Build.VERSION.SDK_INT >= 33) askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
                }, "When you fall behind your goal, with a +250 ml button")
            }
            if (background != BackgroundAccess.UNSUPPORTED) {
                item {
                    ToggleRow("Move", settings.moveNudge && background == BackgroundAccess.GRANTED, { v ->
                        store.update { it.copy(moveNudge = v) }
                        if (v && Build.VERSION.SDK_INT >= 33) askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
                        if (v && background != BackgroundAccess.GRANTED) onAskBackground()
                    }, "After an hour under 250 steps, in your waking hours")
                }
                item {
                    ToggleRow("Morning check", settings.morningAlert && background == BackgroundAccess.GRANTED, { v ->
                        store.update { it.copy(morningAlert = v) }
                        if (v && Build.VERSION.SDK_INT >= 33) askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
                        if (v && background != BackgroundAccess.GRANTED) onAskBackground()
                    }, "When overnight vitals leave your usual range")
                }
            }
            item { Label("FEEL") }
            item { SegmentedControl(listOf("System", "Light", "Dark"), settings.theme.ordinal, { i ->
                store.update { it.copy(theme = ThemeChoice.entries[i]) }
                scope.launch { FitdashWidget().updateAll(context.applicationContext) }
            }) }
            item { ToggleRow("Haptics", settings.haptics, { v -> store.update { it.copy(haptics = v) } }, "A light tick on taps") }
            item { ToggleRow("Reduce motion", settings.reduceMotion, { v -> store.update { it.copy(reduceMotion = v) } }, "No draw-in or count-up animations, still orb") }
            item { Label("DATA") }
            item {
                ToggleRow(
                    "Phone only mode", settings.phoneOnly, onPhoneOnly,
                    if (PhoneSteps.hasSensor(context)) "No watch or ring: the phone counts steps and you enter sleep by hand" else "This phone has no step counter, so steps are not counted",
                )
            }
            item {
                RowGroup {
                    ListRow(NavIcons.info, "Data sources", null, onClick = { showInfo = true })
                    if (canAskHistory) ListRow(NavIcons.trends, "Read older data", "Up to 6 months of history instead of 30 days", onClick = { onAskHistory() }, divider = true)
                    val exports = snapshot?.let { s ->
                        listOf(
                            listOf("Export daily table", "CSV, ${data.daysBack + 1} days", "text/csv") to suspend { exportDaily(context, s, data.goals, JournalStore.get(context).flow.value, ZonedDateTime.now()) },
                            listOf("Export raw data", "Heart rate, sleep stages, workouts, journal", "application/zip") to suspend { exportRaw(context, s, JournalStore.get(context).flow.value, ZoneId.systemDefault()) },
                        )
                    }.orEmpty()
                    for ((text, export) in exports) {
                        val (title, subtitle, type) = text
                        ListRow(
                            NavIcons.trends, title, subtitle,
                            onClick = {
                                if (exporting == null) scope.launch {
                                    exporting = title
                                    try {
                                        val uri = export()
                                        context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType(type).putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION), title))
                                    } catch (e: CancellationException) {
                                        throw e
                                    } catch (e: Exception) {
                                        Toast.makeText(context, "Couldn't export the data", Toast.LENGTH_SHORT).show()
                                    } finally {
                                        exporting = null
                                    }
                                }
                            },
                            trailing = if (exporting == title) ({ CircularProgressIndicator(Modifier.size(20.dp), color = LocalTheme.current.accent, strokeWidth = 2.dp) }) else null,
                            divider = true,
                        )
                    }
                }
            }
            if (background != BackgroundAccess.UNSUPPORTED) {
                item {
                    // Turning it on asks Health Connect for background access; without it the worker only redraws the widget.
                    ToggleRow(
                        "Background refresh",
                        settings.backgroundRefresh && background == BackgroundAccess.GRANTED,
                        { v ->
                            store.update { it.copy(backgroundRefresh = v) }
                            if (v && background != BackgroundAccess.GRANTED) onAskBackground()
                        },
                        "Reads Health Connect every 2 hours while fitdash is closed, for the widget and a fresh open",
                    )
                }
            }
            item {
                RowGroup {
                    ListRow(NavIcons.heart, "Open Health Connect", null, onClick = {
                        context.startActivity(HealthConnectClient.getHealthConnectManageDataIntent(context).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    })
                }
            }
            if (BuildConfig.SHOW_SUPPORT) {
                item { Label("SUPPORT") }
                item { RowGroup { ListRow(NavIcons.cup, "Buy me a coffee", null, onClick = { uri.openUri(SUPPORT_URL) }) } }
            }
            item { Label("FEEDBACK") }
            item {
                RowGroup {
                    ListRow(NavIcons.info, "Report a problem", "Opens a GitHub issue with your device and version filled in", onClick = {
                        uri.openUri(issueUrl(true, BuildConfig.VERSION_NAME, "${Build.MANUFACTURER} ${Build.MODEL}", Build.VERSION.RELEASE))
                    })
                    ListRow(NavIcons.sparkle, "Request a feature", "Tell us what fitdash should do next", onClick = {
                        uri.openUri(issueUrl(false, BuildConfig.VERSION_NAME, "${Build.MANUFACTURER} ${Build.MODEL}", Build.VERSION.RELEASE))
                    }, divider = true)
                }
            }
            item { Label("ABOUT") }
            item { Text(WHY, Modifier.padding(horizontal = Space.xl), style = Type.body, color = Palette.Muted) }
            item {
                RowGroup {
                    ListRow(NavIcons.sparkle, "Open source · GPL-3.0", null, onClick = { uri.openUri(GITHUB_URL) })
                    ListRow(NavIcons.today, "View on GitHub", null, onClick = { uri.openUri(GITHUB_URL) }, divider = true)
                    ListRow(NavIcons.clock, "Version ${BuildConfig.VERSION_NAME}", null, divider = true)
                }
            }
        }
    }
    if (showInfo) InfoSheet(sources, onDismiss = { showInfo = false })
    if (showName) {
        NameDialog(settings.name, onDismiss = { showName = false }) { name ->
            store.update { it.copy(name = name) }
            showName = false
        }
    }
    if (showBedtime) {
        BedtimeDialog(settings.bedtimeTarget, settings.clock24, onDismiss = { showBedtime = false }) { time ->
            store.update { it.copy(bedtimeTarget = time) }
            showBedtime = false
        }
    }
    if (showHeight) {
        HeightDialog(heightCm, settings.miles, onDismiss = { showHeight = false }) { cm ->
            store.update { it.copy(heightCm = cm) }
            onSetHeight(cm)
            showHeight = false
        }
    }
}

@Composable
private fun HeightDialog(current: Int?, miles: Boolean, onDismiss: () -> Unit, onSave: (Int) -> Unit) {
    val inches = current?.let { (it / 2.54).roundToInt() }
    var cm by remember { mutableStateOf(current?.toString().orEmpty()) }
    var ft by remember { mutableStateOf(inches?.let { (it / 12).toString() }.orEmpty()) }
    var inch by remember { mutableStateOf(inches?.let { (it % 12).toString() }.orEmpty()) }
    val value = if (miles) {
        ft.toIntOrNull()?.let { f -> ((f * 12 + (inch.toIntOrNull() ?: 0)) * 2.54).roundToInt() }
    } else cm.toIntOrNull()
    val valid = value != null && value in 50..250
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = LocalTheme.current.bgMid,
        title = { Text("HEIGHT", style = Type.label, color = Palette.Muted) },
        text = {
            Row(horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                if (miles) {
                    NumberField(ft, "ft", Modifier.weight(1f)) { ft = it }
                    NumberField(inch, "in", Modifier.weight(1f)) { inch = it }
                } else {
                    NumberField(cm, "cm", Modifier.fillMaxWidth()) { cm = it }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onSave(value!!) }, enabled = valid) { Text("SAVE", style = Type.label, color = if (valid) Palette.Accent else Palette.Faint) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("CANCEL", style = Type.label, color = Palette.Muted) } },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BedtimeDialog(current: LocalTime?, clock24: Boolean, onDismiss: () -> Unit, onSave: (LocalTime?) -> Unit) {
    val state = rememberTimePickerState(current?.hour ?: 23, current?.minute ?: 0, clock24)
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = LocalTheme.current.bgMid,
        title = { Text("BEDTIME", style = Type.label, color = Palette.Muted) },
        text = { TimePicker(state) },
        confirmButton = {
            TextButton(onClick = { onSave(LocalTime.of(state.hour, state.minute)) }) { Text("SAVE", style = Type.label, color = Palette.Accent) }
        },
        dismissButton = {
            TextButton(onClick = { onSave(null) }) { Text("USE MY NIGHTS", style = Type.label, color = Palette.Muted) }
        },
    )
}

@Composable
private fun NameDialog(current: String?, onDismiss: () -> Unit, onSave: (String?) -> Unit) {
    var name by remember { mutableStateOf(current.orEmpty()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = LocalTheme.current.bgMid,
        title = { Text("NAME", style = Type.label, color = Palette.Muted) },
        text = { NameField(name, { name = it }, Modifier.fillMaxWidth()) },
        confirmButton = {
            TextButton(onClick = { onSave(name.trim().ifEmpty { null }) }) { Text("SAVE", style = Type.label, color = Palette.Accent) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("CANCEL", style = Type.label, color = Palette.Muted) } },
    )
}

@Composable
internal fun fieldColours() = OutlinedTextFieldDefaults.colors(
    focusedTextColor = Palette.Text,
    unfocusedTextColor = Palette.Text,
    focusedBorderColor = Palette.Accent,
    unfocusedBorderColor = Palette.Divider,
    cursorColor = Palette.Accent,
)

@Composable
internal fun NumberField(value: String, unit: String, modifier: Modifier, digits: Int = 3, onChange: (String) -> Unit) {
    OutlinedTextField(
        value,
        { onChange(it.filter(Char::isDigit).take(digits)) },
        modifier,
        suffix = { Text(unit.uppercase(), style = Type.tiny, color = Palette.Muted) },
        textStyle = Type.body,
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        colors = fieldColours(),
    )
}

@Composable
internal fun NameField(value: String, onChange: (String) -> Unit, modifier: Modifier, onDone: (() -> Unit)? = null) {
    OutlinedTextField(
        value,
        { onChange(it.take(24)) },
        modifier,
        textStyle = Type.body,
        singleLine = true,
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
        keyboardActions = if (onDone != null) KeyboardActions(onDone = { onDone() }) else KeyboardActions.Default,
        colors = fieldColours(),
    )
}

@Composable
private fun Label(text: String) {
    Text(text, Modifier.padding(start = Space.xl, end = Space.xl, top = Space.s), style = Type.label, color = Palette.Muted)
}

@Composable
private fun GenderRow(selected: Gender?, onSelect: (Gender?) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxWidth().padding(top = Space.s)) {
        Row(
            Modifier.fillMaxWidth().clickable(role = Role.Button) { open = true }.padding(vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Gender", Modifier.weight(1f), style = Type.body.copy(fontSize = 13.5.sp, fontWeight = FontWeight.Medium), color = Palette.Text)
            Text(genderLabel(selected), style = Type.body.copy(fontSize = 13.5.sp), color = Palette.Muted)
            Icon(NavIcons.chevronDown, null, Modifier.padding(start = Space.s).size(14.dp), tint = Palette.Faint)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }, containerColor = LocalTheme.current.bgMid) {
            (listOf<Gender?>(null) + Gender.entries).forEach { g ->
                DropdownMenuItem(
                    text = { Text(genderLabel(g), style = Type.body, color = Palette.Text) },
                    trailingIcon = { if (g == selected) Icon(NavIcons.check, null, Modifier.size(16.dp), tint = Palette.Accent) },
                    onClick = { open = false; onSelect(g) },
                )
            }
        }
    }
    Text(
        "Used by fitness age and resting calories. The studies behind them grouped people by sex at birth; pick whichever matches your physiology.",
        style = Type.tiny, color = Palette.Faint, modifier = Modifier.padding(top = Space.xs),
    )
}

@Composable
private fun Stepper(label: String, value: String, canDec: Boolean, canInc: Boolean, onDec: () -> Unit, onInc: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = Space.xs), verticalAlignment = Alignment.CenterVertically) {
        Text(label.uppercase(), Modifier.weight(1f), style = Type.label, color = Palette.Muted)
        StepButton("−", canDec, onDec)
        Text(value, Modifier.padding(horizontal = Space.m), style = Type.body.copy(fontWeight = FontWeight.Medium), color = Palette.Text)
        StepButton("+", canInc, onInc)
    }
}

@Composable
private fun StepButton(text: String, enabled: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .size(48.dp)
            .alpha(if (enabled) 1f else 0.35f)
            .clip(CircleShape)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.size(38.dp).clip(CircleShape).background(Palette.Chip), contentAlignment = Alignment.Center) {
            Text(text, style = Type.value, color = Palette.Text)
        }
    }
}
