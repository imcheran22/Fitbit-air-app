package com.apex.athlete.ui.bloodpressure

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.analytics.bp.BloodPressure
import com.apex.athlete.core.analytics.bp.BloodPressureAverage
import com.apex.athlete.core.analytics.bp.BloodPressureReading
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.components.ApexButton
import com.apex.athlete.core.ui.components.ApexButtonStyle
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.ApexTextField
import com.apex.athlete.core.ui.components.ProvenanceLabel
import com.apex.athlete.core.ui.components.SkeletonLineFill
import com.apex.athlete.core.ui.components.Tag
import com.apex.athlete.core.ui.components.provenanceLabelRes
import com.apex.athlete.core.ui.state.MetricReason
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
import java.time.Instant
import java.time.ZoneId

@Composable
fun BloodPressureRoute(onBack: () -> Unit) {
    val vm = apexViewModel { container, handle -> BloodPressureViewModel(container.localExtras, handle) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    val draft by vm.draft.collectAsStateWithLifecycle()
    val showErrors by vm.showErrors.collectAsStateWithLifecycle()
    val outcome by vm.outcome.collectAsStateWithLifecycle()
    val formatter = LocalFormatter.current
    BloodPressureContent(
        ui = ui,
        draft = draft,
        errors = if (showErrors) BpEntry.parse(draft).errors else emptySet(),
        outcome = outcome,
        whenText = { millis ->
            val date = Instant.ofEpochMilli(millis).atZone(ZoneId.systemDefault()).toLocalDate()
            "${formatter.dayLabel(date)}, ${formatter.clockTime(millis)}"
        },
        onBack = onBack,
        onSystolic = vm::setSystolic,
        onDiastolic = vm::setDiastolic,
        onPulse = vm::setPulse,
        onSave = vm::save,
        onDelete = vm::delete,
    )
}

@Composable
internal fun BloodPressureContent(
    ui: BpUi?,
    draft: BpDraft,
    errors: Set<BpField>,
    outcome: WriteOutcome,
    whenText: (Long) -> String,
    onBack: () -> Unit,
    onSystolic: (String) -> Unit,
    onDiastolic: (String) -> Unit,
    onPulse: (String) -> Unit,
    onSave: () -> Unit,
    onDelete: (String) -> Unit,
) {
    val colors = ApexTheme.colors
    ExtrasScreenFrame(stringResource(R.string.bp_title), onBack) {
        Text(stringResource(R.string.bp_not_diagnosis), style = ApexTheme.type.caption, color = colors.foregroundSecondary)

        ApexCard(Modifier.fillMaxWidth()) {
            Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                SectionHeading(stringResource(R.string.bp_entry_title))
                val number = KeyboardOptions(keyboardType = KeyboardType.Number)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                    ApexTextField(
                        draft.systolic, onSystolic, stringResource(R.string.bp_systolic), Modifier.weight(1f),
                        errorText = if (BpField.SYSTOLIC in errors) stringResource(R.string.bp_error_systolic) else null,
                        keyboardOptions = number,
                    )
                    ApexTextField(
                        draft.diastolic, onDiastolic, stringResource(R.string.bp_diastolic), Modifier.weight(1f),
                        errorText = if (BpField.DIASTOLIC in errors) stringResource(R.string.bp_error_diastolic) else null,
                        keyboardOptions = number,
                    )
                }
                if (BpField.ORDER in errors) {
                    Text(stringResource(R.string.bp_error_order), style = ApexTheme.type.caption, color = colors.recoveryRedText)
                }
                ApexTextField(
                    draft.pulse, onPulse, stringResource(R.string.bp_pulse),
                    placeholder = stringResource(R.string.bp_pulse_optional),
                    errorText = if (BpField.PULSE in errors) stringResource(R.string.bp_error_pulse) else null,
                    keyboardOptions = number,
                )
                ApexButton(
                    stringResource(if (outcome == WriteOutcome.SAVING) R.string.bp_saving else R.string.bp_save),
                    onSave,
                    Modifier.fillMaxWidth(),
                    enabled = outcome != WriteOutcome.SAVING,
                )
                OutcomeLine(outcome)
                ProvenanceLabel(DataProvenance.USER_REPORTED)
            }
        }

        if (ui == null) {
            val cd = stringResource(R.string.bp_loading_cd)
            Column(Modifier.semantics { contentDescription = cd }, verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                repeat(3) { SkeletonLineFill(height = ApexSpacing.minTouch) }
            }
        } else {
            AverageCard(ui.average, ui.windowReadingCount)
            ApexCard(Modifier.fillMaxWidth()) {
                Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                    SectionHeading(stringResource(R.string.bp_history_title))
                    if (ui.rows.isEmpty()) {
                        Text(stringResource(R.string.bp_history_empty), style = ApexTheme.type.body, color = colors.mutedForeground)
                    }
                    ui.rows.forEach { ReadingRow(it, whenText, onDelete) }
                    if (ui.rows.isNotEmpty()) {
                        Text(stringResource(R.string.bp_single_note), style = ApexTheme.type.caption, color = colors.mutedForeground)
                    }
                }
            }
        }
    }
}

private fun roundHalfUp(x: Double): Double = Math.floor(x + 0.5)

