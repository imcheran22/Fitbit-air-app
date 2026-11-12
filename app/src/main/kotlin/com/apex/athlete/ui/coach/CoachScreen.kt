package com.apex.athlete.ui.coach

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.data.coach.CoachAdvice
import com.apex.athlete.core.data.coach.CoachBriefing
import com.apex.athlete.core.data.coach.CoachLine
import com.apex.athlete.core.data.coach.ask.AskApexAnswer
import com.apex.athlete.core.data.coach.ask.AskApexPayload
import com.apex.athlete.core.data.coach.ask.AskApexResult
import com.apex.athlete.core.data.coach.ask.AskFact
import com.apex.athlete.core.data.coach.ask.AskFactKind
import com.apex.athlete.core.data.coach.ask.toAskFacts
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.components.ApexButton
import com.apex.athlete.core.ui.components.ApexButtonStyle
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.ApexTextField
import com.apex.athlete.core.ui.components.ChipTone
import com.apex.athlete.core.ui.components.ProvenanceLabel
import com.apex.athlete.core.ui.components.SkeletonLineFill
import com.apex.athlete.core.ui.components.StatusChip
import com.apex.athlete.core.ui.shell.DetailHeader
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.core.ui.theme.ThemePreference
import com.apex.athlete.navigation.ApexNavigator
import com.apex.athlete.ui.common.apexViewModel
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flatMapLatest

/** Emits today's epoch day now and again whenever it changes (checked once a minute). */
internal fun currentDay(today: () -> Long): Flow<Long> = flow {
    while (true) {
        emit(today())
        delay(60_000L)
    }
}.distinctUntilChanged()

@OptIn(ExperimentalCoroutinesApi::class)
@Composable
fun CoachRoute(navigator: ApexNavigator) {
    val vm = apexViewModel { container, handle ->
        val repository = container.repository
        val client = container.askApexClient
        CoachViewModel(
            // Follows the calendar: a screen left open past midnight moves on to the new day.
            context = currentDay(repository::today).flatMapLatest { repository.dashboard(it) }.map { s ->
                s?.let { CoachContext(it.briefing, it.analysis.toAskFacts()) }
            },
            settingsAiEnabled = container.settings.settings.map { it.aiCoachEnabled },
            keys = container.aiKeyStore,
            ask = { payload, fallback -> client.ask(payload, fallback) },
            handle = handle,
        )
    }
    val context by vm.coachContext.collectAsStateWithLifecycle()
    val aiEnabled by vm.aiEnabled.collectAsStateWithLifecycle()
    val keySaved by vm.keySaved.collectAsStateWithLifecycle()
    val keyError by vm.keyError.collectAsStateWithLifecycle()
    val question by vm.question.collectAsStateWithLifecycle()
    val phase by vm.phase.collectAsStateWithLifecycle()
    CoachContent(
        briefing = context?.briefing,
        aiEnabled = aiEnabled,
        keySaved = keySaved,
        keyError = keyError,
        question = question,
        phase = phase,
        onBack = navigator::back,
        onOpenSettings = navigator::openSettings,
        onSaveKey = vm::saveKey,
        onRemoveKey = vm::removeKey,
        onQuestionChange = vm::setQuestion,
        onReview = vm::requestPreview,
        onCancelPreview = vm::cancelPreview,
        onConfirmSend = vm::confirmSend,
        onDismissResult = vm::dismissResult,
    )
}

@Composable
internal fun CoachContent(
    briefing: CoachBriefing?,
    aiEnabled: Boolean,
    keySaved: Boolean,
    keyError: Boolean,
    question: String,
    phase: AskPhase,
    onBack: () -> Unit,
    onOpenSettings: () -> Unit,
    onSaveKey: (String) -> Unit,
    onRemoveKey: () -> Unit,
    onQuestionChange: (String) -> Unit,
    onReview: () -> Unit,
    onCancelPreview: () -> Unit,
    onConfirmSend: () -> Unit,
    onDismissResult: () -> Unit,
) {
    Column(Modifier.fillMaxSize()) {
        DetailHeader(
            title = stringResource(R.string.coach_title),
            onBack = onBack,
            backDescription = stringResource(R.string.common_back),
        )
        Column(
            Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = ApexSpacing.gutter),
            verticalArrangement = Arrangement.spacedBy(ApexSpacing.cardGap),
        ) {
            BriefingCard(briefing, title = stringResource(R.string.coach_briefing_title))
            Text(
                stringResource(R.string.coach_briefing_note),
                style = ApexTheme.type.caption,
                color = ApexTheme.colors.mutedForeground,
                modifier = Modifier.padding(horizontal = ApexSpacing.xs),
            )
            if (!aiEnabled) {
                AiOffCard(onOpenSettings)
            } else if (!keySaved) {
                KeyEntryCard(keyError, onSaveKey)
            } else {
                AskCard(briefing != null, question, phase, onQuestionChange, onReview, onCancelPreview, onConfirmSend, onRemoveKey)
                (phase as? AskPhase.Finished)?.let { ResultSection(it.result, onDismissResult) }
            }
            Spacer(Modifier.height(ApexSpacing.xl))
        }
    }
}

