package com.apex.athlete.ui.breathe

import android.os.SystemClock
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.analytics.breathe.BreathePattern
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.components.ApexButton
import com.apex.athlete.core.ui.components.ApexButtonStyle
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.ChoiceOption
import com.apex.athlete.core.ui.components.ChoiceRow
import com.apex.athlete.core.ui.components.ChoiceScrollRow
import com.apex.athlete.core.ui.components.ProvenanceLabel
import com.apex.athlete.core.ui.components.SkeletonLineFill
import com.apex.athlete.core.ui.components.hideFromTalkBack
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.state.MetricStateView
import com.apex.athlete.core.ui.state.rememberReducedMotion
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.core.ui.theme.ThemePreference
import com.apex.athlete.ui.common.LocalFormatter
import com.apex.athlete.ui.common.apexViewModel
import com.apex.athlete.ui.quicklog.ExtrasScreenFrame
import com.apex.athlete.ui.quicklog.OutcomeLine
import com.apex.athlete.ui.quicklog.SectionHeading
import com.apex.athlete.ui.quicklog.WriteOutcome
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import java.time.Instant
import java.time.ZoneId

/**
 * Breathing guide and spot HRV. [rrIntervals] is the optional RR stream (milliseconds per beat) of a BLE strap; pass null
 * (the default) until the strap feature is wired and the HRV section shows as unavailable.
 */
@Composable
fun BreatheRoute(onBack: () -> Unit, rrIntervals: Flow<List<Int>>? = null) {
    val vm = apexViewModel { container, handle -> BreatheViewModel(container.localExtras, rrIntervals, handle) }
    val pattern by vm.pattern.collectAsStateWithLifecycle()
    val seconds by vm.plannedSeconds.collectAsStateWithLifecycle()
    val run by vm.run.collectAsStateWithLifecycle()
    val summary by vm.summary.collectAsStateWithLifecycle()
    val outcome by vm.outcome.collectAsStateWithLifecycle()
    val recent by vm.recent.collectAsStateWithLifecycle()
    val hrv by vm.spotHrv.collectAsStateWithLifecycle()
    val formatter = LocalFormatter.current
    BreatheContent(
        pattern = pattern,
        plannedSeconds = seconds,
        run = run,
        summary = summary,
        outcome = outcome,
        recent = recent,
        hrv = hrv,
        reducedMotion = rememberReducedMotion(),
        dateText = { millis ->
            val date = Instant.ofEpochMilli(millis).atZone(ZoneId.systemDefault()).toLocalDate()
            "${formatter.dayLabel(date)}, ${formatter.clockTime(millis)}"
        },
        onBack = onBack,
        onPattern = vm::selectPattern,
        onSeconds = vm::selectSeconds,
        onStart = vm::start,
        onFinish = vm::finish,
        onDelete = vm::delete,
    )
}

@Composable
private fun durationText(seconds: Int): String = stringResource(R.string.breathe_duration, seconds / 60, seconds % 60)

@Composable
internal fun BreatheContent(
    pattern: BreathePattern,
    plannedSeconds: Int,
    run: BreatheRun?,
    summary: SessionSummary?,
    outcome: WriteOutcome,
    recent: List<SessionRowUi>?,
    hrv: SpotHrvUi,
    reducedMotion: Boolean,
    dateText: (Long) -> String,
    onBack: () -> Unit,
    onPattern: (BreathePattern) -> Unit,
    onSeconds: (Int) -> Unit,
    onStart: () -> Unit,
    onFinish: (Long) -> Unit,
    onDelete: (String) -> Unit,
) {
    val colors = ApexTheme.colors
    ExtrasScreenFrame(stringResource(R.string.breathe_title), onBack) {
        Text(stringResource(R.string.breathe_intro), style = ApexTheme.type.body, color = colors.foregroundSecondary)

        if (run != null) {
            GuideCard(run, reducedMotion, onFinish)
        } else {
            PickerCard(pattern, plannedSeconds, onPattern, onSeconds, onStart)
            if (summary != null) SummaryCard(summary)
            OutcomeLine(outcome)
        }
        SpotHrvCard(hrv)
        RecentCard(recent, dateText, onDelete)
    }
}

