package com.apex.athlete.ui.journal

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.ui.components.ApexButton
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.DatePill
import com.apex.athlete.core.ui.components.ProvenanceLabel
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.state.MetricStateView
import com.apex.athlete.core.ui.theme.ApexShapes
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.core.ui.theme.ThemePreference
import com.apex.athlete.navigation.ApexNavigator
import com.apex.athlete.ui.common.LocalFormatter
import com.apex.athlete.ui.common.apexViewModel
import java.time.LocalDate

@Composable
fun JournalRoute(
    navigator: ApexNavigator,
    day: LocalDate,
    onDayChange: (LocalDate) -> Unit,
    contentPadding: PaddingValues,
) {
    val vm = apexViewModel { container, handle -> JournalViewModel(container.repository, handle) }
    LaunchedEffect(day) { vm.setDay(day.toEpochDay()) }
    val stored by vm.stored.collectAsStateWithLifecycle()
    val draft by vm.draft.collectAsStateWithLifecycle()
    val status by vm.status.collectAsStateWithLifecycle()
    val formatter = LocalFormatter.current
    val today = formatter.today()
    JournalContent(
        dayLabel = formatter.dayLabel(day),
        canGoNext = day.isBefore(today),
        onPrevious = { onDayChange(day.minusDays(1)) },
        onNext = { onDayChange(day.plusDays(1)) },
        onToday = { onDayChange(today) },
        stored = stored,
        draft = draft,
        status = status,
        onPick = vm::pick,
        onSave = vm::save,
        contentPadding = contentPadding,
    )
}

@Composable
internal fun JournalContent(
    dayLabel: String,
    canGoNext: Boolean,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onToday: () -> Unit,
    stored: StoredCheckIn?,
    draft: CheckInDraft,
    status: SaveStatus,
    onPick: (CheckInScale, Int) -> Unit,
    onSave: () -> Unit,
    contentPadding: PaddingValues,
) {
    val colors = ApexTheme.colors
    Column(
        Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = ApexSpacing.gutter)
            .padding(top = ApexSpacing.sm),
        verticalArrangement = Arrangement.spacedBy(ApexSpacing.cardGap),
    ) {
        Text(
            stringResource(R.string.journal_title),
            style = ApexTheme.type.sectionTitle,
            color = colors.foreground,
            modifier = Modifier.semantics { heading() },
        )
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            DatePill(
                label = dayLabel,
                onPrevious = onPrevious,
                onNext = onNext,
                onLabelClick = onToday,
                canGoNext = canGoNext,
                previousDescription = stringResource(R.string.journal_prev_day),
                nextDescription = stringResource(R.string.journal_next_day),
                labelClickDescription = stringResource(R.string.journal_go_today),
            )
        }

        ApexCard(Modifier.fillMaxWidth()) {
          Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
            Text(
                stringResource(R.string.journal_checkin_title),
                style = ApexTheme.type.bodyStrong,
                color = colors.foreground,
                modifier = Modifier.semantics { heading() },
            )
            Text(stringResource(R.string.journal_checkin_intro), style = ApexTheme.type.body, color = colors.foregroundSecondary)
            RatingSelector(CheckInScale.FATIGUE, stringResource(R.string.journal_fatigue_label), draft.fatigue) { onPick(CheckInScale.FATIGUE, it) }
            RatingSelector(CheckInScale.SORENESS, stringResource(R.string.journal_soreness_label), draft.soreness) { onPick(CheckInScale.SORENESS, it) }
            if (draft.fatigue > 0 || draft.soreness > 0) {
                Text(stringResource(R.string.journal_save_hint_clear), style = ApexTheme.type.caption, color = colors.mutedForeground)
            }
            ApexButton(
                text = stringResource(if (status == SaveStatus.SAVING) R.string.journal_saving else R.string.journal_save),
                onClick = onSave,
                enabled = status != SaveStatus.SAVING && canSave(draft, stored),
                modifier = Modifier.fillMaxWidth(),
            )
            when (status) {
                SaveStatus.SAVED -> StatusLine(stringResource(R.string.journal_save_done), error = false)
                SaveStatus.ERROR -> StatusLine(stringResource(R.string.journal_save_error), error = true)
                else -> Unit
            }
            ProvenanceLabel(DataProvenance.USER_REPORTED)
          }
        }

        StoredCheckInCard(stored)
        Text(
            stringResource(R.string.journal_history_note),
            style = ApexTheme.type.caption,
            color = colors.mutedForeground,
            modifier = Modifier.padding(horizontal = ApexSpacing.xs),
        )
        Box(Modifier.padding(contentPadding))
    }
}

@Composable
private fun StatusLine(text: String, error: Boolean) {
    val colors = ApexTheme.colors
    Text(
        text,
        style = ApexTheme.type.caption,
        color = if (error) colors.recoveryRedText else colors.optimalText,
        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
    )
}

