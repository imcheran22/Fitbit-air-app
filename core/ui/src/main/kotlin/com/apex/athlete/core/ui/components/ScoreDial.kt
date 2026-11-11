package com.apex.athlete.core.ui.components

import androidx.annotation.StringRes
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.R
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.state.MetricFormat
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.state.metricReasonText
import com.apex.athlete.core.ui.state.metricSpoken
import com.apex.athlete.core.ui.state.metricValueAnnotated
import com.apex.athlete.core.ui.state.numberOrNull
import com.apex.athlete.core.ui.theme.ApexColors
import com.apex.athlete.core.ui.theme.ApexDial
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.core.ui.theme.RecoveryBand
import com.apex.athlete.core.ui.theme.recoveryBandOf
import com.apex.athlete.core.ui.theme.recoveryFill
import kotlin.math.min
import kotlin.math.roundToInt

/** Dial sizes (DESIGN_SYSTEM.md section 5): mini 22, small 56, home 96, hero 240 dp. */
enum class DialSize(val diameter: Dp, val stroke: Dp) {
    Mini(ApexDial.miniDiameter, ApexDial.miniStroke),
    Small(ApexDial.smallDiameter, ApexDial.smallStroke),
    Home(ApexDial.homeDiameter, ApexDial.homeStroke),
    Hero(ApexDial.heroDiameter, ApexDial.heroStroke),
}

enum class DialVariant { Recovery, Strain, Sleep, Stat }

@StringRes
internal fun bandWordRes(band: RecoveryBand): Int = when (band) {
    RecoveryBand.GREEN -> R.string.band_green
    RecoveryBand.YELLOW -> R.string.band_yellow
    RecoveryBand.RED -> R.string.band_red
}

private fun ApexColors.dialFill(variant: DialVariant, number: Double?, statColor: Color?): Color = when (variant) {
    DialVariant.Recovery -> if (number != null) recoveryFill(recoveryBandOf(number.roundToInt())) else dialTrack
    DialVariant.Strain -> strain
    DialVariant.Sleep -> sleep
    DialVariant.Stat -> statColor ?: foreground
}

/** The largest font scale the fixed-geometry dial centre honours; the label and provenance outside the ring wrap freely. */
private const val DIAL_CENTRE_MAX_FONT_SCALE = 1.3f

/**
 * Score dial (the master prompt's `ArcGauge`). Clockwise from 12 o'clock after a 4 degree gap each side,
 * flat caps, track `dialTrack`. Sweeps 700 ms from 0 on first show and from the previous value on change
 * (snaps under reduced motion). Strain uses a 0-21.0 scale (full at 21) and draws [strainTarget] as an arc
 * on the track with a tick at its middle. States without a number show the full track, no fill, and `--`.
 *
 * - [state] numeric state; unit defaults to `%` for Recovery and Sleep when not given.
 * - [label] caps label ("Recovery"): inside the ring on Hero, below it on Small/Home, beside it on Mini via [MiniRing].
 * - [decorative] true removes all semantics (used inside a parent that carries the description).
 * - [onClick] makes the dial a link to its detail screen.
 */