@Composable
private fun BriefingCard(briefing: CoachBriefing?, title: String) {
    val colors = ApexTheme.colors
    ApexCard(Modifier.fillMaxWidth()) {
        Text(title, style = ApexTheme.type.bodyStrong, color = colors.foreground, modifier = Modifier.semantics { heading() })
        if (briefing == null) {
            val loading = stringResource(R.string.coach_briefing_loading)
            Column(
                Modifier.padding(top = ApexSpacing.md).semantics { contentDescription = loading },
                verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm),
            ) {
                SkeletonLineFill(height = 16.dp)
                SkeletonLineFill()
                SkeletonLineFill()
            }
            return@ApexCard
        }
        val spoken = stringResource(
            R.string.coach_briefing_cd,
            (listOf(briefing.headline) + briefing.lines.map { it.text }).joinToString(" "),
        )
        Column(
            Modifier.padding(top = ApexSpacing.md).semantics(mergeDescendants = true) { contentDescription = spoken },
            verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm),
        ) {
            Text(briefing.headline, style = ApexTheme.type.sectionTitle, color = colors.foreground)
            adviceCopy(briefing.advice)?.let { StatusChip(stringResource(it), tone = adviceTone(briefing.advice)) }
            briefing.lines.forEach { line ->
                Text(line.text, style = ApexTheme.type.body, color = colors.foregroundSecondary)
            }
            // The briefing is worked out by fixed rules from your own readings: never labelled as AI.
            ProvenanceLabel(DataProvenance.MATHEMATICALLY_DERIVED)
            Text(stringResource(R.string.coach_briefing_source), style = ApexTheme.type.caption, color = colors.mutedForeground)
        }
    }
}

private fun adviceTone(a: CoachAdvice): ChipTone = when (a) {
    CoachAdvice.TRAIN_HARD -> ChipTone.STRAIN
    CoachAdvice.TRAIN_MODERATE -> ChipTone.INFO
    CoachAdvice.TRAIN_EASY -> ChipTone.OPTIMAL
    CoachAdvice.REST_OR_DEFER -> ChipTone.WARNING
    CoachAdvice.NO_ADVICE -> ChipTone.NEUTRAL
}

@Composable
private fun AiOffCard(onOpenSettings: () -> Unit) {
    ApexCard(Modifier.fillMaxWidth()) {
        Text(stringResource(R.string.coach_ask_title), style = ApexTheme.type.bodyStrong, color = ApexTheme.colors.foreground, modifier = Modifier.semantics { heading() })
        Text(
            stringResource(R.string.coach_off_body),
            style = ApexTheme.type.body,
            color = ApexTheme.colors.foregroundSecondary,
            modifier = Modifier.padding(vertical = ApexSpacing.md),
        )
        ApexButton(stringResource(R.string.coach_off_action), onOpenSettings, Modifier.fillMaxWidth(), style = ApexButtonStyle.Secondary)
    }
}

