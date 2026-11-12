package com.apex.athlete.ui.workout

import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.ui.components.ApexButton
import com.apex.athlete.core.ui.components.ApexButtonStyle
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.ApexTextField
import com.apex.athlete.core.ui.components.apexClickable
import com.apex.athlete.core.ui.components.hideFromTalkBack
import com.apex.athlete.core.ui.components.minTouchTarget
import com.apex.athlete.core.ui.components.spoken
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.shell.ApexSheet
import com.apex.athlete.core.ui.shell.DetailShell
import com.apex.athlete.core.ui.theme.ApexShapes
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.core.ui.theme.ThemePreference
import com.apex.athlete.navigation.ApexNavigator
import com.apex.athlete.ui.common.ApexFormatter
import com.apex.athlete.ui.common.LocalFormatter
import com.apex.athlete.ui.common.apexViewModel
import java.time.LocalDate
import java.time.ZoneId

@Composable
fun AddWorkoutRoute(navigator: ApexNavigator, day: LocalDate) {
    val vm = apexViewModel { container, handle -> AddWorkoutViewModel(container.repository, handle) }
    val saveState by vm.saveState.collectAsStateWithLifecycle()
    LaunchedEffect(saveState) {
        if (saveState == SaveState.Saved) navigator.back()
    }
    AddWorkoutScreen(
        day = day,
        saveState = saveState,
        onBack = { navigator.back() },
        onSave = vm::save,
    )
}

@Composable
internal fun AddWorkoutScreen(
    day: LocalDate,
    saveState: SaveState,
    onBack: () -> Unit,
    onSave: (ValidWorkout) -> Unit,
    zone: ZoneId = ZoneId.systemDefault(),
) {
    val formatter = LocalFormatter.current
    val nowMillis = formatter.now()

    // Form state survives process death; saved as primitives only.
    var name by rememberSaveable { mutableStateOf("") }
    var type by rememberSaveable { mutableStateOf(DEFAULT_TYPE) }
    var startMinute by rememberSaveable(day) { mutableStateOf(defaultStartMinute(day, zone, nowMillis)) }
    var durationText by rememberSaveable { mutableStateOf("") }
    var rpe by rememberSaveable { mutableStateOf(0) } // 0 = not chosen yet
    var attempted by rememberSaveable { mutableStateOf(false) }
    var pickingType by rememberSaveable { mutableStateOf(false) }

    val typeLabel = typeDisplayName(type)
    val input = WorkoutFormInput(name, type, startMinute, durationText, rpe.takeIf { it in MIN_RPE..MAX_RPE })
    val validation = validateWorkout(input, day, zone, nowMillis, fallbackName = typeLabel)
    val errors = (validation as? WorkoutValidation.Invalid)?.errors.orEmpty()
    val saving = saveState == SaveState.Saving

    DetailShell(
        title = stringResource(R.string.workout_add_title),
        onBack = onBack,
        backDescription = stringResource(R.string.common_back),
        hero = {
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                Text(
                    formatter.dayLabel(day),
                    style = ApexTheme.type.sectionTitle,
                    color = ApexTheme.colors.foreground,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    stringResource(R.string.workout_add_intro),
                    style = ApexTheme.type.body,
                    color = ApexTheme.colors.foregroundBody,
                )
            }
        },
        primary = {
            ApexCard {
                Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.xl)) {
                    ApexTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = stringResource(R.string.workout_field_name),
                        supportingText = stringResource(R.string.workout_field_name_hint),
                        errorText = errorText(attempted, errors, WorkoutFormError.NAME_TOO_LONG),
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                    )
                    TypeField(typeLabel, onClick = { pickingType = true })
                    StartTimeField(startMinute, { startMinute = it }, formatter, day, errorText(attempted, errors, WorkoutFormError.START_IN_FUTURE))
                    ApexTextField(
                        value = durationText,
                        onValueChange = { durationText = it.filter(Char::isDigit).take(4) },
                        label = stringResource(R.string.workout_field_duration),
                        supportingText = stringResource(R.string.workout_field_duration_hint),
                        errorText = errorText(attempted, errors, WorkoutFormError.DURATION_NOT_A_NUMBER, WorkoutFormError.DURATION_OUT_OF_RANGE),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
                    )
                    RpeField(rpe, { rpe = it }, errorText(attempted, errors, WorkoutFormError.RPE_MISSING))
                }
            }
            ApexButton(
                text = stringResource(if (saving) R.string.workout_add_saving else R.string.workout_add_save),
                onClick = {
                    attempted = true
                    if (validation is WorkoutValidation.Valid) onSave(validation.workout)
                },
                enabled = !saving,
                modifier = Modifier.fillMaxWidth(),
            )
            if (saveState == SaveState.Failed) {
                Text(
                    stringResource(R.string.workout_add_save_failed),
                    style = ApexTheme.type.caption,
                    color = ApexTheme.colors.recoveryRedText,
                )
            }
            Text(
                stringResource(R.string.workout_add_provenance),
                style = ApexTheme.type.caption,
                color = ApexTheme.colors.mutedForeground,
            )
        },
    )

    if (pickingType) {
        ApexSheet(onDismiss = { pickingType = false }, title = stringResource(R.string.workout_field_type_sheet_title)) {
            Column(
                Modifier
                    .heightIn(max = 420.dp)
                    .verticalScroll(rememberScrollState())
                    .selectableGroup(),
            ) {
                SUPPORTED_TYPES.forEach { option ->
                    val label = typeDisplayName(option)
                    val selected = option == type
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .minTouchTarget()
                            .selectable(
                                selected = selected,
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                                role = Role.RadioButton,
                                onClick = {
                                    type = option
                                    pickingType = false
                                },
                            )
                            .padding(vertical = ApexSpacing.sm),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(ApexSpacing.md),
                    ) {
                        Text(
                            label,
                            style = ApexTheme.type.bodyStrong,
                            color = ApexTheme.colors.foreground,
                            modifier = Modifier.weight(1f),
                        )
                        if (selected) {
                            Icon(ApexIcons.Check, contentDescription = null, tint = ApexTheme.colors.foreground, modifier = Modifier.size(20.dp))
                        }
                    }
                }
            }
        }
    }
}