@Composable
fun ScoreDial(
    state: MetricState,
    variant: DialVariant,
    size: DialSize,
    label: String,
    modifier: Modifier = Modifier,
    max: Double = if (variant == DialVariant.Strain) DialMath.STRAIN_MAX else DialMath.PERCENT_MAX,
    strainTarget: ClosedFloatingPointRange<Double>? = null,
    statColor: Color? = null,
    showWordmark: Boolean = true,
    showProvenance: Boolean = size != DialSize.Mini,
    decorative: Boolean = false,
    onClick: (() -> Unit)? = null,
) {
    val colors = ApexTheme.colors
    val number = state.numberOrNull()
    val band = if (variant == DialVariant.Recovery && number != null) recoveryBandOf(number.roundToInt()) else null
    val bandWord = band?.let { stringResource(bandWordRes(it)) }
    val targetText: String? = if (variant == DialVariant.Strain && strainTarget != null && DialMath.targetArc(strainTarget.start, strainTarget.endInclusive) != null) {
        stringResource(
            R.string.cd_dial_target,
            MetricFormat.number(strainTarget.start, 1),
            MetricFormat.number(strainTarget.endInclusive, 1),
        )
    } else {
        null
    }
    val spoken = metricSpoken(label, state, extras = listOfNotNull(bandWord, targetText))

    val interaction = remember { MutableInteractionSource() }
    var outer = modifier
    if (onClick != null && !decorative) {
        outer = outer.apexClickable(onClick = onClick, role = Role.Button, interactionSource = interaction).minTouchTarget()
    }
    if (!decorative) {
        outer = outer.semantics(mergeDescendants = true) {
            contentDescription = spoken
            if (onClick == null) role = Role.Image
        }
    }

    val fillColor = colors.dialFill(variant, number, statColor)
    val fillAlpha = if (state is MetricState.Stale) 0.5f else 1f
    val fraction = if (number == null) 0f else DialMath.fraction(number, max)
    val target = remember(strainTarget, variant) {
        if (variant == DialVariant.Strain && strainTarget != null) DialMath.targetArc(strainTarget.start, strainTarget.endInclusive) else null
    }
    val tick = remember(strainTarget, variant) {
        if (variant == DialVariant.Strain && strainTarget != null) DialMath.tickArc(strainTarget.start, strainTarget.endInclusive) else null
    }

    when (size) {
        DialSize.Mini -> Box(outer.size(size.diameter)) {
            DialRing(state, size, fraction, fillColor, fillAlpha, target, tick)
        }
        DialSize.Hero -> Column(outer, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.size(size.diameter), contentAlignment = Alignment.Center) {
                DialRing(state, size, fraction, fillColor, fillAlpha, target, tick)
                if (state !is MetricState.Loading) {
                    HeroCentre(state, variant, label, bandWord, showWordmark)
                }
            }
            if (state is MetricState.Calibrating || state is MetricState.Unavailable || state is MetricState.Error) {
                Text(
                    text = metricReasonText(state).orEmpty(),
                    style = ApexTheme.type.caption,
                    color = colors.mutedForeground,
                    textAlign = TextAlign.Center,
                )
            }
            if (showProvenance) MetricProvenance(state)
        }
        DialSize.Small, DialSize.Home -> Column(
            outer.width(maxOf(size.diameter, ApexSpacing.minTouch)),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Box(Modifier.size(size.diameter), contentAlignment = Alignment.Center) {
                DialRing(state, size, fraction, fillColor, fillAlpha, target, tick)
                if (state !is MetricState.Loading) {
                    CompactCentre(state, variant, size)
                }
            }
            if (state is MetricState.Loading) {
                SkeletonLine(width = 48.dp)
            } else {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        text = label.uppercase(),
                        style = if (size == DialSize.Home) ApexTheme.type.dialLabel else ApexTheme.type.caption,
                        color = colors.foreground,
                        textAlign = TextAlign.Center,
                    )
                    if (onClick != null && size == DialSize.Home) {
                        Icon(ApexIcons.ChevronRight, contentDescription = null, tint = colors.foreground, modifier = Modifier.size(12.dp))
                    }
                }
                if (state is MetricState.Calibrating || state is MetricState.Unavailable || state is MetricState.Error) {
                    ReasonPlaceholder(state, size = ReasonSize.Small)
                }
                if (showProvenance) MetricProvenance(state)
            }
        }
    }
}

