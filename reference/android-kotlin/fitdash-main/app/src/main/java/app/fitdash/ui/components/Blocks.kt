package app.fitdash.ui.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.foundation.Canvas
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.unit.Dp
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import app.fitdash.ui.LocalPrefs
import app.fitdash.ui.theme.LocalReduceMotion
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.fitdash.metrics.Status
import app.fitdash.ui.theme.Motion
import app.fitdash.ui.theme.Palette
import app.fitdash.ui.theme.Space
import app.fitdash.ui.theme.Type
import app.fitdash.ui.theme.labelCase
import app.fitdash.ui.theme.noteCase

val CardShape: Shape = RoundedCornerShape(24.dp)

@Composable
fun Modifier.cardSurface(): Modifier = clip(CardShape).background(Palette.Card)

@Composable
fun Modifier.tileSurface(tinted: Boolean = false): Modifier =
    clip(CardShape).background(if (tinted) Brush.linearGradient(listOf(Palette.Card, lerp(Palette.Card, Color.Black, 0.06f))) else SolidColor(Palette.Card))

// Every tappable surface: a soft press scale, a light tick when haptics are on, and an accessibility label.
@Composable
fun Modifier.tappable(onClick: (() -> Unit)?, description: String?): Modifier {
    if (onClick == null) return this
    val interaction = remember { MutableInteractionSource() }
    val haptic = LocalHapticFeedback.current
    val haptics = LocalPrefs.current.haptics
    return this
        .pressScale(interaction)
        .clickable(interactionSource = interaction, indication = null, role = Role.Button) {
            if (haptics) haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            onClick()
        }
        .semantics { if (description != null) contentDescription = description }
}

@Composable
fun Modifier.pressScale(interaction: MutableInteractionSource, pressed: Float = 0.965f): Modifier {
    val isPressed by interaction.collectIsPressedAsState()
    val reduce = LocalReduceMotion.current
    val scale by animateFloatAsState(if (isPressed && !reduce) pressed else 1f, Motion.press, label = "press")
    return graphicsLayer { scaleX = scale; scaleY = scale }
}

@Composable
fun ToggleRow(title: String, checked: Boolean, onChange: (Boolean) -> Unit, subtitle: String? = null, modifier: Modifier = Modifier) {
    Row(
        modifier
            .padding(horizontal = Space.l)
            .fillMaxWidth()
            .cardSurface()
            .clickable(role = Role.Switch) { onChange(!checked) }
            .padding(horizontal = Space.l, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f).padding(end = Space.m)) {
            Text(title, style = Type.body.copy(fontSize = 14.sp, fontWeight = FontWeight.Medium), color = Palette.Text)
            if (subtitle != null) Text(subtitle, style = Type.secondary, color = Palette.Muted, modifier = Modifier.padding(top = 2.dp))
        }
        Switch(
            checked, onChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = Palette.Background, checkedTrackColor = Palette.Accent,
                uncheckedThumbColor = Palette.Muted, uncheckedTrackColor = Palette.Chip, uncheckedBorderColor = Palette.Divider,
            ),
        )
    }
}

@Composable
fun SectionCard(
    label: String,
    modifier: Modifier = Modifier,
    trailing: String? = null,
    trailingColor: Color = Palette.Muted,
    onClick: (() -> Unit)? = null,
    description: String? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier
            .padding(horizontal = Space.l)
            .fillMaxWidth()
            .cardSurface()
            .tappable(onClick, description)
            .padding(horizontal = Space.l, vertical = Space.l),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(labelCase(label), style = Type.label, color = Palette.Muted)
            if (trailing != null) Text(noteCase(trailing), style = Type.tiny, color = trailingColor)
        }
        Spacer(Modifier.height(Space.s))
        content()
    }
}

@Composable
fun SectionLabel(text: String) {
    Text(labelCase(text), style = Type.label, color = Palette.Muted, modifier = Modifier.padding(start = Space.xl, end = Space.xl, top = Space.s))
}

@Composable
fun ValueText(value: String, unit: String?, modifier: Modifier = Modifier, style: TextStyle = Type.value, color: Color = Palette.Text) {
    Text(
        buildAnnotatedString {
            append(value)
            if (!unit.isNullOrEmpty()) withStyle(Type.unit.toSpanStyle().copy(color = Palette.Muted)) { append(" ${noteCase(unit)}") }
        },
        modifier,
        style = style,
        color = color,
    )
}

@Composable
fun EmptyState(title: String, body: String) {
    Column(
        Modifier.fillMaxWidth().padding(horizontal = Space.xxl, vertical = Space.xxl),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Orb(null, diameter = 140.dp) {}
        Spacer(Modifier.height(Space.xl))
        Text(title, style = Type.value, color = Palette.Text, textAlign = TextAlign.Center)
        Text(body, style = Type.body, color = Palette.Muted, textAlign = TextAlign.Center, modifier = Modifier.padding(top = Space.s))
    }
}

@Composable
fun Reveal(key: String, index: Int = 0, content: @Composable () -> Unit) {
    val progress = rememberDrawProgress("reveal-$key", Motion.ENTER, index * Motion.STAGGER)
    Box(Modifier.graphicsLayer { alpha = progress.value; translationY = (1 - progress.value) * 14.dp.toPx() }) { content() }
}

