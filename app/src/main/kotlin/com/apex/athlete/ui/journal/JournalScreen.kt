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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.tooling.preview.Preview
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.ui.components.ApexButton
import com.apex.athlete.core.ui.components.ApexButtonStyle
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.ui.quicklog.QuickLogSheet
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.DatePill
import com.apex.athlete.core.ui.components.ProvenanceLabel
import com.apex.athlete.core.ui.components.SkeletonLineFill
import com.apex.athlete.core.ui.components.hideFromTalkBack
import com.apex.athlete.core.ui.components.spoken
import com.apex.athlete.core.ui.shell.SectionShell
import com.apex.athlete.core.analytics.journal.JournalOutcomeKind
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
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
    val factorsVm = apexViewModel(key = "journal-factors") { container, handle -> JournalFactorsViewModel(container.repository, handle) }
    LaunchedEffect(day) { factorsVm.setDay(day.toEpochDay()) }
    val journal by factorsVm.journal.collectAsStateWithLifecycle()
    val pending by factorsVm.pending.collectAsStateWithLifecycle()
    val factorStatus by factorsVm.status.collectAsStateWithLifecycle()
    val formatter = LocalFormatter.current
    val panel = remember(journal, pending, factorStatus) { FactorsPanel.of(journal?.factors, pending, factorStatus) }
    // null = still loading (skeleton); an empty analysis is a message, not a blank.
    val effects = remember(journal, formatter) { journal?.let { buildEffectsUi(it.effects, formatter) } }
    val today = formatter.today()
    var quickLogOpen by rememberSaveable { mutableStateOf(false) }
    if (quickLogOpen) QuickLogSheet(onDismiss = { quickLogOpen = false })
    JournalContent(
        onQuickLog = { quickLogOpen = true },
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
        factors = panel,
        onFactor = factorsVm::select,
        effects = effects,
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
    factors: FactorsPanel,
    onFactor: (MetricType, FactorChoice) -> Unit,
    effects: EffectsUi?,
    contentPadding: PaddingValues,
    onQuickLog: (() -> Unit)? = null,
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

        if (onQuickLog != null) {
            ApexButton(
                text = stringResource(R.string.journal_quick_log_open),
                onClick = onQuickLog,
                style = ApexButtonStyle.Secondary,
                leadingIcon = ApexIcons.Plus,
                modifier = Modifier.fillMaxWidth(),
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
        FactorsCard(factors, onFactor)
        EffectsSection(effects)
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

@Composable
private fun FactorsCard(panel: FactorsPanel, onFactor: (MetricType, FactorChoice) -> Unit) {
    val colors = ApexTheme.colors
    ApexCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
            Text(
                stringResource(R.string.journal_factors_title),
                style = ApexTheme.type.bodyStrong,
                color = colors.foreground,
                modifier = Modifier.semantics { heading() },
            )
            Text(stringResource(R.string.journal_factors_intro), style = ApexTheme.type.body, color = colors.foregroundSecondary)
            if (!panel.loaded) {
                val loadingCd = stringResource(R.string.journal_factors_loading_cd)
                Column(
                    Modifier.fillMaxWidth().semantics { contentDescription = loadingCd },
                    verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm),
                ) {
                    repeat(JOURNAL_FACTORS.size) { SkeletonLineFill(height = 48.dp) }
                }
            } else {
                JOURNAL_FACTORS.forEach { factor ->
                    FactorRow(factor, panel.choices[factor] ?: FactorChoice.NOT_LOGGED) { onFactor(factor, it) }
                }
            }
            when (panel.status) {
                SaveStatus.SAVING -> Text(
                    stringResource(R.string.journal_factor_saving),
                    style = ApexTheme.type.caption,
                    color = colors.mutedForeground,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
                SaveStatus.SAVED -> StatusLine(stringResource(R.string.journal_factor_saved), error = false)
                SaveStatus.ERROR -> StatusLine(stringResource(R.string.journal_factor_error), error = true)
                SaveStatus.IDLE -> Unit
            }
            ProvenanceLabel(DataProvenance.USER_REPORTED)
        }
    }
}

/** Yes / No / Not logged as one radio group; each option is a 48 dp target and the group is named by the factor. */
@Composable
private fun FactorRow(factor: MetricType, selected: FactorChoice, onPick: (FactorChoice) -> Unit) {
    val colors = ApexTheme.colors
    val label = stringResource(factorTitleRes(factor))
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
        Text(label.uppercase(), style = ApexTheme.type.statLabel, color = colors.mutedForeground)
        Row(Modifier.fillMaxWidth().selectableGroup(), horizontalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
            FactorChoice.entries.forEach { choice ->
                val isSelected = choice == selected
                val optionLabel = stringResource(choiceLabelRes(choice))
                val cd = stringResource(R.string.journal_factor_option_cd, label, optionLabel)
                Box(
                    Modifier
                        .weight(1f)
                        .heightIn(min = ApexSpacing.minTouch)
                        .background(if (isSelected) colors.primary else colors.field, ApexShapes.button)
                        .selectable(selected = isSelected, role = Role.RadioButton, onClick = { onPick(choice) })
                        .semantics { contentDescription = cd }
                        .padding(horizontal = ApexSpacing.xs, vertical = ApexSpacing.sm),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        optionLabel,
                        style = ApexTheme.type.bodyStrong,
                        color = if (isSelected) colors.primaryForeground else colors.foreground,
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }
    }
}

@Composable
private fun EffectsSection(effects: EffectsUi?) {
    val colors = ApexTheme.colors
    SectionShell(stringResource(R.string.journal_effects_title)) {
        Text(stringResource(R.string.journal_effects_intro), style = ApexTheme.type.caption, color = colors.mutedForeground)
        if (effects == null) {
            val loadingCd = stringResource(R.string.journal_effects_loading_cd)
            ApexCard(Modifier.semantics { contentDescription = loadingCd }) {
                SkeletonLineFill(height = 20.dp)
                SkeletonLineFill(Modifier.padding(top = ApexSpacing.md), height = 40.dp)
            }
        } else {
            if (effects.emptySummary != null) {
                ApexCard(Modifier.fillMaxWidth()) {
                    Text(effects.emptySummary, style = ApexTheme.type.body, color = colors.foregroundBody)
                }
            }
            effects.rows.forEach { EffectCard(it) }
            if (effects.notes.isNotEmpty()) {
                ApexCard(Modifier.fillMaxWidth()) {
                    Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                        Text(
                            stringResource(R.string.journal_effects_waiting_title),
                            style = ApexTheme.type.bodyStrong,
                            color = colors.foreground,
                            modifier = Modifier.semantics { heading() },
                        )
                        effects.notes.forEach { note ->
                            Column(Modifier.fillMaxWidth().spoken(note.spoken), verticalArrangement = Arrangement.spacedBy(ApexSpacing.xxs)) {
                                Text(note.title.uppercase(), style = ApexTheme.type.statLabel, color = colors.mutedForeground)
                                note.lines.forEach { Text(it, style = ApexTheme.type.caption, color = colors.foregroundSecondary) }
                            }
                        }
                    }
                }
            }
            effects.testsText?.let { Text(it, style = ApexTheme.type.caption, color = colors.mutedForeground) }
            Text(stringResource(R.string.journal_effects_assoc_note), style = ApexTheme.type.caption, color = colors.mutedForeground)
        }
    }
}

@Composable
private fun EffectCard(row: EffectRowUi) {
    val colors = ApexTheme.colors
    ApexCard(Modifier.fillMaxWidth(), spokenDescription = row.spoken) {
        Column(Modifier.hideFromTalkBack(), verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
            Text(row.title.uppercase(), style = ApexTheme.type.statLabel, color = colors.foreground)
            Text(row.headline, style = ApexTheme.type.bodyStrong, color = colors.foreground)
            Text(row.interval, style = ApexTheme.type.statSubValue, color = colors.foregroundSecondary)
            Text(row.arms, style = ApexTheme.type.caption, color = colors.mutedForeground)
            Text(row.certainty, style = ApexTheme.type.caption, color = colors.mutedForeground)
            ProvenanceLabel(DataProvenance.MATHEMATICALLY_DERIVED)
        }
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

private fun previewEffects() = EffectsUi(
    rows = listOf(
        EffectRowUi(
            MetricType.JOURNAL_ALCOHOL, JournalOutcomeKind.RECOVERY_POINTS, "Alcohol",
            "Associated with next-day recovery 6.2 points lower", "95% interval: \u221211.0 to \u22121.4 points",
            "Based on 12 days with it and 31 days without it", "The interval does not include zero.", true,
            "Alcohol. Associated with next-day recovery 6.2 points lower.",
        ),
        EffectRowUi(
            MetricType.JOURNAL_LATE_CAFFEINE, JournalOutcomeKind.HRV_PERCENT, "Late caffeine",
            "Associated with next-day HRV 3.1% lower", "95% interval: \u221211.0% to +5.9%",
            "Based on 8 days with it and 40 days without it", "The interval includes zero, so this could be chance.", false,
            "Late caffeine. Associated with next-day HRV 3.1% lower.",
        ),
    ),
    notes = listOf(
        EffectNoteUi(
            MetricType.JOURNAL_TRAVEL, JournalOutcomeKind.RECOVERY_POINTS, "Travel and next-day recovery",
            listOf("Days so far: 2 with it, 40 without it.", "More days with it needed: 3."), "Travel and next-day recovery.",
        ),
    ),
    emptySummary = null,
    testsText = "Tests performed: 4. No correction is applied for running several, so some intervals will exclude zero by chance alone.",
    testsPerformed = 4,
)

@Composable
private fun JournalPreviewBody() {
    JournalContent(
        dayLabel = "Today", canGoNext = false, onPrevious = {}, onNext = {}, onToday = {},
        stored = StoredCheckIn(fatigue = 4, soreness = null),
        draft = CheckInDraft(fatigue = 4, soreness = 6),
        status = SaveStatus.IDLE,
        onPick = { _, _ -> }, onSave = {},
        factors = FactorsPanel(
            loaded = true,
            choices = mapOf(
                MetricType.JOURNAL_ALCOHOL to FactorChoice.YES,
                MetricType.JOURNAL_LATE_CAFFEINE to FactorChoice.NO,
                MetricType.JOURNAL_LATE_MEAL to FactorChoice.NOT_LOGGED,
                MetricType.JOURNAL_STRESSFUL_DAY to FactorChoice.NOT_LOGGED,
                MetricType.JOURNAL_TRAVEL to FactorChoice.NOT_LOGGED,
            ),
            status = SaveStatus.SAVED,
        ),
        onFactor = { _, _ -> },
        effects = previewEffects(),
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