@Composable
private fun DialRing(
    state: MetricState,
    size: DialSize,
    fraction: Float,
    fillColor: Color,
    fillAlpha: Float,
    target: DialMath.Arc?,
    tick: DialMath.Arc?,
) {
    if (state is MetricState.Loading) {
        SkeletonRing(size.diameter, size.stroke)
        return
    }
    val colors = ApexTheme.colors
    val trackColor = colors.dialTrack
    val targetColor = colors.dialTarget
    val tickColor = colors.foreground
    val strokePx = with(LocalDensity.current) { size.stroke.toPx() }
    val style = remember(strokePx) { Stroke(width = strokePx, cap = StrokeCap.Butt) }
    val sweep = rememberSweep(fraction)
    Canvas(Modifier.size(size.diameter)) {
        val inset = strokePx / 2f
        val topLeft = Offset(inset, inset)
        val arcSize = Size(this.size.width - strokePx, this.size.height - strokePx)
        drawArc(
            color = trackColor,
            startAngle = DialMath.START_ANGLE,
            sweepAngle = DialMath.TRACK_SWEEP,
            useCenter = false,
            topLeft = topLeft,
            size = arcSize,
            style = style,
        )
        if (target != null) {
            drawArc(targetColor, target.start, target.sweep, false, topLeft, arcSize, style = style)
        }
        if (tick != null) {
            drawArc(tickColor, tick.start, tick.sweep, false, topLeft, arcSize, style = style)
        }
        val fillSweep = DialMath.sweepFor(sweep.value)
        if (fillSweep > 0f) {
            drawArc(fillColor, DialMath.START_ANGLE, fillSweep, false, topLeft, arcSize, alpha = fillAlpha, style = style)
        }
    }
}

private fun TextStyle.unitStyle(): TextStyle = copy(
    fontSize = (fontSize.value * 0.55f).let { TextUnit(it, fontSize.type) },
    lineHeight = TextUnit.Unspecified,
    fontWeight = FontWeight.SemiBold,
    letterSpacing = TextUnit.Unspecified,
)

@Composable
private fun dialUnit(state: MetricState, variant: DialVariant): String? {
    val unit = when (state) {
        is MetricState.Value -> state.unit
        is MetricState.Stale -> state.unit
        else -> null
    }
    return unit ?: if (variant == DialVariant.Recovery || variant == DialVariant.Sleep) "%" else null
}

@Composable
private fun dialNumber(state: MetricState): String = when (state) {
    is MetricState.Value -> state.numberText()
    is MetricState.Stale -> state.numberText()
    else -> MetricFormat.MISSING
}

