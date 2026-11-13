package com.apex.athlete.ui.food

import androidx.annotation.StringRes
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.analytics.nutrition.NutrientTotal
import com.apex.athlete.core.database.entity.FoodSource
import com.apex.athlete.core.database.entity.MealKind
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.components.ApexButton
import com.apex.athlete.core.ui.components.ApexButtonStyle
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.ApexTextField
import com.apex.athlete.core.ui.components.ChoiceOption
import com.apex.athlete.core.ui.components.ChoiceRow
import com.apex.athlete.core.ui.components.DatePill
import com.apex.athlete.core.ui.components.ProvenanceLabel
import com.apex.athlete.core.ui.components.SkeletonLineFill
import com.apex.athlete.core.ui.components.provenanceLabelRes
import com.apex.athlete.core.ui.shell.ApexSheet
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.state.MetricStateView
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.core.ui.theme.ThemePreference
import com.apex.athlete.ui.common.LocalFormatter
import com.apex.athlete.ui.common.apexViewModel
import com.apex.athlete.ui.quicklog.ExtrasScreenFrame
import com.apex.athlete.ui.quicklog.OutcomeLine
import com.apex.athlete.ui.quicklog.SectionHeading
import com.apex.athlete.ui.quicklog.WriteOutcome
import java.time.LocalDate

@StringRes
internal fun mealKindRes(kind: MealKind): Int = when (kind) {
    MealKind.BREAKFAST -> R.string.food_meal_breakfast
    MealKind.LUNCH -> R.string.food_meal_lunch
    MealKind.DINNER -> R.string.food_meal_dinner
    MealKind.SNACK -> R.string.food_meal_snack
}

@Composable
fun FoodRoute(onBack: () -> Unit) {
    val vm = apexViewModel { container, handle -> FoodViewModel(container.localExtras, container.repository, handle) }
    val day by vm.day.collectAsStateWithLifecycle()
    val state by vm.state.collectAsStateWithLifecycle()
    val editor by vm.editor.collectAsStateWithLifecycle()
    val outcome by vm.outcome.collectAsStateWithLifecycle()
    val formatter = LocalFormatter.current
    val date = LocalDate.ofEpochDay(day)
    FoodContent(
        dayLabel = formatter.dayLabel(date),
        canGoNext = day < vm.todayDay(),
        state = state,
        editor = editor,
        outcome = outcome,
        timeText = { formatter.clockTime(it) },
        onBack = onBack,
        onPrevious = { vm.setDay(day - 1) },
        onNext = { vm.setDay(day + 1) },
        onToday = { vm.setDay(vm.todayDay()) },
        onAdd = vm::startAdd,
        onEdit = vm::startEdit,
        onDelete = vm::delete,
        onDraft = vm::updateDraft,
        onSave = vm::save,
        onCloseEditor = vm::closeEditor,
    )
}

@Composable
internal fun FoodContent(
    dayLabel: String,
    canGoNext: Boolean,
    state: FoodDayUi?,
    editor: FoodEditor?,
    outcome: WriteOutcome,
    timeText: (Long) -> String,
    onBack: () -> Unit,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onToday: () -> Unit,
    onAdd: () -> Unit,
    onEdit: (MealUi) -> Unit,
    onDelete: (String) -> Unit,
    onDraft: ((FoodDraft) -> FoodDraft) -> Unit,
    onSave: () -> Unit,
    onCloseEditor: () -> Unit,
) {
    val colors = ApexTheme.colors
    ExtrasScreenFrame(stringResource(R.string.food_title), onBack) {
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            DatePill(
                label = dayLabel,
                onPrevious = onPrevious,
                onNext = onNext,
                onLabelClick = onToday,
                canGoNext = canGoNext,
                previousDescription = stringResource(R.string.food_prev_day),
                nextDescription = stringResource(R.string.food_next_day),
                labelClickDescription = stringResource(R.string.food_go_today),
            )
        }
        ApexButton(stringResource(R.string.food_add_meal), onAdd, Modifier.fillMaxWidth())
        OutcomeLine(if (editor == null) outcome else WriteOutcome.IDLE)

        if (state == null) {
            val cd = stringResource(R.string.food_loading_cd)
            Column(Modifier.semantics { contentDescription = cd }, verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                repeat(3) { SkeletonLineFill(height = ApexSpacing.minTouch) }
            }
        } else {
            ApexCard(Modifier.fillMaxWidth()) {
                Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                    SectionHeading(stringResource(R.string.food_meals_title))
                    if (state.meals.isEmpty()) {
                        Text(stringResource(R.string.food_meals_empty), style = ApexTheme.type.body, color = colors.mutedForeground)
                    }
                    state.meals.forEach { MealRow(it, timeText, onEdit, onDelete) }
                }
            }
            TotalsCard(state)
            MacroCard(state)
            BalanceCard(state)
        }
    }
    if (editor != null) {
        FoodEditorSheet(editor, outcome, onDraft, onSave, onCloseEditor)
    }
}

