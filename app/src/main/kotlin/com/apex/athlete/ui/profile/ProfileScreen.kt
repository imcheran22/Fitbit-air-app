package com.apex.athlete.ui.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.tooling.preview.Preview
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.analytics.strain.Sex
import com.apex.athlete.core.data.settings.UnitSystem
import com.apex.athlete.core.data.settings.UserProfile
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.components.ApexButton
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.ApexTextField
import com.apex.athlete.core.ui.components.ProvenanceLabel
import com.apex.athlete.core.ui.shell.DetailHeader
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.state.MetricStateView
import com.apex.athlete.core.ui.theme.ApexShapes
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.core.ui.theme.ThemePreference
import com.apex.athlete.navigation.ApexNavigator
import com.apex.athlete.ui.common.LocalFormatter
import com.apex.athlete.ui.common.apexViewModel

@Composable
fun ProfileRoute(navigator: ApexNavigator) {
    val vm = apexViewModel { container, handle -> ProfileViewModel(container.settings, handle) { container.repository.recomputeAll() } }
    val stored by vm.stored.collectAsStateWithLifecycle()
    val input by vm.input.collectAsStateWithLifecycle()
    val status by vm.status.collectAsStateWithLifecycle()
    val year = LocalFormatter.current.today().year
    ProfileContent(
        stored = stored,
        input = input,
        status = status,
        currentYear = year,
        onEdit = vm::edit,
        onSave = { vm.save(year) },
        onBack = navigator::back,
    )
}

@Composable
internal fun ProfileContent(
    stored: StoredProfile?,
    input: ProfileInput?,
    status: ProfileSaveStatus,
    currentYear: Int,
    onEdit: ((ProfileInput) -> ProfileInput) -> Unit,
    onSave: () -> Unit,
    onBack: () -> Unit,
) {
    val colors = ApexTheme.colors
    Column(Modifier.fillMaxSize()) {
        DetailHeader(
            title = stringResource(R.string.profile_title),
            onBack = onBack,
            backDescription = stringResource(R.string.profile_back),
        )
        if (stored == null || input == null) {
            Text(
                stringResource(R.string.profile_loading),
                style = ApexTheme.type.body,
                color = colors.mutedForeground,
                modifier = Modifier.padding(ApexSpacing.gutter),
            )
            return@Column
        }
        val units = stored.units
        val evaluation = remember(stored, input, currentYear) { evaluateProfile(stored.profile, input, units, currentYear) }
        val dirty = evaluation.profile != null && evaluation.profile != stored.profile
        Column(
            Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = ApexSpacing.gutter),
            verticalArrangement = Arrangement.spacedBy(ApexSpacing.cardGap),
        ) {
            ApexCard(Modifier.fillMaxWidth()) {
                Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                    Text(
                        stringResource(R.string.profile_intro_title),
                        style = ApexTheme.type.bodyStrong,
                        color = colors.foreground,
                        modifier = Modifier.semantics { heading() },
                    )
                    Text(stringResource(R.string.profile_intro_body), style = ApexTheme.type.body, color = colors.foregroundSecondary)
                }
            }

            ApexCard(Modifier.fillMaxWidth()) {
                Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.lg)) {
                    Text(
                        stringResource(R.string.profile_section_you),
                        style = ApexTheme.type.bodyStrong,
                        color = colors.foreground,
                        modifier = Modifier.semantics { heading() },
                    )
                    NumberField(
                        value = input.birthYear,
                        onChange = { v -> onEdit { it.copy(birthYear = v) } },
                        label = stringResource(R.string.profile_birth_year),
                        hint = stringResource(R.string.profile_birth_year_hint),
                        error = evaluation.errors[ProfileField.BIRTH_YEAR],
                        decimal = false,
                    )
                    SexSelector(input.sex) { s -> onEdit { it.copy(sex = s) } }
                    NumberField(
                        value = input.height,
                        onChange = { v -> onEdit { it.copy(height = v) } },
                        label = stringResource(if (units == UnitSystem.IMPERIAL) R.string.profile_height_in else R.string.profile_height_cm),
                        hint = stringResource(R.string.profile_optional),
                        error = evaluation.errors[ProfileField.HEIGHT],
                        decimal = true,
                    )
                    NumberField(
                        value = input.weight,
                        onChange = { v -> onEdit { it.copy(weight = v) } },
                        label = stringResource(if (units == UnitSystem.IMPERIAL) R.string.profile_weight_lb else R.string.profile_weight_kg),
                        hint = stringResource(R.string.profile_optional),
                        error = evaluation.errors[ProfileField.WEIGHT],
                        decimal = true,
                    )
                    NumberField(
                        value = input.maxHeartRate,
                        onChange = { v -> onEdit { it.copy(maxHeartRate = v) } },
                        label = stringResource(R.string.profile_max_hr),
                        hint = stringResource(R.string.profile_max_hr_hint),
                        error = evaluation.errors[ProfileField.MAX_HEART_RATE],
                        decimal = false,
                    )
                    val unitName = stringResource(
                        if (units == UnitSystem.IMPERIAL) R.string.profile_units_imperial else R.string.profile_units_metric,
                    )
                    Text(
                        stringResource(R.string.profile_units_note, unitName),
                        style = ApexTheme.type.caption,
                        color = colors.mutedForeground,
                    )
                    ProvenanceLabel(DataProvenance.USER_REPORTED)
                }
            }

            MaxHrCard(maxHeartRateFromProfile(evaluation, currentYear))

            if (evaluation.errors.isNotEmpty()) {
                Text(stringResource(R.string.profile_fix_errors), style = ApexTheme.type.caption, color = colors.recoveryRedText)
            }
            ApexButton(
                text = stringResource(R.string.profile_save),
                onClick = onSave,
                enabled = dirty,
                modifier = Modifier.fillMaxWidth(),
            )
            when (status) {
                ProfileSaveStatus.SAVED -> Text(
                    stringResource(R.string.profile_saved), style = ApexTheme.type.caption, color = colors.optimalText,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
                ProfileSaveStatus.ERROR -> Text(
                    stringResource(R.string.profile_save_error), style = ApexTheme.type.caption, color = colors.recoveryRedText,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
                ProfileSaveStatus.IDLE -> Unit
            }
            Box(Modifier.navigationBarsPadding().padding(bottom = ApexSpacing.xl))
        }
    }
}

