package com.apex.athlete.ui.goals

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.analytics.goals.GoalMissingReason
import com.apex.athlete.core.database.entity.GoalKind
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.components.ApexButton
import com.apex.athlete.core.ui.components.ApexButtonStyle
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.ApexTextField
import com.apex.athlete.core.ui.components.ChipTone
import com.apex.athlete.core.ui.components.ChoiceOption
import com.apex.athlete.core.ui.components.ChoiceScrollRow
import com.apex.athlete.core.ui.components.ReasonPlaceholder
import com.apex.athlete.core.ui.components.ReasonSize
import com.apex.athlete.core.ui.components.Tag
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.shell.ApexSheet
import com.apex.athlete.core.ui.shell.DetailShell
import com.apex.athlete.core.ui.shell.SectionShell
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.ui.common.ApexFormatter
import com.apex.athlete.ui.common.LocalFormatter
import com.apex.athlete.ui.common.apexViewModel
import com.apex.athlete.ui.detail.BodyText
import com.apex.athlete.ui.detail.Caption
import com.apex.athlete.ui.detail.LoadingCard
import com.apex.athlete.ui.detail.StatBlock
import com.apex.athlete.ui.health.HealthPreviewFrame
import com.apex.athlete.ui.health.HealthThemePreviews

private const val NEW_GOAL = "new"

/** Goals: progress and streaks on the owner's own targets, with an add / edit / delete sheet. */
@Composable
fun GoalsRoute(onBack: () -> Unit) {
    val vm = apexViewModel { container, handle -> GoalsViewModel(container.repository, container.localExtras, handle) }
    val ui by vm.state.collectAsStateWithLifecycle()
    val status by vm.status.collectAsStateWithLifecycle()
    GoalsScreen(
        ui = ui,
        status = status,
        onBack = onBack,
        onCreate = vm::create,
        onEdit = vm::editTarget,
        onPause = vm::pause,
        onDelete = vm::delete,
        onDismissStatus = vm::dismissStatus,
    )
}

@Composable
internal fun GoalsScreen(
    ui: GoalsUi,
    status: GoalSaveStatus,
    onBack: () -> Unit,
    onCreate: (GoalKind, String) -> Unit,
    onEdit: (String, GoalKind, String) -> Unit,
    onPause: (String, Boolean) -> Unit,
    onDelete: (String) -> Unit,
    onDismissStatus: () -> Unit,
) {
    // null = sheet closed, NEW_GOAL = adding, otherwise the id of the goal being edited. Survives process death.
    var editorKey by rememberSaveable { mutableStateOf<String?>(null) }
    val ready = ui as? GoalsUi.Ready
    DetailShell(
        title = stringResource(R.string.goals_title),
        onBack = onBack,
        backDescription = stringResource(R.string.common_back),
        hero = { BodyText(stringResource(R.string.goals_intro)) },
        primary = {
            StatusLine(status, onDismissStatus)
            when {
                ready == null -> LoadingCard()
                ready.rows.isEmpty() -> ApexCard {
                    ReasonPlaceholder(stringResource(R.string.goals_empty_title), ApexIcons.Info, size = ReasonSize.Medium)
                    Caption(stringResource(R.string.goals_empty_body), Modifier.padding(top = ApexSpacing.sm))
                }
                else -> ready.rows.forEach { row -> GoalCard(row, onEdit = { editorKey = row.id }) }
            }
            if (ready != null) {
                if (ready.addable.isEmpty()) {
                    Caption(stringResource(R.string.goals_all_added))
                } else {
                    ApexButton(
                        text = stringResource(R.string.goals_add),
                        onClick = { editorKey = NEW_GOAL },
                        modifier = Modifier.fillMaxWidth(),
                        leadingIcon = ApexIcons.Plus,
                    )
                }
            }
        },
        secondary = {
            SectionShell(stringResource(R.string.goals_how_title)) {
                ApexCard {
                    Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                        BodyText(stringResource(R.string.goals_how_p1))
                        BodyText(stringResource(R.string.goals_how_p2))
                        BodyText(stringResource(R.string.goals_how_p3))
                        BodyText(stringResource(R.string.goals_how_p4))
                    }
                }
            }
        },
    )
    val key = editorKey
    if (key != null && ready != null) {
        val editing = ready.rows.firstOrNull { it.id == key }
        if (key == NEW_GOAL || editing != null) {
            GoalSheet(
                editing = editing,
                addable = ready.addable,
                status = status,
                onDismiss = { editorKey = null },
                onSave = { kind, text ->
                    if (editing == null) onCreate(kind, text) else onEdit(editing.id, kind, text)
                    editorKey = null
                },
                onPause = { id, paused -> onPause(id, paused); editorKey = null },
                onDelete = { id -> onDelete(id); editorKey = null },
            )
        }
    }
}

