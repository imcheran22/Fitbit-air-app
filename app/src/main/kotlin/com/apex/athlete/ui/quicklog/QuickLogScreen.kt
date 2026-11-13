package com.apex.athlete.ui.quicklog

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.components.ApexButton
import com.apex.athlete.core.ui.components.ApexButtonStyle
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.ApexTextField
import com.apex.athlete.core.ui.components.ChoiceOption
import com.apex.athlete.core.ui.components.ChoiceRow
import com.apex.athlete.core.ui.components.ProvenanceLabel
import com.apex.athlete.core.ui.shell.ApexSheet
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.state.MetricStateView
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.core.ui.theme.ThemePreference
import com.apex.athlete.ui.common.LocalFormatter
import com.apex.athlete.ui.common.apexViewModel

/** The quick log as a bottom sheet, for Overview or Journal: `if (show) QuickLogSheet(onDismiss = { show = false })`. */
@Composable
fun QuickLogSheet(onDismiss: () -> Unit) {
    ApexSheet(onDismiss = onDismiss, title = stringResource(R.string.quicklog_title)) {
        QuickLogPanel(Modifier.heightIn(max = SHEET_BODY_MAX).verticalScroll(rememberScrollState()))
        ApexButton(
            text = stringResource(R.string.quicklog_close),
            onClick = onDismiss,
            style = ApexButtonStyle.Secondary,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/** The quick log as a full screen, for a More entry. */
@Composable
fun QuickLogRoute(onBack: () -> Unit) {
    ExtrasScreenFrame(stringResource(R.string.quicklog_title), onBack) { QuickLogPanel(Modifier) }
}

private val SHEET_BODY_MAX = 560.dp

@Composable
private fun QuickLogPanel(modifier: Modifier) {
    val formatter = LocalFormatter.current
    val vm = apexViewModel(key = "quicklog") { container, handle ->
        QuickLogViewModel(container.localExtras, container.repository.today(), handle)
    }
    val draft by vm.draft.collectAsStateWithLifecycle()
    val entries by vm.entries.collectAsStateWithLifecycle()
    val water by vm.water.collectAsStateWithLifecycle()
    val outcome by vm.outcome.collectAsStateWithLifecycle()
    val plan = remember(draft) { QuickLogForm.plan(draft) }
    QuickLogContent(
        draft = draft,
        plan = plan,
        entries = entries,
        water = water,
        outcome = outcome,
        timeText = { formatter.clockTime(it) },
        onWater = vm::setWater,
        onMood = vm::toggleMood,
        onSymptom = vm::toggleSymptom,
        onNote = vm::setNote,
        onSave = vm::save,
        onDelete = vm::delete,
        modifier = modifier,
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun QuickLogContent(
    draft: QuickLogDraft,
    plan: QuickLogPlan,
    entries: List<QuickLogEntryUi>?,
    water: MetricState,
    outcome: WriteOutcome,
    timeText: (Long) -> String,
    onWater: (String) -> Unit,
    onMood: (Int) -> Unit,
    onSymptom: (String, Boolean) -> Unit,
    onNote: (String) -> Unit,
    onSave: () -> Unit,
    onDelete: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = ApexTheme.colors
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(ApexSpacing.cardGap)) {
        Text(stringResource(R.string.quicklog_intro), style = ApexTheme.type.body, color = colors.foregroundSecondary)

        // Water
        SectionHeading(stringResource(R.string.quicklog_water_title))
        ChoiceRow(
            options = QuickLogForm.WATER_PRESETS_ML.map {
                ChoiceOption(it.toString(), stringResource(R.string.quicklog_water_preset, it), stringResource(R.string.quicklog_water_preset_cd, it))
            },
            selectedKey = plan.actions.filterIsInstance<QuickLogAction.Water>().firstOrNull()?.ml?.toString(),
            onSelect = onWater,
            groupDescription = stringResource(R.string.quicklog_water_presets_cd),
        )
        ApexTextField(
            value = draft.water,
            onValueChange = onWater,
            label = stringResource(R.string.quicklog_water_label),
            placeholder = stringResource(R.string.quicklog_water_hint),
            errorText = if (plan.waterInvalid) stringResource(R.string.quicklog_water_error) else null,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        )
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
            Text(stringResource(R.string.quicklog_water_today).uppercase(), style = ApexTheme.type.statLabel, color = colors.mutedForeground)
            MetricStateView(water, label = stringResource(R.string.quicklog_water_today)) { v ->
                Text("${v.numberText()} ${v.unit.orEmpty()}".trim(), style = ApexTheme.type.statValue, color = colors.foreground)
            }
            if (water is MetricState.Value) ProvenanceLabel(water.provenance)
        }

        // Mood
        SectionHeading(stringResource(R.string.quicklog_mood_title))
        ChoiceRow(
            options = (QuickLogForm.MOOD_MIN..QuickLogForm.MOOD_MAX).map {
                ChoiceOption(it.toString(), it.toString(), stringResource(R.string.quicklog_mood_option_cd, it))
            },
            selectedKey = draft.mood?.toString(),
            onSelect = { onMood(it.toInt()) },
            groupDescription = stringResource(R.string.quicklog_mood_group_cd),
        )
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(stringResource(R.string.quicklog_mood_low), style = ApexTheme.type.caption, color = colors.mutedForeground, modifier = Modifier.weight(1f))
            Text(
                stringResource(R.string.quicklog_mood_high), style = ApexTheme.type.caption, color = colors.mutedForeground,
                textAlign = TextAlign.End, modifier = Modifier.weight(1f),
            )
        }

        // Symptoms
        SectionHeading(stringResource(R.string.quicklog_symptoms_title))
        val groupCd = stringResource(R.string.quicklog_symptoms_group_cd)
        FlowRow(
            Modifier.fillMaxWidth().semantics { contentDescription = groupCd },
            horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm),
            verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm),
        ) {
            Symptom.entries.forEach { s ->
                val label = stringResource(s.label)
                ToggleChip(label, s.key in draft.symptoms, label, onToggle = { onSymptom(s.key, it) })
            }
        }

        // Note
        SectionHeading(stringResource(R.string.quicklog_note_title))
        ApexTextField(
            value = draft.note,
            onValueChange = onNote,
            label = stringResource(R.string.quicklog_note_label),
            placeholder = stringResource(R.string.quicklog_note_hint),
            supportingText = stringResource(R.string.quicklog_note_counter, draft.note.length, QuickLogForm.MAX_NOTE_CHARS),
            singleLine = false,
        )

        ApexButton(
            text = stringResource(if (outcome == WriteOutcome.SAVING) R.string.quicklog_saving else R.string.quicklog_save),
            onClick = onSave,
            enabled = plan.canSave && outcome != WriteOutcome.SAVING,
            modifier = Modifier.fillMaxWidth(),
        )
        if (plan.actions.isEmpty() && outcome == WriteOutcome.IDLE) {
            Text(stringResource(R.string.quicklog_nothing_to_save), style = ApexTheme.type.caption, color = colors.mutedForeground)
        }
        OutcomeLine(outcome)
        ProvenanceLabel(DataProvenance.USER_REPORTED)

        // Today's entries
        SectionHeading(stringResource(R.string.quicklog_today_title))
        when {
            entries == null -> Unit
            entries.isEmpty() -> Text(stringResource(R.string.quicklog_today_empty), style = ApexTheme.type.body, color = colors.mutedForeground)
            else -> ApexCard(Modifier.fillMaxWidth()) {
                Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                    entries.forEach { EntryRow(it, timeText, onDelete) }
                }
            }
        }
    }
}

