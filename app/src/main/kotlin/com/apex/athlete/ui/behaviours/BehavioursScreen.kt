package com.apex.athlete.ui.behaviours

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.background
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.database.entity.BehaviourKind
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.components.ApexButton
import com.apex.athlete.core.ui.components.ApexButtonStyle
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.ApexTextField
import com.apex.athlete.core.ui.components.ChipTone
import com.apex.athlete.core.ui.components.ChoiceOption
import com.apex.athlete.core.ui.components.ChoiceRow
import com.apex.athlete.core.ui.components.ProvenanceLabel
import com.apex.athlete.core.ui.components.SkeletonLineFill
import com.apex.athlete.core.ui.components.Tag
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.core.ui.theme.ThemePreference
import com.apex.athlete.ui.common.apexViewModel
import com.apex.athlete.ui.quicklog.ExtrasScreenFrame
import com.apex.athlete.ui.quicklog.OutcomeLine
import com.apex.athlete.ui.quicklog.SectionHeading
import com.apex.athlete.ui.quicklog.WriteOutcome

@Composable
fun BehavioursRoute(onBack: () -> Unit) {
    val vm = apexViewModel { container, handle -> BehavioursViewModel(container.localExtras, handle) }
    val rows by vm.rows.collectAsStateWithLifecycle()
    val name by vm.name.collectAsStateWithLifecycle()
    val kind by vm.kind.collectAsStateWithLifecycle()
    val outcome by vm.outcome.collectAsStateWithLifecycle()
    BehavioursContent(
        rows = rows,
        name = name,
        kind = kind,
        outcome = outcome,
        canAdd = BehaviourForm.nameError(name) == null && outcome != WriteOutcome.SAVING,
        onBack = onBack,
        onName = vm::setName,
        onKind = vm::setKind,
        onAdd = vm::add,
        onHidden = vm::setHidden,
        onDelete = vm::delete,
    )
}

@Composable
internal fun BehavioursContent(
    rows: List<BehaviourRowUi>?,
    name: String,
    kind: BehaviourKind,
    outcome: WriteOutcome,
    canAdd: Boolean,
    onBack: () -> Unit,
    onName: (String) -> Unit,
    onKind: (BehaviourKind) -> Unit,
    onAdd: () -> Unit,
    onHidden: (String, Boolean) -> Unit,
    onDelete: (String) -> Unit,
) {
    val colors = ApexTheme.colors
    var confirming by rememberSaveable { mutableStateOf<String?>(null) }
    ExtrasScreenFrame(stringResource(R.string.behaviours_title), onBack) {
        Text(stringResource(R.string.behaviours_intro), style = ApexTheme.type.body, color = colors.foregroundSecondary)

        ApexCard(Modifier.fillMaxWidth()) {
            Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                SectionHeading(stringResource(R.string.behaviours_list_title))
                if (rows == null) {
                    val cd = stringResource(R.string.behaviours_loading_cd)
                    Column(Modifier.semantics { contentDescription = cd }, verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                        repeat(3) { SkeletonLineFill(height = ApexSpacing.minTouch) }
                    }
                } else {
                    rows.forEach { row ->
                        BehaviourRow(
                            row = row,
                            confirming = confirming == row.id,
                            onHidden = { onHidden(row.id, !row.hidden) },
                            onAskDelete = { confirming = row.id },
                            onCancelDelete = { confirming = null },
                            onConfirmDelete = { confirming = null; onDelete(row.id) },
                        )
                    }
                    Text(stringResource(R.string.behaviours_builtin_note), style = ApexTheme.type.caption, color = colors.mutedForeground)
                }
                ProvenanceLabel(DataProvenance.USER_REPORTED)
            }
        }

        ApexCard(Modifier.fillMaxWidth()) {
            Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                SectionHeading(stringResource(R.string.behaviours_add_title))
                val error = when (BehaviourForm.nameError(name)) {
                    BehaviourNameError.TOO_LONG -> stringResource(R.string.behaviours_name_error_too_long, BehaviourForm.MAX_NAME_CHARS)
                    else -> null // an empty field is not an error until the person tries to add; the button is simply off
                }
                ApexTextField(
                    value = name,
                    onValueChange = onName,
                    label = stringResource(R.string.behaviours_name_label),
                    placeholder = stringResource(R.string.behaviours_name_hint),
                    errorText = error,
                )
                Text(
                    stringResource(R.string.behaviours_kind_label).uppercase(),
                    style = ApexTheme.type.statLabel,
                    color = colors.mutedForeground,
                )
                ChoiceRow(
                    options = listOf(
                        ChoiceOption(BehaviourKind.YES_NO.storageKey, stringResource(R.string.behaviours_kind_yes_no)),
                        ChoiceOption(BehaviourKind.SCALE_0_4.storageKey, stringResource(R.string.behaviours_kind_scale)),
                    ),
                    selectedKey = kind.storageKey,
                    onSelect = { key -> BehaviourKind.fromStorageKeyOrNull(key)?.let(onKind) },
                    groupDescription = stringResource(R.string.behaviours_kind_group_cd),
                )
                ApexButton(
                    text = stringResource(R.string.behaviours_add),
                    onClick = onAdd,
                    enabled = canAdd,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutcomeLine(outcome)
            }
        }
    }
}