@Composable
private fun KeyEntryCard(keyError: Boolean, onSaveKey: (String) -> Unit) {
    // The draft key is deliberately not saveable: a secret must not be written into saved state.
    var draft by remember { mutableStateOf("") }
    ApexCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
            Text(stringResource(R.string.coach_ask_title), style = ApexTheme.type.bodyStrong, color = ApexTheme.colors.foreground, modifier = Modifier.semantics { heading() })
            Text(stringResource(R.string.coach_key_intro), style = ApexTheme.type.body, color = ApexTheme.colors.foregroundSecondary)
            ApexTextField(
                value = draft,
                onValueChange = { draft = it },
                label = stringResource(R.string.coach_key_label),
                placeholder = stringResource(R.string.coach_key_placeholder),
                errorText = if (keyError && draft.isBlank()) stringResource(R.string.coach_key_error) else null,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            )
            ApexButton(
                stringResource(R.string.coach_key_save),
                onClick = {
                    onSaveKey(draft)
                    draft = ""
                },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun AskCard(
    hasBriefing: Boolean,
    question: String,
    phase: AskPhase,
    onQuestionChange: (String) -> Unit,
    onReview: () -> Unit,
    onCancelPreview: () -> Unit,
    onConfirmSend: () -> Unit,
    onRemoveKey: () -> Unit,
) {
    val colors = ApexTheme.colors
    ApexCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
            Text(stringResource(R.string.coach_ask_title), style = ApexTheme.type.bodyStrong, color = colors.foreground, modifier = Modifier.semantics { heading() })
            Text(stringResource(R.string.coach_key_saved), style = ApexTheme.type.caption, color = colors.mutedForeground)
            when (phase) {
                is AskPhase.Confirming -> {
                    Text(stringResource(R.string.coach_preview_title), style = ApexTheme.type.bodyStrong, color = colors.foreground, modifier = Modifier.semantics { heading() })
                    Text(stringResource(R.string.coach_preview_intro), style = ApexTheme.type.caption, color = colors.mutedForeground)
                    Box(Modifier.fillMaxWidth().background(colors.field, com.apex.athlete.core.ui.theme.ApexShapes.row).padding(ApexSpacing.md)) {
                        Text(phase.payload.preview, style = ApexTheme.type.caption, color = colors.foregroundSecondary)
                    }
                    ApexButton(stringResource(R.string.coach_preview_send), onConfirmSend, Modifier.fillMaxWidth())
                    ApexButton(stringResource(R.string.coach_preview_cancel), onCancelPreview, Modifier.fillMaxWidth(), style = ApexButtonStyle.Secondary)
                }
                AskPhase.Sending -> Text(
                    stringResource(R.string.coach_sending),
                    style = ApexTheme.type.body,
                    color = colors.foregroundSecondary,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
                else -> {
                    ApexTextField(
                        value = question,
                        onValueChange = onQuestionChange,
                        label = stringResource(R.string.coach_question_label),
                        placeholder = stringResource(R.string.coach_question_placeholder),
                        supportingText = stringResource(R.string.coach_question_count, question.length, AskApexPayload.MAX_QUESTION_CHARS),
                        singleLine = false,
                    )
                    ApexButton(
                        stringResource(R.string.coach_question_review),
                        onReview,
                        Modifier.fillMaxWidth(),
                        enabled = hasBriefing && question.isNotBlank(),
                    )
                }
            }
            if (phase !is AskPhase.Sending) {
                ApexButton(stringResource(R.string.coach_key_remove), onRemoveKey, Modifier.fillMaxWidth(), style = ApexButtonStyle.Destructive)
            }
        }
    }
}

@Composable
private fun ResultSection(result: AskApexResult, onDismiss: () -> Unit) {
    val colors = ApexTheme.colors
    when (result) {
        is AskApexResult.Answer -> ApexCard(Modifier.fillMaxWidth()) {
            val spoken = stringResource(R.string.coach_answer_cd, result.answer.text)
            Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                Text(stringResource(R.string.coach_answer_title), style = ApexTheme.type.bodyStrong, color = colors.foreground, modifier = Modifier.semantics { heading() })
                Column(
                    Modifier.semantics(mergeDescendants = true) { contentDescription = spoken },
                    verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm),
                ) {
                    Text(result.answer.text, style = ApexTheme.type.body, color = colors.foregroundSecondary)
                    ProvenanceLabel(result.answer.provenance)
                }
                if (result.answer.unverifiedNumerals.isNotEmpty()) {
                    StatusChip(stringResource(R.string.coach_unverified_chip), tone = ChipTone.WARNING)
                    Text(stringResource(R.string.coach_unverified_detail), style = ApexTheme.type.caption, color = colors.mutedForeground)
                }
                if (result.answer.truncated) {
                    Text(stringResource(R.string.coach_answer_truncated), style = ApexTheme.type.caption, color = colors.mutedForeground)
                }
                ApexButton(stringResource(R.string.coach_result_dismiss), onDismiss, Modifier.fillMaxWidth(), style = ApexButtonStyle.Secondary)
            }
        }
        is AskApexResult.Refused -> ApexCard(Modifier.fillMaxWidth()) {
            Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                Text(stringResource(R.string.coach_refused_title), style = ApexTheme.type.bodyStrong, color = colors.foreground, modifier = Modifier.semantics { heading() })
                Text(stringResource(R.string.coach_refused_body), style = ApexTheme.type.body, color = colors.foregroundSecondary)
                ApexButton(stringResource(R.string.coach_result_dismiss), onDismiss, Modifier.fillMaxWidth(), style = ApexButtonStyle.Secondary)
            }
        }
        is AskApexResult.Unavailable -> {
            ApexCard(Modifier.fillMaxWidth()) {
                Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                    Text(stringResource(R.string.coach_unavailable_title), style = ApexTheme.type.bodyStrong, color = colors.foreground, modifier = Modifier.semantics { heading() })
                    Text(
                        stringResource(unavailableCopy(result.reason)),
                        style = ApexTheme.type.body,
                        color = colors.foregroundSecondary,
                        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                    )
                    ApexButton(stringResource(R.string.coach_result_dismiss), onDismiss, Modifier.fillMaxWidth(), style = ApexButtonStyle.Secondary)
                }
            }
            result.fallback?.let { BriefingCard(it, title = stringResource(R.string.coach_fallback_title)) }
        }
    }
}