@Composable
private fun PickerCard(
    pattern: BreathePattern,
    plannedSeconds: Int,
    onPattern: (BreathePattern) -> Unit,
    onSeconds: (Int) -> Unit,
    onStart: () -> Unit,
) {
    val colors = ApexTheme.colors
    val formatter = LocalFormatter.current
    ApexCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
            SectionHeading(stringResource(R.string.breathe_pattern_title))
            ChoiceScrollRow(
                options = BreathePattern.entries.map { ChoiceOption(it.name, stringResource(BreatheGuide.patternName(it))) },
                selectedKey = pattern.name,
                onSelect = { key -> BreatheGuide.patternOf(key)?.let(onPattern) },
                groupDescription = stringResource(R.string.breathe_pattern_group_cd),
            )
            // Each round's timing comes from the pattern itself, so the words can never disagree with the guide.
            val timing = pattern.phases.map { phase ->
                val s = phase.durationMillis / 1000.0
                val text = formatter.number(s, if (phase.durationMillis % 1000L == 0L) 0 else 1)
                stringResource(BreatheGuide.phaseTimingRes(phase.type), text)
            }.joinToString(", ")
            val timingCd = stringResource(R.string.breathe_timing_cd, timing)
            Text(timing, style = ApexTheme.type.body, color = colors.foregroundSecondary, modifier = Modifier.semantics { contentDescription = timingCd })

            SectionHeading(stringResource(R.string.breathe_length_title))
            ChoiceRow(
                options = BreatheGuide.DURATIONS_SECONDS.map {
                    ChoiceOption(
                        it.toString(),
                        stringResource(R.string.breathe_length_minutes, it / 60),
                        stringResource(R.string.breathe_length_minutes_cd, it / 60),
                    )
                },
                selectedKey = plannedSeconds.toString(),
                onSelect = { key -> key.toIntOrNull()?.let(onSeconds) },
                groupDescription = stringResource(R.string.breathe_length_group_cd),
            )
            ApexButton(stringResource(R.string.breathe_start), onStart, Modifier.fillMaxWidth())
        }
    }
}

@Composable
private fun GuideCard(run: BreatheRun, reducedMotion: Boolean, onFinish: (Long) -> Unit) {
    val colors = ApexTheme.colors
    val totalMillis = run.plannedSeconds * 1000L
    var elapsed by remember(run) { mutableStateOf(0L) }
    val latestFinish by rememberUpdatedState(onFinish)
    LaunchedEffect(run, reducedMotion) {
        val t0 = SystemClock.elapsedRealtime() - elapsed
        while (true) {
            val e = SystemClock.elapsedRealtime() - t0
            elapsed = e.coerceAtMost(totalMillis)
            if (e >= totalMillis) {
                latestFinish(totalMillis)
                break
            }
            // With "remove animations" the guide only needs a few updates a second; otherwise follow the frame clock.
            if (reducedMotion) delay(250) else withFrameNanos { }
        }
    }
    val state = run.pattern.phaseAt(elapsed)
    val phaseText = stringResource(BreatheGuide.phaseRes(state.type))
    val left = BreatheGuide.secondsLeftInPhase(run.pattern, state)
    val remaining = durationText(((totalMillis - elapsed + 999L) / 1000L).toInt())
    val guideCd = stringResource(R.string.breathe_guide_cd, phaseText, left)
    ApexCard(Modifier.fillMaxWidth()) {
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
            if (!reducedMotion) {
                val circleCd = stringResource(R.string.breathe_guide_circle_cd)
                val scale = BreatheGuide.scale(run.pattern, state)
                val outer = colors.chart1.copy(alpha = 0.18f)
                val inner = colors.chart1
                Canvas(Modifier.size(220.dp).semantics { contentDescription = circleCd }) {
                    val r = size.minDimension / 2f
                    drawCircle(outer, radius = r)
                    drawCircle(inner, radius = r * scale)
                }
            } else {
                Text(stringResource(R.string.breathe_reduced_note), style = ApexTheme.type.caption, color = colors.mutedForeground, textAlign = TextAlign.Center)
            }
            // The phase word is the live region: TalkBack announces each change, never the per-second countdown.
            Text(
                phaseText,
                style = ApexTheme.type.statValueLarge,
                color = colors.foreground,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite; contentDescription = guideCd },
            )
            Text(left.toString(), style = ApexTheme.type.statValue, color = colors.foregroundSecondary, modifier = Modifier.hideFromTalkBack())
            Text(stringResource(R.string.breathe_remaining, remaining), style = ApexTheme.type.caption, color = colors.mutedForeground)
            ApexButton(stringResource(R.string.breathe_stop), { onFinish(elapsed) }, Modifier.fillMaxWidth(), ApexButtonStyle.Secondary)
        }
    }
}

@Composable
private fun SummaryCard(summary: SessionSummary) {
    val colors = ApexTheme.colors
    ApexCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
            SectionHeading(stringResource(R.string.breathe_done_title))
            if (summary.completedSeconds < 1) {
                Text(stringResource(R.string.breathe_done_too_short), style = ApexTheme.type.body, color = colors.mutedForeground)
            } else {
                Text(
                    stringResource(
                        if (summary.saved) R.string.breathe_done_saved else R.string.breathe_done_not_saved,
                        stringResource(BreatheGuide.patternName(summary.pattern)),
                        durationText(summary.completedSeconds),
                        durationText(summary.plannedSeconds),
                    ),
                    style = ApexTheme.type.body,
                    color = colors.foreground,
                )
                if (summary.saved) ProvenanceLabel(DataProvenance.USER_REPORTED)
            }
        }
    }
}

