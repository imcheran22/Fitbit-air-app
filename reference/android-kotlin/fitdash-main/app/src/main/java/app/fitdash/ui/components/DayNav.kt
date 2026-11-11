package app.fitdash.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.foundation.layout.heightIn
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import app.fitdash.ui.theme.LocalReduceMotion
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import app.fitdash.ui.LocalPrefs
import app.fitdash.ui.theme.Motion
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.fitdash.ui.theme.Palette
import androidx.compose.ui.text.font.FontWeight
import app.fitdash.ui.theme.Space
import app.fitdash.ui.theme.Type
import java.time.LocalDate
import java.time.format.TextStyle
import java.util.Locale

// Seven days around the selected day, never past today. The selected chip lifts and turns plum.
@Composable
fun WeekStrip(days: List<LocalDate>, selected: LocalDate, hasData: Set<LocalDate>, onSelect: (LocalDate) -> Unit, modifier: Modifier = Modifier, enabled: (LocalDate) -> Boolean = { true }) {
    val haptic = LocalHapticFeedback.current
    val haptics = LocalPrefs.current.haptics
    val reduce = LocalReduceMotion.current
    val shape = RoundedCornerShape(12.dp)
    Row(modifier.fillMaxWidth().padding(horizontal = Space.l), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        days.forEach { day ->
            val on = day == selected
            val active = enabled(day)
            val lift by animateFloatAsState(if (on) 1f else 0f, if (reduce) snap() else Motion.settle, label = "strip-lift")
            val f = lift.coerceIn(0f, 1f)
            val interaction = remember { MutableInteractionSource() }
            Column(
                Modifier
                    .weight(1f)
                    .alpha(if (active) 1f else 0.3f)
                    .pressScale(interaction, 0.92f)
                    .graphicsLayer { translationY = -2.dp.toPx() * lift }
                    .shadow(8.dp * f, shape, ambientColor = Palette.Accent.copy(alpha = 0.25f), spotColor = Palette.Accent.copy(alpha = 0.25f))
                    .clip(shape)
                    .background(lerp(Palette.Card.copy(alpha = 0.75f), Palette.Accent, f))
                    .clickable(interactionSource = interaction, indication = null, enabled = active, role = Role.Button) {
                        if (haptics) haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        onSelect(day)
                    }
                    .semantics(mergeDescendants = true) {
                        contentDescription = "${day.dayOfWeek.getDisplayName(TextStyle.FULL, Locale.ENGLISH)} ${day.dayOfMonth}"
                        this.selected = on
                    }
                    .heightIn(min = 48.dp)
                    .padding(top = 5.dp, bottom = 6.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(day.dayOfWeek.getDisplayName(TextStyle.NARROW, Locale.ENGLISH), style = Type.tiny.copy(fontWeight = FontWeight.SemiBold), color = lerp(Palette.Muted, Palette.OnAccent.copy(alpha = 0.63f), f))
                Text(day.dayOfMonth.toString(), style = Type.small.copy(fontSize = 13.sp, fontWeight = FontWeight.SemiBold), color = lerp(Palette.Text, Palette.OnAccent, f))
                Box(Modifier.padding(top = 2.dp).size(4.dp).clip(CircleShape).background(if (day !in hasData) Color.Transparent else if (on) Palette.Sun else Palette.Light))
            }
        }
    }
}

// 48 dp tap target around a 38 dp visible circle.
@Composable
private fun CircleButton(icon: ImageVector, description: String, onClick: () -> Unit) {
    Box(
        Modifier
            .size(48.dp)
            .clip(CircleShape)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.size(46.dp).clip(CircleShape).background(Palette.Chip), contentAlignment = Alignment.Center) {
            Icon(icon, null, Modifier.size(19.dp), tint = Palette.Text)
        }
    }
}

@Composable
private fun ArrowButton(icon: ImageVector, description: String, enabled: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .size(44.dp)
            .alpha(if (enabled) 1f else 0.3f)
            .clip(CircleShape)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, null, Modifier.size(16.dp), tint = Palette.Text)
    }
}

@Composable
fun TopBar(
    dateText: String?,
    canNext: Boolean,
    onPrev: () -> Unit,
    onNext: () -> Unit,
    onDate: () -> Unit,
    onMenu: () -> Unit,
    onInfo: () -> Unit,
    modifier: Modifier = Modifier,
    canPrev: Boolean = true,
) {
    Row(modifier.fillMaxWidth().padding(horizontal = Space.l), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        CircleButton(NavIcons.menu, "Menu", onMenu)
        if (dateText == null) CircleButton(NavIcons.calendar, "Pick a date", onDate)
        else Row(verticalAlignment = Alignment.CenterVertically) {
            ArrowButton(NavIcons.chevronLeft, "Previous day", canPrev, onPrev)
            Text(
                dateText,
                Modifier
                    .clip(RoundedCornerShape(20.dp))
                    .background(Palette.ChipStrong)
                    .clickable(role = Role.Button, onClick = onDate)
                    .semantics { contentDescription = "Pick a date" }
                    .padding(horizontal = 18.dp, vertical = 10.dp),
                style = Type.body.copy(fontSize = 15.sp, fontWeight = FontWeight.Medium), color = Palette.Text,
            )
            ArrowButton(NavIcons.chevronRight, "Next day", canNext, onNext)
        }
        CircleButton(NavIcons.info, "Info", onInfo)
    }
}