// --- Previews --------------------------------------------------------------------------------

private val previewBriefing = CoachBriefing(
    CoachAdvice.TRAIN_MODERATE,
    "A steady day suits you.",
    listOf(
        CoachLine(CoachLine.Topic.RECOVERY, "Recovery is 62%. Your body is partly recovered.", listOf("62")),
        CoachLine(CoachLine.Topic.SLEEP, "You slept 412 minutes, close to the 450 you need.", listOf("412", "450")),
    ),
)

@Composable
private fun CoachPreviewBody(phase: AskPhase, aiEnabled: Boolean = true, keySaved: Boolean = true) {
    CoachContent(
        briefing = previewBriefing, aiEnabled = aiEnabled, keySaved = keySaved, keyError = false,
        question = "Why is my recovery lower today?", phase = phase,
        onBack = {}, onOpenSettings = {}, onSaveKey = {}, onRemoveKey = {}, onQuestionChange = {},
        onReview = {}, onCancelPreview = {}, onConfirmSend = {}, onDismissResult = {},
    )
}

private val previewAnswer = AskApexResult.Answer(AskApexAnswer("Your recovery sits at 62 percent, so a moderate session fits.", unverifiedNumerals = listOf("62")))

@Preview(name = "Coach dark answer", heightDp = 1000)
@Composable
private fun CoachPreviewDark() = ApexTheme(ThemePreference.DARK) {
    Box(Modifier.background(ApexTheme.colors.background)) { CoachPreviewBody(AskPhase.Finished(previewAnswer)) }
}

@Preview(name = "Coach light confirm", heightDp = 1000)
@Composable
private fun CoachPreviewLight() = ApexTheme(ThemePreference.LIGHT) {
    Box(Modifier.background(ApexTheme.colors.background)) {
        CoachPreviewBody(
            AskPhase.Confirming(
                AskApexPayload.build("Why is my recovery lower today?", previewBriefing, listOf(AskFact(AskFactKind.RECOVERY, "62"))),
            ),
        )
    }
}

@Preview(name = "Coach dark off", heightDp = 700)
@Composable
private fun CoachPreviewOffDark() = ApexTheme(ThemePreference.DARK) {
    Box(Modifier.background(ApexTheme.colors.background)) { CoachPreviewBody(AskPhase.Idle, aiEnabled = false) }
}

@Preview(name = "Coach light key", heightDp = 700)
@Composable
private fun CoachPreviewKeyLight() = ApexTheme(ThemePreference.LIGHT) {
    Box(Modifier.background(ApexTheme.colors.background)) { CoachPreviewBody(AskPhase.Idle, keySaved = false) }
}