@Composable
private fun AverageCard(avg: BloodPressureAverage, count: Int) {
    val colors = ApexTheme.colors
    val unit = stringResource(R.string.bp_average_unit)
    val ms = avg.meanSystolic
    val md = avg.meanDiastolic
    val category = avg.category
    val have = ms != null && md != null && category != null
    val sysState: MetricState = if (have) MetricState.Value(roundHalfUp(ms!!), 0, unit, DataProvenance.MATHEMATICALLY_DERIVED) else MetricState.Unavailable(MetricReason.NO_DATA)
    val diaState: MetricState = if (have) MetricState.Value(roundHalfUp(md!!), 0, unit, DataProvenance.MATHEMATICALLY_DERIVED) else MetricState.Unavailable(MetricReason.NO_DATA)
    val categoryText = category?.let { stringResource(BpForm.categoryRes(it)) }
    val spoken = if (have) {
        stringResource(R.string.bp_average_value_cd, roundHalfUp(ms!!).toInt().toString(), roundHalfUp(md!!).toInt(), categoryText.orEmpty())
    } else {
        stringResource(R.string.bp_average_need, count)
    }
    ApexCard(Modifier.fillMaxWidth(), spokenDescription = spoken) {
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
            SectionHeading(stringResource(R.string.bp_average_title))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(ApexSpacing.lg)) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
                    Text(stringResource(R.string.bp_average_systolic).uppercase(), style = ApexTheme.type.statLabel, color = colors.mutedForeground)
                    MetricStateView(sysState) { v -> Text("${v.numberText()} ${v.unit.orEmpty()}".trim(), style = ApexTheme.type.statValue, color = colors.foreground) }
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
                    Text(stringResource(R.string.bp_average_diastolic).uppercase(), style = ApexTheme.type.statLabel, color = colors.mutedForeground)
                    MetricStateView(diaState) { v -> Text("${v.numberText()} ${v.unit.orEmpty()}".trim(), style = ApexTheme.type.statValue, color = colors.foreground) }
                }
            }
            if (have && categoryText != null) {
                Tag(categoryText, tone = BpForm.tone(category))
                ProvenanceLabel(DataProvenance.MATHEMATICALLY_DERIVED)
                Text(stringResource(R.string.bp_average_count, avg.validReadings), style = ApexTheme.type.caption, color = colors.mutedForeground)
            } else {
                Text(stringResource(R.string.bp_average_need, count), style = ApexTheme.type.body, color = colors.mutedForeground)
            }
        }
    }
}

@Composable
private fun ReadingRow(row: BpRowUi, whenText: (Long) -> String, onDelete: (String) -> Unit) {
    val colors = ApexTheme.colors
    val whenLabel = whenText(row.epochMillis)
    val category = row.evaluation.category
    val categoryText = category?.let { stringResource(BpForm.categoryRes(it)) }
    val categoryLine = categoryText?.let { stringResource(R.string.bp_single_category, it) }
        ?: stringResource(BpForm.missingRes(row.evaluation.missingReason) ?: R.string.bp_row_no_category)
    val value = stringResource(R.string.bp_row_value, row.systolic, row.diastolic)
    val pulseSpoken = row.pulse?.let { stringResource(R.string.bp_row_pulse_cd, it) } ?: stringResource(R.string.bp_row_no_pulse_cd)
    val source = stringResource(provenanceLabelRes(row.provenance))
    val spoken = "$whenLabel. " + stringResource(R.string.bp_row_cd, row.systolic, row.diastolic, categoryLine, pulseSpoken, source)
    val deleteCd = stringResource(R.string.bp_delete_cd, whenLabel)
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
        Column(Modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = spoken }, verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
            Text(whenLabel, style = ApexTheme.type.caption, color = colors.mutedForeground)
            Text(value, style = ApexTheme.type.statValue, color = colors.foreground)
            row.pulse?.let { Text(stringResource(R.string.bp_row_pulse, it), style = ApexTheme.type.caption, color = colors.foregroundSecondary) }
            Row(horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                Tag(stringResource(R.string.bp_single_tag))
                if (categoryText != null) Tag(categoryText, tone = BpForm.tone(category))
            }
            if (categoryText == null) Text(categoryLine, style = ApexTheme.type.caption, color = colors.mutedForeground)
            ProvenanceLabel(row.provenance)
        }
        ApexButton(
            stringResource(R.string.bp_delete), { onDelete(row.id) },
            Modifier.semantics { contentDescription = deleteCd }, ApexButtonStyle.Destructive,
        )
        Box(Modifier.fillMaxWidth().height(1.dp).background(colors.border))
    }
}

private fun previewUi(): BpUi {
    fun row(id: String, s: Int, d: Int, p: Int?, prov: DataProvenance = DataProvenance.USER_REPORTED) =
        BpRowUi(id, 1_000L * s, s, d, p, prov, BloodPressure.evaluate(BloodPressureReading(s, d)))
    val rows = listOf(row("1", 128, 82, 64), row("2", 118, 76, null), row("3", 142, 91, 70, DataProvenance.IMPORTED_HEALTH_CONNECT))
    return BpUi(rows, BloodPressure.average(rows.map { BloodPressureReading(it.systolic, it.diastolic) }), rows.size)
}

@Composable
private fun PreviewBody(theme: ThemePreference) = ApexTheme(theme) {
    Box(Modifier.background(ApexTheme.colors.background)) {
        BloodPressureContent(previewUi(), BpDraft("120", "", ""), setOf(BpField.DIASTOLIC), WriteOutcome.IDLE, { "Today, 08:10" }, {}, {}, {}, {}, {}, {})
    }
}

@Preview(name = "BP dark", heightDp = 1400)
@Composable
private fun BpPreviewDark() = PreviewBody(ThemePreference.DARK)

@Preview(name = "BP light", heightDp = 1400)
@Composable
private fun BpPreviewLight() = PreviewBody(ThemePreference.LIGHT)