@Composable
private fun EntryRow(entry: QuickLogEntryUi, timeText: (Long) -> String, onDelete: (String) -> Unit) {
    val colors = ApexTheme.colors
    val line = when (entry) {
        is QuickLogEntryUi.Water -> stringResource(R.string.quicklog_entry_water, entry.ml)
        is QuickLogEntryUi.Mood -> stringResource(R.string.quicklog_entry_mood, entry.value)
        is QuickLogEntryUi.SymptomLine -> stringResource(
            R.string.quicklog_entry_symptom,
            entry.symptom?.let { stringResource(it.label) } ?: entry.rawLabel,
        )
        is QuickLogEntryUi.Note -> stringResource(R.string.quicklog_entry_note, entry.text)
    }
    val time = timeText(entry.epochMillis)
    val spoken = stringResource(R.string.quicklog_entry_cd, line, time)
    val deleteCd = stringResource(R.string.quicklog_entry_delete_cd, line)
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
        Column(Modifier.weight(1f).semantics(mergeDescendants = true) { contentDescription = spoken }) {
            Text(line, style = ApexTheme.type.body, color = colors.foreground)
            Text(time, style = ApexTheme.type.caption, color = colors.mutedForeground)
        }
        ApexButton(
            text = stringResource(R.string.quicklog_entry_delete),
            onClick = { onDelete(entry.id) },
            style = ApexButtonStyle.Destructive,
            modifier = Modifier.semantics { contentDescription = deleteCd },
        )
    }
}

private fun previewDraft() = QuickLogDraft("250", 4, setOf("headache"), "Slept badly")

@Composable
private fun PreviewBody(theme: ThemePreference) = ApexTheme(theme) {
    Box(Modifier.background(ApexTheme.colors.background)) {
        val draft = previewDraft()
        QuickLogContent(
            draft = draft,
            plan = QuickLogForm.plan(draft),
            entries = listOf(
                QuickLogEntryUi.Water("1", 1_000L, 500),
                QuickLogEntryUi.Mood("2", 2_000L, 4),
                QuickLogEntryUi.Note("3", 3_000L, "Felt good after the run"),
            ),
            water = MetricState.Value(500.0, 0, "ml", DataProvenance.USER_REPORTED),
            outcome = WriteOutcome.DEMO,
            timeText = { "08:15" },
            onWater = {}, onMood = {}, onSymptom = { _, _ -> }, onNote = {}, onSave = {}, onDelete = {},
            modifier = Modifier.verticalScroll(rememberScrollState()),
        )
    }
}

@Preview(name = "QuickLog dark", heightDp = 1000)
@Composable
private fun QuickLogPreviewDark() = PreviewBody(ThemePreference.DARK)

@Preview(name = "QuickLog light", heightDp = 1000)
@Composable
private fun QuickLogPreviewLight() = PreviewBody(ThemePreference.LIGHT)