@Composable
private fun MealRow(meal: MealUi, timeText: (Long) -> String, onEdit: (MealUi) -> Unit, onDelete: (String) -> Unit) {
    val colors = ApexTheme.colors
    val formatter = LocalFormatter.current
    val missing = stringResource(R.string.food_not_logged)
    fun n(v: Double?) = if (v == null) missing else formatter.number(v, 0)
    val kindText = stringResource(mealKindRes(meal.mealKind))
    val nutrients = stringResource(R.string.food_meal_nutrients, n(meal.kcal), n(meal.proteinG), n(meal.carbsG), n(meal.fatG))
    val time = timeText(meal.epochMillis)
    val source = stringResource(provenanceLabelRes(meal.provenance))
    val spoken = stringResource(R.string.food_meal_cd, meal.name, kindText, time, nutrients, source)
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
        Column(Modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = spoken }) {
            Text(meal.name, style = ApexTheme.type.bodyStrong, color = colors.foreground)
            Text(stringResource(R.string.food_meal_summary, kindText, time), style = ApexTheme.type.caption, color = colors.mutedForeground)
            Text(nutrients, style = ApexTheme.type.caption, color = colors.foregroundSecondary)
            ProvenanceLabel(meal.provenance)
        }
        val editCd = stringResource(R.string.food_edit_cd, meal.name)
        val deleteCd = stringResource(R.string.food_delete_cd, meal.name)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
            ApexButton(
                stringResource(R.string.food_edit), { onEdit(meal) },
                Modifier.weight(1f).semantics { contentDescription = editCd }, ApexButtonStyle.Secondary,
            )
            ApexButton(
                stringResource(R.string.food_delete), { onDelete(meal.id) },
                Modifier.weight(1f).semantics { contentDescription = deleteCd }, ApexButtonStyle.Destructive,
            )
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(colors.border))
    }
}

@Composable
private fun TotalsCard(state: FoodDayUi) {
    val colors = ApexTheme.colors
    val kcal = stringResource(R.string.food_unit_kcal)
    val g = stringResource(R.string.food_unit_g)
    val t = state.totals
    val rows: List<Triple<Int, NutrientTotal, String>> = listOf(
        Triple(R.string.food_total_calories, t.kcal, kcal),
        Triple(R.string.food_total_protein, t.proteinG, g),
        Triple(R.string.food_total_carbs, t.carbsG, g),
        Triple(R.string.food_total_fat, t.fatG, g),
        Triple(R.string.food_total_fibre, t.fibreG, g),
    )
    ApexCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
            SectionHeading(stringResource(R.string.food_totals_title))
            rows.forEach { (label, total, unit) ->
                val name = stringResource(label)
                val metric = totalState(total, unit, state.totalsProvenance)
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(ApexSpacing.xxs)) {
                    Text(name.uppercase(), style = ApexTheme.type.statLabel, color = colors.mutedForeground)
                    MetricStateView(metric, label = name) { v ->
                        Text("${v.numberText()} ${v.unit.orEmpty()}".trim(), style = ApexTheme.type.statValue, color = colors.foreground)
                    }
                    if (metric is MetricState.Value) {
                        ProvenanceLabel(metric.provenance)
                        if (total.incomplete) {
                            Text(stringResource(R.string.food_total_incomplete), style = ApexTheme.type.caption, color = colors.mutedForeground)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MacroCard(state: FoodDayUi) {
    val colors = ApexTheme.colors
    ApexCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
            SectionHeading(stringResource(R.string.food_macros_title))
            val split = state.macros.split
            if (split == null) {
                Text(
                    stringResource(macroReasonRes(state.macros.missingReason) ?: R.string.food_macros_no_entries),
                    style = ApexTheme.type.body,
                    color = colors.mutedForeground,
                )
            } else {
                val (p, c, f) = macroPercents(split.proteinShare, split.carbsShare, split.fatShare)
                val cd = stringResource(R.string.food_macro_bar_cd, p, c, f)
                MacroBar(
                    split.proteinShare.toFloat(), split.carbsShare.toFloat(), split.fatShare.toFloat(),
                    colors.chart1, colors.chart2, colors.chart3,
                    Modifier.fillMaxWidth().height(14.dp).semantics { contentDescription = cd },
                )
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                    Legend(stringResource(R.string.food_macro_legend, stringResource(R.string.food_total_protein), p), colors.chart1, Modifier.weight(1f))
                    Legend(stringResource(R.string.food_macro_legend, stringResource(R.string.food_total_carbs), c), colors.chart2, Modifier.weight(1f))
                    Legend(stringResource(R.string.food_macro_legend, stringResource(R.string.food_total_fat), f), colors.chart3, Modifier.weight(1f))
                }
                ProvenanceLabel(DataProvenance.MATHEMATICALLY_DERIVED)
            }
            Text(stringResource(R.string.food_macros_note), style = ApexTheme.type.caption, color = colors.mutedForeground)
        }
    }
}

@Composable
private fun Legend(text: String, swatch: Color, modifier: Modifier) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(ApexSpacing.xs), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.height(10.dp).width(10.dp).background(swatch))
        Text(text, style = ApexTheme.type.caption, color = ApexTheme.colors.foregroundSecondary)
    }
}