@Composable
private fun NumberField(
    value: String,
    onChange: (String) -> Unit,
    label: String,
    hint: String,
    error: Parsed.Bad?,
    decimal: Boolean,
) {
    val errorText = error?.let {
        when (it.kind) {
            BadKind.NOT_NUMBER -> stringResource(R.string.profile_error_not_number)
            BadKind.NOT_WHOLE -> stringResource(R.string.profile_error_not_whole)
            BadKind.RANGE -> stringResource(R.string.profile_error_range, it.range?.min ?: 0, it.range?.max ?: 0)
        }
    }
    ApexTextField(
        value = value,
        onValueChange = onChange,
        label = label,
        supportingText = hint,
        errorText = errorText,
        keyboardOptions = KeyboardOptions(keyboardType = if (decimal) KeyboardType.Decimal else KeyboardType.Number),
    )
}

@Composable
private fun SexSelector(selected: Sex, onSelect: (Sex) -> Unit) {
    val colors = ApexTheme.colors
    val options = listOf(
        Sex.UNSPECIFIED to stringResource(R.string.profile_sex_unspecified),
        Sex.MALE to stringResource(R.string.profile_sex_male),
        Sex.FEMALE to stringResource(R.string.profile_sex_female),
    )
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(stringResource(R.string.profile_sex).uppercase(), style = ApexTheme.type.statLabel, color = colors.mutedForeground)
        Row(Modifier.fillMaxWidth().selectableGroup(), horizontalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
            options.forEach { (sex, label) ->
                val isSelected = sex == selected
                Box(
                    Modifier
                        .weight(1f)
                        .heightIn(min = ApexSpacing.minTouch)
                        .background(if (isSelected) colors.primary else colors.field, ApexShapes.button)
                        .selectable(selected = isSelected, role = Role.RadioButton, onClick = { onSelect(sex) })
                        .semantics { contentDescription = label }
                        .padding(horizontal = ApexSpacing.sm, vertical = ApexSpacing.sm),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        label,
                        style = ApexTheme.type.body,
                        color = if (isSelected) colors.primaryForeground else colors.foreground,
                    )
                }
            }
        }
        Text(stringResource(R.string.profile_sex_hint), style = ApexTheme.type.caption, color = colors.mutedForeground)
    }
}

@Composable
private fun MaxHrCard(inUse: MaxHrInUse?) {
    val colors = ApexTheme.colors
    val provenance = when (inUse?.source) {
        MaxHrSource.ENTERED -> DataProvenance.USER_REPORTED
        MaxHrSource.AGE_ESTIMATE -> DataProvenance.ESTIMATED
        null -> null
    }
    val state: MetricState = if (inUse == null) {
        MetricState.Unavailable(detail = stringResource(R.string.profile_estimate_none))
    } else {
        MetricState.Value(inUse.bpm.toDouble(), 0, stringResource(R.string.profile_estimate_unit), provenance)
    }
    val sourceText = when (inUse?.source) {
        MaxHrSource.ENTERED -> stringResource(R.string.profile_estimate_entered)
        MaxHrSource.AGE_ESTIMATE -> stringResource(R.string.profile_estimate_age)
        null -> null
    }
    ApexCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
            Text(
                stringResource(R.string.profile_estimate_title).uppercase(),
                style = ApexTheme.type.statLabel,
                color = colors.mutedForeground,
                modifier = Modifier.semantics { heading() },
            )
            MetricStateView(state, label = stringResource(R.string.profile_estimate_title)) { v ->
                Text("${v.numberText()} ${v.unit.orEmpty()}".trim(), style = ApexTheme.type.statValue, color = colors.foreground)
            }
            if (sourceText != null) Text(sourceText, style = ApexTheme.type.caption, color = colors.mutedForeground)
            if (state is MetricState.Value) ProvenanceLabel(state.provenance)
        }
    }
}

@Composable
private fun ProfilePreviewBody(units: UnitSystem) {
    val profile = UserProfile(birthYear = 1990, sex = Sex.MALE, heightCm = 180.0, weightKg = 78.0)
    ProfileContent(
        stored = StoredProfile(profile, units),
        input = ProfileInput.from(profile, units).copy(maxHeartRate = "300"),
        status = ProfileSaveStatus.IDLE,
        currentYear = 2026,
        onEdit = {}, onSave = {}, onBack = {},
    )
}

@Preview(name = "Profile dark", heightDp = 1100)
@Composable
private fun ProfilePreviewDark() = ApexTheme(ThemePreference.DARK) {
    Box(Modifier.background(ApexTheme.colors.background)) { ProfilePreviewBody(UnitSystem.METRIC) }
}

@Preview(name = "Profile light imperial", heightDp = 1100)
@Composable
private fun ProfilePreviewLight() = ApexTheme(ThemePreference.LIGHT) {
    Box(Modifier.background(ApexTheme.colors.background)) { ProfilePreviewBody(UnitSystem.IMPERIAL) }
}