@Composable
private fun CompactCentre(state: MetricState, variant: DialVariant, size: DialSize) {
    val colors = ApexTheme.colors
    val density = LocalDensity.current
    val capped = Density(density.density, min(density.fontScale, DIAL_CENTRE_MAX_FONT_SCALE))
    val hasNumber = state.numberOrNull() != null
    val base = when (size) {
        DialSize.Small -> ApexTheme.type.dialSmall
        DialSize.Home -> if (variant == DialVariant.Recovery) ApexTheme.type.dialHomeLarge else ApexTheme.type.dialHome
        else -> ApexTheme.type.dialHome
    }
    val tint = if (hasNumber) colors.foreground else colors.mutedForeground
    CompositionLocalProvider(LocalDensity provides capped) {
        Text(
            text = metricValueAnnotated(
                number = dialNumber(state),
                unit = if (hasNumber) dialUnit(state, variant) else null,
                valueStyle = base.copy(color = tint),
                unitStyle = base.unitStyle().copy(color = colors.foregroundSecondary),
            ),
            maxLines = 1,
            overflow = TextOverflow.Clip,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun HeroCentre(state: MetricState, variant: DialVariant, label: String, bandWord: String?, showWordmark: Boolean) {
    val colors = ApexTheme.colors
    val density = LocalDensity.current
    val capped = Density(density.density, min(density.fontScale, DIAL_CENTRE_MAX_FONT_SCALE))
    val hasNumber = state.numberOrNull() != null
    val base = ApexTheme.type.dialHero
    CompositionLocalProvider(LocalDensity provides capped) {
        Column(
            Modifier.padding(horizontal = ApexDial.heroStroke + 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            if (showWordmark) {
                Text(
                    text = stringResource(R.string.brand_wordmark).uppercase(),
                    style = ApexTheme.type.wordmark,
                    color = colors.mutedForeground,
                    maxLines = 1,
                )
            }
            Text(
                text = metricValueAnnotated(
                    number = dialNumber(state),
                    unit = if (hasNumber) dialUnit(state, variant) else null,
                    valueStyle = base.copy(color = if (hasNumber) colors.foreground else colors.mutedForeground),
                    unitStyle = base.unitStyle().copy(color = colors.foregroundSecondary),
                ),
                maxLines = 1,
                overflow = TextOverflow.Clip,
            )
            Text(
                text = label.uppercase(),
                style = ApexTheme.type.dialLabel,
                color = colors.foreground,
                textAlign = TextAlign.Center,
                maxLines = 2,
            )
            if (bandWord != null) {
                Text(
                    text = bandWord.uppercase(),
                    style = ApexTheme.type.dialLabel,
                    color = colors.foregroundSecondary,
                    maxLines = 1,
                )
            }
            if (state is MetricState.Value && state.isProvisional) {
                Tag(stringResource(R.string.tag_provisional))
            }
            if (state is MetricState.Calibrating || state is MetricState.Unavailable || state is MetricState.Error) {
                ReasonPlaceholder(
                    text = metricReasonText(state, short = true).orEmpty(),
                    icon = reasonIcon(state),
                    size = ReasonSize.Small,
                )
            }
        }
    }
}

/**
 * Header ring: a 22 dp ring with its caps label beside it, one 48 dp target (Pulse 4.3 ring row).
 * The ring is decorative; the node carries the spoken sentence.
 */
@Composable
fun MiniRing(
    state: MetricState,
    variant: DialVariant,
    label: String,
    modifier: Modifier = Modifier,
    max: Double = if (variant == DialVariant.Strain) DialMath.STRAIN_MAX else DialMath.PERCENT_MAX,
    statColor: Color? = null,
    onClick: (() -> Unit)? = null,
) {
    val spoken = metricSpoken(label, state)
    var outer = modifier
    if (onClick != null) outer = outer.apexClickable(onClick = onClick, role = Role.Button)
    Row(
        outer
            .minTouchTarget()
            .semantics(mergeDescendants = true) { contentDescription = spoken },
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ScoreDial(state, variant, DialSize.Mini, label, max = max, statColor = statColor, decorative = true)
        Text(label.uppercase(), style = ApexTheme.type.tag, color = ApexTheme.colors.foreground, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Preview(name = "Dials dark", heightDp = 900)
@Composable
private fun DialsPreviewDark() = ApexPreview(dark = true) { DialsPreviewBody() }

@Preview(name = "Dials light", heightDp = 900)
@Composable
private fun DialsPreviewLight() = ApexPreview(dark = false) { DialsPreviewBody() }

@Composable
private fun DialsPreviewBody() {
    val derived = DataProvenance.MATHEMATICALLY_DERIVED
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            ScoreDial(MetricState.Value(90.0, 0, "%", derived, "now"), DialVariant.Sleep, DialSize.Home, "Sleep", onClick = {})
            ScoreDial(MetricState.Value(94.0, 0, "%", derived, "now"), DialVariant.Recovery, DialSize.Home, "Recovery", onClick = {})
            ScoreDial(MetricState.Value(9.4, 1, null, derived, "so far"), DialVariant.Strain, DialSize.Home, "Strain", strainTarget = 10.0..14.0, onClick = {})
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            ScoreDial(MetricState.Loading, DialVariant.Recovery, DialSize.Small, "Recovery")
            ScoreDial(MetricState.Calibrating(4), DialVariant.Recovery, DialSize.Small, "Recovery")
            ScoreDial(MetricState.Unavailable(MetricReason.NOT_WORN), DialVariant.Sleep, DialSize.Small, "Sleep")
        }
        MiniRing(MetricState.Value(58.0, 0, "%", derived, "now"), DialVariant.Recovery, "Recovery")
        ScoreDial(
            MetricState.Value(72.0, 0, "%", derived, "now", isProvisional = true),
            DialVariant.Recovery, DialSize.Hero, "Recovery",
        )
    }
}