private fun Modifier.width(10.dp): Modifier = this.then(Modifier.androidxWidth())

/** Three shares (0 to 1, summing to 1) as one bar. Gaps never occur: the shares fill the width. */
@Composable
private fun MacroBar(p: Float, c: Float, f: Float, c1: Color, c2: Color, c3: Color, modifier: Modifier) {
    Canvas(modifier) {
        val w = size.width
        val h = size.height
        val pw = w * p
        val cw = w * c
        drawRect(c1, Offset.Zero, Size(pw, h))
        drawRect(c2, Offset(pw, 0f), Size(cw, h))
        drawRect(c3, Offset(pw + cw, 0f), Size(w - pw - cw, h))
    }
}

@Composable
private fun BalanceCard(state: FoodDayUi) {
    val colors = ApexTheme.colors
    val formatter = LocalFormatter.current
    ApexCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
            SectionHeading(stringResource(R.string.food_balance_title))
            val balance = state.balance
            val value = balance.balanceKcal
            if (value == null) {
                Text(stringResource(R.string.food_balance_not_enough), style = ApexTheme.type.bodyStrong, color = colors.foreground)
                Text(
                    stringResource(balanceReasonRes(balance.missingReason) ?: R.string.food_balance_no_entries),
                    style = ApexTheme.type.body,
                    color = colors.mutedForeground,
                )
            } else {
                val metric = balanceState(balance)
                val label = stringResource(R.string.food_balance_value_label)
                val direction = stringResource(if (value >= 0) R.string.food_balance_surplus else R.string.food_balance_deficit)
                val spokenValue = "${formatter.number(value, 0)} ${stringResource(R.string.food_unit_kcal)}, $direction"
                val spoken = stringResource(R.string.food_balance_cd, spokenValue)
                Column(Modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = spoken }, verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
                    Text(label.uppercase(), style = ApexTheme.type.statLabel, color = colors.mutedForeground)
                    MetricStateView(metric, label = label) { v ->
                        Text("${v.numberText()} ${v.unit.orEmpty()}".trim(), style = ApexTheme.type.statValue, color = colors.foreground)
                    }
                    Text(direction, style = ApexTheme.type.caption, color = colors.foregroundSecondary)
                    ProvenanceLabel(DataProvenance.MATHEMATICALLY_DERIVED)
                }
            }
            // Both halves of the balance, each with its own source.
            val eaten = state.totals.kcal.total
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(ApexSpacing.lg)) {
                BalanceHalf(
                    stringResource(R.string.food_balance_intake),
                    eaten?.let { MetricState.Value(it, 0, stringResource(R.string.food_unit_kcal), state.totalsProvenance) }
                        ?: MetricState.Unavailable(),
                    Modifier.weight(1f),
                )
                BalanceHalf(
                    stringResource(R.string.food_balance_burned),
                    state.burned.kcal?.let {
                        MetricState.Value(it, 0, stringResource(R.string.food_unit_kcal), state.burned.provenance, isProvisional = state.burned.provisional)
                    } ?: MetricState.Unavailable(),
                    Modifier.weight(1f),
                )
            }
            Text(stringResource(R.string.food_balance_note), style = ApexTheme.type.caption, color = colors.mutedForeground)
        }
    }
}

@Composable
private fun BalanceHalf(label: String, metric: MetricState, modifier: Modifier) {
    val colors = ApexTheme.colors
    Column(modifier, verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
        Text(label.uppercase(), style = ApexTheme.type.statLabel, color = colors.mutedForeground)
        MetricStateView(metric, label = label) { v ->
            Text("${v.numberText()} ${v.unit.orEmpty()}".trim(), style = ApexTheme.type.statValue, color = colors.foreground)
        }
        if (metric is MetricState.Value) ProvenanceLabel(metric.provenance)
    }
}