@Composable
private fun BehaviourRow(
    row: BehaviourRowUi,
    confirming: Boolean,
    onHidden: () -> Unit,
    onAskDelete: () -> Unit,
    onCancelDelete: () -> Unit,
    onConfirmDelete: () -> Unit,
) {
    val colors = ApexTheme.colors
    val kindText = stringResource(if (row.kind == BehaviourKind.YES_NO) R.string.behaviours_kind_yes_no else R.string.behaviours_kind_scale)
    val originText = stringResource(if (row.builtIn) R.string.behaviours_builtin else R.string.behaviours_custom)
    val hiddenText = stringResource(R.string.behaviours_hidden)
    val spoken = stringResource(if (row.hidden) R.string.behaviours_row_hidden_cd else R.string.behaviours_row_cd, row.name, originText, kindText)
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
        Column(
            Modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = spoken },
            verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs),
        ) {
            Text(
                row.name,
                style = ApexTheme.type.bodyStrong,
                color = if (row.hidden) colors.mutedForeground else colors.foreground,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                Tag(originText)
                Tag(kindText, tone = ChipTone.INFO)
                if (row.hidden) Tag(hiddenText, tone = ChipTone.WARNING)
            }
        }
        if (confirming) {
            Text(
                stringResource(R.string.behaviours_delete_warning, row.name),
                style = ApexTheme.type.caption,
                color = colors.foregroundSecondary,
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                ApexButton(
                    stringResource(R.string.common_cancel), onCancelDelete,
                    Modifier.weight(1f), ApexButtonStyle.Secondary,
                )
                ApexButton(
                    stringResource(R.string.behaviours_delete_confirm), onConfirmDelete,
                    Modifier.weight(1f), ApexButtonStyle.Destructive,
                )
            }
        } else {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                val toggleCd = stringResource(if (row.hidden) R.string.behaviours_show_cd else R.string.behaviours_hide_cd, row.name)
                ApexButton(
                    stringResource(if (row.hidden) R.string.behaviours_show else R.string.behaviours_hide),
                    onHidden,
                    Modifier.weight(1f).semantics { contentDescription = toggleCd },
                    ApexButtonStyle.Secondary,
                )
                if (row.canDelete) {
                    val deleteCd = stringResource(R.string.behaviours_delete_cd, row.name)
                    ApexButton(
                        stringResource(R.string.behaviours_delete), onAskDelete,
                        Modifier.weight(1f).semantics { contentDescription = deleteCd },
                        ApexButtonStyle.Destructive,
                    )
                }
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(colors.border))
    }
}

private fun previewRows() = listOf(
    BehaviourRowUi("journal_alcohol", "Alcohol", BehaviourKind.YES_NO, builtIn = true, hidden = false),
    BehaviourRowUi("journal_travel", "Travel", BehaviourKind.YES_NO, builtIn = true, hidden = true),
    BehaviourRowUi("custom:1", "Sauna", BehaviourKind.SCALE_0_4, builtIn = false, hidden = false),
)

@Composable
private fun PreviewBody(theme: ThemePreference) = ApexTheme(theme) {
    Box(Modifier.background(ApexTheme.colors.background)) {
        BehavioursContent(previewRows(), "Cold plunge", BehaviourKind.YES_NO, WriteOutcome.SAVED, true, {}, {}, {}, {}, { _, _ -> }, {})
    }
}

@Preview(name = "Behaviours dark", heightDp = 900)
@Composable
private fun BehavioursPreviewDark() = PreviewBody(ThemePreference.DARK)

@Preview(name = "Behaviours light", heightDp = 900)
@Composable
private fun BehavioursPreviewLight() = PreviewBody(ThemePreference.LIGHT)