@Composable
private fun StatusLine(status: GoalSaveStatus, onDismiss: () -> Unit) {
    val text = when (status) {
        GoalSaveStatus.DEMO -> stringResource(R.string.goals_status_demo)
        GoalSaveStatus.ERROR -> stringResource(R.string.goals_status_error)
        else -> return
    }
    ApexCard(onClick = onDismiss) { BodyText(text) }
}

@Composable
private fun GoalCard(row: GoalRowUi, onEdit: () -> Unit) {
    val formatter = LocalFormatter.current
    val label = stringResource(kindLabelRes(row.kind))
    val unit = stringResource(kindUnitRes(row.kind))
    val state = row.state.withUnit(unit)
    ApexCard(onClick = onEdit, onClickLabel = stringResource(R.string.goals_edit_cd, label)) {
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
            StatBlock(label = label, state = state, extras = listOf(stringResource(R.string.goals_target_line, formatter.number(row.target, 0), unit)))
            Caption(stringResource(kindNoteRes(row.kind)))
            Caption(stringResource(R.string.goals_target_line, formatter.number(row.target, 0), unit))
            if (row.paused) {
                Tag(stringResource(R.string.goals_paused_tag))
                Caption(stringResource(R.string.goals_paused_note))
            } else {
                row.barFraction?.let { ProgressBar(it) }
                if (row.achieved) Tag(stringResource(R.string.goals_reached), tone = ChipTone.OPTIMAL)
                row.missing?.let { Caption(stringResource(missingRes(it))) }
                row.currentStreak?.let { c ->
                    Caption(pluralStringResource(R.plurals.goals_streak_current, c, c))
                    row.bestStreak?.let { b -> Caption(pluralStringResource(R.plurals.goals_streak_best, b, b)) }
                }
                row.week?.let { w -> WeekLines(row, w, unit, formatter) }
            }
        }
    }
}

@Composable
private fun WeekLines(row: GoalRowUi, w: WeekUi, unit: String, formatter: ApexFormatter) {
    Caption(stringResource(R.string.goals_week_recorded, w.recordedDays, w.elapsedDays))
    if (w.lowerBound && row.state is MetricState.Value) Caption(stringResource(R.string.goals_week_lower_bound))
    val needed = w.neededPerDay
    if (!row.achieved && needed != null && needed > 0.0) {
        Caption(stringResource(R.string.goals_week_needed, formatter.number(kotlin.math.ceil(needed), 0), unit, w.daysLeft))
    }
}

@Composable
private fun ProgressBar(fraction: Float) {
    val percent = (fraction * 100f).toInt()
    val colors = ApexTheme.colors
    val description = stringResource(R.string.goals_bar_cd, percent)
    Box(
        Modifier
            .fillMaxWidth()
            .height(8.dp)
            .clip(RoundedCornerShape(percent = 50))
            .background(colors.muted)
            .semantics {
                contentDescription = description
                progressBarRangeInfo = ProgressBarRangeInfo(fraction, 0f..1f)
            },
    ) {
        Box(
            Modifier
                .fillMaxWidth(fraction)
                .height(8.dp)
                .clip(RoundedCornerShape(percent = 50))
                .background(colors.primary),
        )
    }
}