@Composable
fun EmptyTrack() {
    Box(Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)).background(Chart.track))
}

fun statusWord(status: Status) = when (status) {
    Status.OPTIMAL -> "OPTIMAL"
    Status.GOOD -> "GOOD"
    Status.FAIR -> "FAIR"
    Status.ATTENTION -> "NEEDS ATTENTION"
    Status.BELOW_USUAL -> "BELOW YOUR USUAL"
}

@Composable
@ReadOnlyComposable
fun statusColour(status: Status): Color = when (status) {
    Status.OPTIMAL, Status.GOOD -> Palette.Good
    Status.FAIR, Status.BELOW_USUAL -> Palette.Warn
    Status.ATTENTION -> Palette.Bad
}

@Composable
fun StatusText(status: Status, modifier: Modifier = Modifier) {
    Text(noteCase(statusWord(status)), modifier, style = Type.status, color = statusColour(status))
}

@Composable
fun NumberWithUnits(parts: List<Pair<String, String>>, modifier: Modifier = Modifier, style: TextStyle = Type.tile) {
    Row(modifier) {
        parts.forEachIndexed { i, (number, unit) ->
            val still = LocalReduceMotion.current
            AnimatedContent(
                number,
                Modifier.alignByBaseline(),
                transitionSpec = {
                    if (still) EnterTransition.None togetherWith ExitTransition.None
                    else (slideInVertically { it / 2 } + fadeIn()) togetherWith (slideOutVertically { -it / 2 } + fadeOut())
                },
                label = "number",
            ) { n -> Text(n, style = style, color = Palette.Text) }
            Text(
                noteCase(unit),
                Modifier.alignByBaseline().padding(start = 2.dp, end = if (i < parts.lastIndex) Space.xs + 2.dp else 0.dp),
                style = Type.unit,
                color = Palette.Muted,
            )
        }
    }
}

@Composable
fun Heading(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        modifier.padding(start = Space.xl, end = Space.xl, top = Space.s),
        style = Type.body.copy(fontSize = 15.sp, fontWeight = FontWeight.Medium),
        color = Palette.Text,
    )
}

@Composable
fun ListRow(
    icon: ImageVector,
    title: String,
    subtitle: String?,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
    divider: Boolean = false,
) {
    val line = Palette.GroupDivider
    Row(
        modifier
            .fillMaxWidth()
            .tappable(onClick, null)
            .drawBehind { if (divider) drawRect(line, size = Size(size.width, 1.dp.toPx())) }
            .padding(Space.s),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(36.dp).clip(CircleShape).background(Palette.ChipStrong), contentAlignment = Alignment.Center) {
            Icon(icon, null, Modifier.size(16.dp), tint = Palette.Accent)
        }
        Column(Modifier.weight(1f).padding(horizontal = Space.m)) {
            Text(title, style = Type.body.copy(fontSize = 14.sp, fontWeight = FontWeight.Medium), color = Palette.Text)
            if (subtitle != null) Text(subtitle, style = Type.secondary, color = Palette.Muted, modifier = Modifier.padding(top = 2.dp))
        }
        if (trailing != null) trailing()
        else if (onClick != null) Icon(NavIcons.chevronRight, null, Modifier.size(16.dp), tint = Palette.Faint)
    }
}

// A small up or down triangle for deltas, drawn so it looks the same on every device font.
@Composable
fun DeltaArrow(up: Boolean, modifier: Modifier = Modifier, size: Dp = 7.dp) {
    val colour = if (up) Palette.Good else Palette.Bad
    Canvas(modifier.size(size)) {
        val path = Path().apply {
            if (up) { moveTo(0f, this@Canvas.size.height); lineTo(this@Canvas.size.width / 2, 0f); lineTo(this@Canvas.size.width, this@Canvas.size.height) }
            else { moveTo(0f, 0f); lineTo(this@Canvas.size.width, 0f); lineTo(this@Canvas.size.width / 2, this@Canvas.size.height) }
            close()
        }
        drawPath(path, colour)
    }
}

@Composable
fun SegmentedControl(options: List<String>, selected: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(12.dp)
    Row(modifier.padding(horizontal = Space.l).fillMaxWidth().clip(shape).background(Palette.Chip).padding(3.dp)) {
        options.forEachIndexed { i, option ->
            val on = i == selected
            Text(
                option.uppercase(),
                Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(10.dp))
                    .background(if (on) Palette.ChipStrong else Color.Transparent)
                    .clickable(role = Role.Tab) { onSelect(i) }
                    .padding(vertical = 11.dp),
                style = Type.label,
                color = if (on) Palette.Text else Palette.Muted,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
fun Pill(text: String, colour: Color, border: Color, onClick: () -> Unit, modifier: Modifier, icon: ImageVector? = null) {
    val shape = RoundedCornerShape(14.dp)
    Row(
        modifier
            .clip(shape)
            .border(1.dp, border, shape)
            .tappable(onClick, null)
            .heightIn(min = 48.dp)
            .padding(vertical = 13.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) Icon(icon, null, Modifier.padding(end = 6.dp).size(12.dp), tint = colour)
        Text(text, style = Type.label, color = colour, textAlign = TextAlign.Center)
    }
}