@Composable
private fun FoodEditorSheet(
    editor: FoodEditor,
    outcome: WriteOutcome,
    onDraft: ((FoodDraft) -> FoodDraft) -> Unit,
    onSave: () -> Unit,
    onClose: () -> Unit,
) {
    val parse = FoodForm.parse(editor.draft)
    val errors = if (editor.showErrors) parse.errors else emptySet()
    val d = editor.draft
    val numberError = stringResource(R.string.food_error_number, FoodForm.MAX_GRAMS.toInt())
    val kcalError = stringResource(R.string.food_error_number, FoodForm.MAX_KCAL.toInt())
    ApexSheet(
        onDismiss = onClose,
        title = stringResource(if (editor.editingId == null) R.string.food_editor_add_title else R.string.food_editor_edit_title),
    ) {
        Column(
            Modifier.fillMaxWidth().heightIn(max = 560.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(ApexSpacing.md),
        ) {
            ChoiceRow(
                options = MealKind.entries.map { ChoiceOption(it.storageKey, stringResource(mealKindRes(it))) },
                selectedKey = d.mealKind.storageKey,
                onSelect = { key -> MealKind.entries.firstOrNull { it.storageKey == key }?.let { k -> onDraft { it.copy(mealKind = k) } } },
                groupDescription = stringResource(R.string.food_meal_kind_group_cd),
            )
            ApexTextField(
                d.name, { v -> onDraft { it.copy(name = v.take(FoodForm.MAX_NAME_CHARS)) } },
                stringResource(R.string.food_field_name),
                placeholder = stringResource(R.string.food_field_name_hint),
                errorText = if (FoodField.NAME in errors) stringResource(R.string.food_error_name) else null,
            )
            NumberField(d.kcal, { v -> onDraft { it.copy(kcal = v) } }, R.string.food_field_kcal, FoodField.KCAL in errors, kcalError)
            NumberField(d.protein, { v -> onDraft { it.copy(protein = v) } }, R.string.food_field_protein, FoodField.PROTEIN in errors, numberError)
            NumberField(d.carbs, { v -> onDraft { it.copy(carbs = v) } }, R.string.food_field_carbs, FoodField.CARBS in errors, numberError)
            NumberField(d.fat, { v -> onDraft { it.copy(fat = v) } }, R.string.food_field_fat, FoodField.FAT in errors, numberError)
            NumberField(d.fibre, { v -> onDraft { it.copy(fibre = v) } }, R.string.food_field_fibre, FoodField.FIBRE in errors, numberError)
            Text(stringResource(R.string.food_field_optional), style = ApexTheme.type.caption, color = ApexTheme.colors.mutedForeground)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                ApexButton(stringResource(R.string.food_cancel), onClose, Modifier.weight(1f), ApexButtonStyle.Secondary)
                ApexButton(
                    stringResource(if (outcome == WriteOutcome.SAVING) R.string.food_saving else R.string.food_save),
                    onSave, Modifier.weight(1f), enabled = outcome != WriteOutcome.SAVING,
                )
            }
            OutcomeLine(outcome)
        }
    }
}

@Composable
private fun NumberField(value: String, onChange: (String) -> Unit, @StringRes label: Int, error: Boolean, errorText: String) {
    ApexTextField(
        value, onChange, stringResource(label),
        errorText = if (error) errorText else null,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
    )
}

private fun previewState(): FoodDayUi {
    val e = com.apex.athlete.core.database.entity.FoodLogEntity(
        "1", 1_000L, MealKind.BREAKFAST, "Oatmeal", 350.0, 12.0, 60.0, 6.0, 8.0, FoodSource.MANUAL, DataProvenance.USER_REPORTED,
    )
    val e2 = e.copy(id = "2", name = "Chicken salad", mealKind = MealKind.LUNCH, kcal = 520.0, proteinG = 40.0, carbsG = 20.0, fatG = 28.0, fibreG = null)
    return FoodDayUi.of(1L, listOf(e, e2), EnergyBurned(2_300.0, DataProvenance.IMPORTED_HEALTH_CONNECT, false))
}

@Composable
private fun PreviewBody(theme: ThemePreference) = ApexTheme(theme) {
    Box(Modifier.background(ApexTheme.colors.background)) {
        FoodContent(
            "Today", false, previewState(), null, WriteOutcome.IDLE, { "08:10" },
            {}, {}, {}, {}, {}, {}, {}, {}, {}, {},
        )
    }
}

@Preview(name = "Food dark", heightDp = 1400)
@Composable
private fun FoodPreviewDark() = PreviewBody(ThemePreference.DARK)

@Preview(name = "Food light", heightDp = 1400)
@Composable
private fun FoodPreviewLight() = PreviewBody(ThemePreference.LIGHT)