@Composable
private fun GoalSheet(
    editing: GoalRowUi?,
    addable: List<GoalKind>,
    status: GoalSaveStatus,
    onDismiss: () -> Unit,
    onSave: (GoalKind, String) -> Unit,
    onPause: (String, Boolean) -> Unit,
    onDelete: (String) -> Unit,
) {
    var kindKey by rememberSaveable { mutableStateOf((editing?.kind ?: addable.firstOrNull())?.storageKey) }
    var text by rememberSaveable { mutableStateOf(editing?.target?.toLong()?.toString().orEmpty()) }
    var confirmDelete by rememberSaveable { mutableStateOf(false) }
    val kind = editing?.kind ?: kindKey?.let(GoalKind::fromStorageKeyOrNull) ?: return
    val parsed = remember(kind, text) { parseTarget(kind, text) }
    val unit = stringResource(kindUnitRes(kind))
    val max = com.apex.athlete.ui.common.LocalFormatter.current.number(maxTarget(kind), 0)
    ApexSheet(
        onDismiss = onDismiss,
        title = stringResource(if (editing == null) R.string.goals_sheet_add_title else R.string.goals_sheet_edit_title),
    ) {
        Column(Modifier.padding(ApexSpacing.gutter), verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
            if (editing == null) {
                ChoiceScrollRow(
                    options = addable.map { ChoiceOption(it.storageKey, stringResource(kindLabelRes(it))) },
                    selectedKey = kind.storageKey,
                    onSelect = { kindKey = it },
                    groupDescription = stringResource(R.string.goals_sheet_kind_group),
                )
            } else {
                BodyText(stringResource(kindLabelRes(kind)))
            }
            Caption(stringResource(kindNoteRes(kind)))
            ApexTextField(
                value = text,
                onValueChange = { text = it.filter(Char::isDigit).take(7) },
                label = stringResource(R.string.goals_target_label, unit),
                supportingText = stringResource(R.string.goals_target_support, max),
                errorText = if (parsed is TargetParse.Invalid) stringResource(R.string.goals_target_error, max) else null,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            )
            ApexButton(
                text = stringResource(R.string.goals_save),
                onClick = { onSave(kind, text) },
                modifier = Modifier.fillMaxWidth(),
                enabled = parsed is TargetParse.Valid && status != GoalSaveStatus.SAVING,
            )
            if (editing != null) {
                ApexButton(
                    text = stringResource(if (editing.paused) R.string.goals_resume else R.string.goals_pause),
                    onClick = { onPause(editing.id, !editing.paused) },
                    modifier = Modifier.fillMaxWidth(),
                    style = ApexButtonStyle.Secondary,
                )
                if (confirmDelete) {
                    BodyText(stringResource(R.string.goals_delete_title))
                    Caption(stringResource(R.string.goals_delete_body))
                    ApexButton(
                        text = stringResource(R.string.goals_delete),
                        onClick = { onDelete(editing.id) },
                        modifier = Modifier.fillMaxWidth(),
                        style = ApexButtonStyle.Destructive,
                    )
                    ApexButton(
                        text = stringResource(R.string.goals_delete_keep),
                        onClick = { confirmDelete = false },
                        modifier = Modifier.fillMaxWidth(),
                        style = ApexButtonStyle.Secondary,
                    )
                } else {
                    ApexButton(
                        text = stringResource(R.string.goals_delete),
                        onClick = { confirmDelete = true },
                        modifier = Modifier.fillMaxWidth(),
                        style = ApexButtonStyle.Destructive,
                    )
                }
            }
        }
    }
}

private fun MetricState.withUnit(unit: String): MetricState = if (this is MetricState.Value) copy(unit = unit) else this

@StringRes
private fun missingRes(reason: GoalMissingReason): Int = when (reason) {
    GoalMissingReason.NOT_RECORDED_TODAY -> R.string.goals_missing_today
    GoalMissingReason.NO_DATA_THIS_WEEK -> R.string.goals_missing_week
    GoalMissingReason.INVALID_TARGET -> R.string.goals_missing_invalid
}

@StringRes
private fun kindNoteRes(kind: GoalKind): Int = when (kind) {
    GoalKind.DAILY_STEPS -> R.string.goals_kind_note_daily_steps
    GoalKind.DAILY_SLEEP_MINUTES -> R.string.goals_kind_note_daily_sleep
    GoalKind.WEEKLY_ACTIVE_MINUTES -> R.string.goals_kind_note_weekly_active
    GoalKind.WEEKLY_AZM -> R.string.goals_kind_note_weekly_azm
    GoalKind.WEEKLY_RECOVERED_DAYS -> R.string.goals_kind_note_weekly_recovered
}

// --- Previews -------------------------------------------------------------------------------------

private val PreviewSource = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API

private fun previewRows(): List<GoalRowUi> = listOf(
    GoalRowUi("1", GoalKind.DAILY_STEPS, 8000.0, false, MetricState.Value(6120.0, 0, null, PreviewSource, isProvisional = true), 0.77f, false, null, 4, 11, null),
    GoalRowUi(
        "2", GoalKind.WEEKLY_AZM, 150.0, false, MetricState.Value(96.0, 0, null, PreviewSource, isProvisional = true), 0.64f, false, null, null, null,
        WeekUi(recordedDays = 3, elapsedDays = 4, lowerBound = true, neededPerDay = 13.5, daysLeft = 4),
    ),
    GoalRowUi("3", GoalKind.DAILY_SLEEP_MINUTES, 450.0, false, MetricState.Unavailable(), null, false, GoalMissingReason.NOT_RECORDED_TODAY, 0, 2, null),
)

@HealthThemePreviews
@Composable
private fun GoalsPreview() = HealthPreviewFrame {
    GoalsScreen(GoalsUi.Ready(previewRows(), listOf(GoalKind.WEEKLY_ACTIVE_MINUTES), false), GoalSaveStatus.IDLE, {}, { _, _ -> }, { _, _, _ -> }, { _, _ -> }, {}, {})
}

@HealthThemePreviews
@Composable
private fun GoalsEmptyPreview() = HealthPreviewFrame {
    GoalsScreen(GoalsUi.Ready(emptyList(), GoalKind.entries, true), GoalSaveStatus.DEMO, {}, { _, _ -> }, { _, _, _ -> }, { _, _ -> }, {}, {})
}

@HealthThemePreviews
@Composable
private fun GoalsLoadingPreview() = HealthPreviewFrame {
    GoalsScreen(GoalsUi.Loading, GoalSaveStatus.IDLE, {}, { _, _ -> }, { _, _, _ -> }, { _, _ -> }, {}, {})
}