/** Error text for the first of [which] present in [errors], shown only after the first save attempt. */
@Composable
private fun errorText(attempted: Boolean, errors: Set<WorkoutFormError>, vararg which: WorkoutFormError): String? {
    if (!attempted) return null
    val hit = which.firstOrNull { it in errors } ?: return null
    return stringResource(errorRes(hit))
}

@Composable
private fun typeDisplayName(type: String): String {
    val res = workoutTypeLabelRes(type)
    return if (res != null) stringResource(res) else humanizeType(type)
}

@Composable
private fun FieldLabel(text: String) {
    Text(text.uppercase(), style = ApexTheme.type.statLabel, color = ApexTheme.colors.foregroundSecondary)
}

@Composable
private fun TypeField(typeLabel: String, onClick: () -> Unit) {
    val colors = ApexTheme.colors
    val description = stringResource(R.string.workout_field_type_open, typeLabel)
    Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
        FieldLabel(stringResource(R.string.workout_field_type))
        Row(
            Modifier
                .fillMaxWidth()
                .minTouchTarget()
                .clip(ApexShapes.row)
                .background(colors.field)
                .apexClickable(onClick = onClick, role = Role.Button)
                .spoken(description)
                .padding(horizontal = ApexSpacing.lg, vertical = ApexSpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(typeLabel, style = ApexTheme.type.bodyStrong, color = colors.foreground, modifier = Modifier.weight(1f))
            Icon(ApexIcons.ChevronDown, contentDescription = null, tint = colors.mutedForeground, modifier = Modifier.size(20.dp))
        }
    }
}

@Composable
private fun StartTimeField(
    minuteOfDay: Int,
    onChange: (Int) -> Unit,
    formatter: ApexFormatter,
    day: LocalDate,
    error: String?,
) {
    val hour = minuteOfDay / 60
    val minute = minuteOfDay % 60
    val shown = stringResource(R.string.workout_field_start_value, formatter.clockTime(minuteOfDay), formatter.dayLabel(day))
    Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
        FieldLabel(stringResource(R.string.workout_field_start))
        Text(shown, style = ApexTheme.type.bodyStrong, color = ApexTheme.colors.foreground)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(ApexSpacing.lg)) {
            Stepper(
                label = stringResource(R.string.workout_start_hour),
                value = "%02d".format(hour),
                earlierDescription = stringResource(R.string.workout_start_hour_minus),
                laterDescription = stringResource(R.string.workout_start_hour_plus),
                onEarlier = { onChange(((hour + 23) % 24) * 60 + minute) },
                onLater = { onChange(((hour + 1) % 24) * 60 + minute) },
                modifier = Modifier.weight(1f),
            )
            Stepper(
                label = stringResource(R.string.workout_start_minute),
                value = "%02d".format(minute),
                earlierDescription = stringResource(R.string.workout_start_minute_minus),
                laterDescription = stringResource(R.string.workout_start_minute_plus),
                onEarlier = { onChange(hour * 60 + (minute + 55) % 60) },
                onLater = { onChange(hour * 60 + (minute + 5) % 60) },
                modifier = Modifier.weight(1f),
            )
        }
        if (error != null) Text(error, style = ApexTheme.type.caption, color = ApexTheme.colors.recoveryRedText)
    }
}