@Composable
private fun SpotHrvCard(hrv: SpotHrvUi) {
    val colors = ApexTheme.colors
    ApexCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
            SectionHeading(stringResource(R.string.breathe_hrv_title))
            when (hrv) {
                SpotHrvUi.NoStrap -> {
                    MetricStateView(MetricState.Unavailable(MetricReason.NOT_CONNECTED, stringResource(R.string.breathe_hrv_no_strap))) { }
                }
                SpotHrvUi.Waiting -> Text(stringResource(R.string.breathe_hrv_waiting), style = ApexTheme.type.body, color = colors.mutedForeground)
                is SpotHrvUi.Analysed -> {
                    val label = stringResource(R.string.breathe_hrv_value_label)
                    val state: MetricState = hrv.rmssdMs?.let { MetricState.Value(it, 0, stringResource(R.string.breathe_hrv_unit_ms), DataProvenance.ESTIMATED) }
                        ?: MetricState.Unavailable(MetricReason.INSUFFICIENT_HR_DATA, hrv.reason?.let { stringResource(spotHrvReasonRes(it)) })
                    Text(label.uppercase(), style = ApexTheme.type.statLabel, color = colors.mutedForeground)
                    MetricStateView(state, label = label) { v ->
                        Text("${v.numberText()} ${v.unit.orEmpty()}".trim(), style = ApexTheme.type.statValueLarge, color = colors.foreground)
                    }
                    if (state is MetricState.Value) {
                        ProvenanceLabel(DataProvenance.ESTIMATED)
                        val bpm = hrv.meanHeartRateBpm
                        if (bpm != null) {
                            Text(
                                "${stringResource(R.string.breathe_hrv_hr_label)}: ${LocalFormatter.current.number(bpm, 0)} ${stringResource(R.string.breathe_hrv_unit_bpm)}",
                                style = ApexTheme.type.body,
                                color = colors.foregroundSecondary,
                            )
                        }
                        Text(stringResource(R.string.breathe_hrv_beats, hrv.acceptedBeats), style = ApexTheme.type.caption, color = colors.mutedForeground)
                    }
                }
            }
            Text(stringResource(R.string.breathe_hrv_note), style = ApexTheme.type.caption, color = colors.mutedForeground)
        }
    }
}

@Composable
private fun RecentCard(recent: List<SessionRowUi>?, dateText: (Long) -> String, onDelete: (String) -> Unit) {
    val colors = ApexTheme.colors
    ApexCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
            SectionHeading(stringResource(R.string.breathe_recent_title))
            when {
                recent == null -> {
                    val cd = stringResource(R.string.breathe_loading_cd)
                    SkeletonLineFill(Modifier.semantics { contentDescription = cd }, height = ApexSpacing.minTouch)
                }
                recent.isEmpty() -> Text(stringResource(R.string.breathe_recent_empty), style = ApexTheme.type.body, color = colors.mutedForeground)
                else -> recent.forEach { s ->
                    val name = s.pattern?.let { stringResource(BreatheGuide.patternName(it)) } ?: s.rawKey
                    val whenText = dateText(s.startMillis)
                    val line = stringResource(R.string.breathe_recent_row, name, durationText(s.completedSeconds), durationText(s.plannedSeconds))
                    val spoken = stringResource(R.string.breathe_recent_row_cd, line, whenText)
                    val deleteCd = stringResource(R.string.breathe_delete_cd, whenText)
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                        Column(Modifier.weight(1f).semantics(mergeDescendants = true) { contentDescription = spoken }) {
                            Text(line, style = ApexTheme.type.body, color = colors.foreground)
                            Text(whenText, style = ApexTheme.type.caption, color = colors.mutedForeground)
                            ProvenanceLabel(DataProvenance.USER_REPORTED)
                        }
                        ApexButton(
                            stringResource(R.string.breathe_delete), { onDelete(s.id) },
                            Modifier.semantics { contentDescription = deleteCd }, ApexButtonStyle.Destructive,
                        )
                    }
                    Box(Modifier.fillMaxWidth().height(1.dp).background(colors.border))
                }
            }
        }
    }
}

private fun previewRecent() = listOf(
    SessionRowUi("1", 1_000L, BreathePattern.BOX, "BOX", 180, 180),
    SessionRowUi("2", 2_000L, null, "legacy", 300, 120),
)

@Composable
private fun PreviewBody(theme: ThemePreference, hrv: SpotHrvUi, run: BreatheRun?, reduced: Boolean) = ApexTheme(theme) {
    Box(Modifier.background(ApexTheme.colors.background)) {
        BreatheContent(
            BreathePattern.COHERENT, 180, run, SessionSummary(BreathePattern.BOX, 180, 180, true), WriteOutcome.DEMO,
            previewRecent(), hrv, reduced, { "Today, 07:30" }, {}, {}, {}, {}, {}, {},
        )
    }
}

@Preview(name = "Breathe dark", heightDp = 1200)
@Composable
private fun BreathePreviewDark() = PreviewBody(ThemePreference.DARK, SpotHrvUi.NoStrap, null, false)

@Preview(name = "Breathe light", heightDp = 1200)
@Composable
private fun BreathePreviewLight() = PreviewBody(ThemePreference.LIGHT, SpotHrvUi.Analysed(48.0, 62.0, 80, null), null, false)

@Preview(name = "Breathe running light", heightDp = 1200)
@Composable
private fun BreatheRunningLight() = PreviewBody(ThemePreference.LIGHT, SpotHrvUi.Waiting, BreatheRun(BreathePattern.BOX, 180, 0L), true)