@Composable
private fun StoredCheckInCard(stored: StoredCheckIn?) {
    val colors = ApexTheme.colors
    val unit = stringResource(R.string.journal_saved_unit)
    val loaded = stored != null
    val fatigue = storedRatingState(loaded, stored?.fatigue, unit, null)
    val soreness = storedRatingState(loaded, stored?.soreness, unit, null)
    ApexCard(Modifier.fillMaxWidth()) {
        Text(
            stringResource(R.string.journal_saved_title),
            style = ApexTheme.type.bodyStrong,
            color = colors.foreground,
            modifier = Modifier.semantics { heading() },
        )
        if (stored != null && stored.isEmpty) {
            Text(
                stringResource(R.string.journal_saved_empty),
                style = ApexTheme.type.body,
                color = colors.mutedForeground,
                modifier = Modifier.padding(top = ApexSpacing.sm),
            )
        }
        Row(
            Modifier.fillMaxWidth().padding(top = ApexSpacing.md),
            horizontalArrangement = Arrangement.spacedBy(ApexSpacing.lg),
        ) {
            StoredValue(stringResource(R.string.journal_fatigue_label), fatigue, Modifier.weight(1f))
            StoredValue(stringResource(R.string.journal_soreness_label), soreness, Modifier.weight(1f))
        }
    }
}

@Composable
private fun StoredValue(label: String, state: MetricState, modifier: Modifier) {
    val colors = ApexTheme.colors
    Column(modifier, verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
        Text(label.uppercase(), style = ApexTheme.type.statLabel, color = colors.mutedForeground)
        MetricStateView(state, label = label) { v ->
            Text(
                "${v.numberText()} ${v.unit.orEmpty()}".trim(),
                style = ApexTheme.type.statValue,
                color = colors.foreground,
            )
        }
        if (state is MetricState.Value) ProvenanceLabel(state.provenance, asOf = state.asOf)
    }
}

/** Ten numbered options in two rows of five. Each is a 48 dp radio-style target with anchor words. */
@Composable
private fun RatingSelector(scale: CheckInScale, label: String, selected: Int, onPick: (Int) -> Unit) {
    val colors = ApexTheme.colors
    val low = stringResource(anchorRes(scale, CHECK_IN_MIN))
    val high = stringResource(anchorRes(scale, CHECK_IN_MAX))
    val summary = if (selected > 0) {
        stringResource(R.string.journal_selected_summary, selected, stringResource(anchorRes(scale, selected)))
    } else {
        stringResource(R.string.journal_none_selected)
    }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(label.uppercase(), style = ApexTheme.type.statLabel, color = colors.mutedForeground, modifier = Modifier.weight(1f))
            Text(summary, style = ApexTheme.type.caption, color = colors.foregroundSecondary, textAlign = TextAlign.End)
        }
        Column(Modifier.fillMaxWidth().selectableGroup(), verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
            for (rowStart in listOf(1, 6)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
                    for (level in rowStart until rowStart + 5) {
                        val isSelected = level == selected
                        val anchor = stringResource(anchorRes(scale, level))
                        val cd = stringResource(R.string.journal_option_cd, anchor, level)
                        Box(
                            Modifier
                                .weight(1f)
                                .heightIn(min = ApexSpacing.minTouch)
                                .background(if (isSelected) colors.primary else colors.field, ApexShapes.button)
                                .selectable(selected = isSelected, role = Role.RadioButton, onClick = { onPick(level) })
                                .semantics { contentDescription = cd },
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                level.toString(),
                                style = ApexTheme.type.statValue,
                                color = if (isSelected) colors.primaryForeground else colors.foreground,
                            )
                        }
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(low, style = ApexTheme.type.caption, color = colors.mutedForeground, modifier = Modifier.weight(1f))
            Text(high, style = ApexTheme.type.caption, color = colors.mutedForeground, textAlign = TextAlign.End, modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun JournalPreviewBody() {
    JournalContent(
        dayLabel = "Today", canGoNext = false, onPrevious = {}, onNext = {}, onToday = {},
        stored = StoredCheckIn(fatigue = 4, soreness = null),
        draft = CheckInDraft(fatigue = 4, soreness = 6),
        status = SaveStatus.IDLE,
        onPick = { _, _ -> }, onSave = {},
        contentPadding = PaddingValues(),
    )
}

@Preview(name = "Journal dark", heightDp = 900)
@Composable
private fun JournalPreviewDark() = ApexTheme(ThemePreference.DARK) {
    Box(Modifier.background(ApexTheme.colors.background)) { JournalPreviewBody() }
}

@Preview(name = "Journal light", heightDp = 900)
@Composable
private fun JournalPreviewLight() = ApexTheme(ThemePreference.LIGHT) {
    Box(Modifier.background(ApexTheme.colors.background)) { JournalPreviewBody() }
}