@Composable
private fun Stepper(
    label: String,
    value: String,
    earlierDescription: String,
    laterDescription: String,
    onEarlier: () -> Unit,
    onLater: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = ApexTheme.colors
    Column(modifier, verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
        Text(label, style = ApexTheme.type.caption, color = colors.mutedForeground)
        Row(verticalAlignment = Alignment.CenterVertically) {
            StepButton(ApexIcons.ChevronDown, earlierDescription, onEarlier)
            Text(
                value,
                style = ApexTheme.type.statValue,
                color = colors.foreground,
                textAlign = TextAlign.Center,
                modifier = Modifier.weight(1f).semantics { contentDescription = "$label $value" },
            )
            StepButton(ApexIcons.ChevronUp, laterDescription, onLater)
        }
    }
}

@Composable
private fun StepButton(icon: androidx.compose.ui.graphics.vector.ImageVector, description: String, onClick: () -> Unit) {
    Box(
        Modifier
            .size(ApexSpacing.minTouch)
            .clip(CircleShape)
            .background(ApexTheme.colors.fillHover)
            .apexClickable(onClick = onClick, role = Role.Button)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = ApexTheme.colors.foreground, modifier = Modifier.size(20.dp))
    }
}

@Composable
private fun RpeField(selected: Int, onSelect: (Int) -> Unit, error: String?) {
    val colors = ApexTheme.colors
    Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
        FieldLabel(stringResource(R.string.workout_field_rpe))
        Text(
            stringResource(R.string.workout_field_rpe_help),
            style = ApexTheme.type.caption,
            color = colors.mutedForeground,
        )
        val groupDescription = stringResource(R.string.workout_rpe_group)
        Column(
            Modifier.selectableGroup().semantics { contentDescription = groupDescription },
            verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm),
        ) {
            listOf(1..5, 6..10).forEach { range ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                    range.forEach { value ->
                        val word = stringResource(rpeWordRes(value))
                        val isSelected = value == selected
                        val spoken = stringResource(
                            if (isSelected) R.string.workout_rpe_selected else R.string.workout_rpe_option,
                            value,
                            word,
                        )
                        Box(
                            Modifier
                                .weight(1f)
                                .minTouchTarget()
                                .clip(ApexShapes.row)
                                .background(if (isSelected) colors.primary else colors.field)
                                .selectable(
                                    selected = isSelected,
                                    interactionSource = remember { MutableInteractionSource() },
                                    indication = null,
                                    role = Role.RadioButton,
                                    onClick = { onSelect(value) },
                                )
                                .semantics { contentDescription = spoken },
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                value.toString(),
                                style = ApexTheme.type.statValue,
                                color = if (isSelected) colors.primaryForeground else colors.foreground,
                                modifier = Modifier.hideFromTalkBack(),
                            )
                        }
                    }
                }
            }
        }
        if (selected in MIN_RPE..MAX_RPE) {
            // The anchor word is always visible for the chosen number, so colour is never the only signal.
            Text(
                stringResource(R.string.workout_rpe_option, selected, stringResource(rpeWordRes(selected))),
                style = ApexTheme.type.bodyStrong,
                color = colors.foreground,
            )
        }
        if (error != null) Text(error, style = ApexTheme.type.caption, color = colors.recoveryRedText)
    }
}

// --- Previews -------------------------------------------------------------------------------------

@Composable
private fun PreviewHost(dark: Boolean, content: @Composable () -> Unit) {
    val context = LocalContext.current
    val formatter = remember { ApexFormatter(context) }
    CompositionLocalProvider(LocalFormatter provides formatter) {
        ApexTheme(if (dark) ThemePreference.DARK else ThemePreference.LIGHT) {
            Box(Modifier.background(ApexTheme.colors.background)) { content() }
        }
    }
}

@Preview(name = "Add workout dark", heightDp = 1000)
@Composable
private fun AddWorkoutDark() = PreviewHost(true) {
    AddWorkoutScreen(LocalDate.of(2026, 11, 10), SaveState.Idle, {}, {})
}

@Preview(name = "Add workout light", heightDp = 1000)
@Composable
private fun AddWorkoutLight() = PreviewHost(false) {
    AddWorkoutScreen(LocalDate.of(2026, 11, 10), SaveState.Idle, {}, {})
}
