package app.fitdash.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import app.fitdash.metrics.Status
import app.fitdash.ui.theme.FitdashTheme
import app.fitdash.ui.theme.Space
import app.fitdash.ui.theme.ThemedBackground
import app.fitdash.ui.theme.Tint
import androidx.compose.foundation.layout.Box
import java.time.LocalDate

private val SunDay = LocalDate.of(2026, 10, 11)

@Composable
private fun ThemePreview(content: @Composable () -> Unit) {
    FitdashTheme {
        CompositionLocalProvider(LocalRevealed provides mutableSetOf("gauge-Sleep-83", "span-12:40 AM-9:56 AM")) {
            Box {
                ThemedBackground()
                Column(Modifier.padding(vertical = Space.l)) { content() }
            }
        }
    }
}

@Composable
private fun OrbSample() = Orb(79) {
    Text("79", style = app.fitdash.ui.theme.Type.hero)
}

@Composable
private fun GaugeSample() {
    SemiGauge(83, "Sleep", Status.GOOD)
    SpanBar("12:40 AM", "9:56 AM", from = 0.08f, to = 0.94f, modifier = Modifier.padding(horizontal = 22.dp))
}

@Composable
private fun WeekSample() = WeekStrip((5..11).map { SunDay.withDayOfMonth(it) }, SunDay, setOf(SunDay, SunDay.minusDays(2), SunDay.minusDays(4)), {})

@Composable
private fun TopBarSample() = TopBar("Sun · 11 Oct", canNext = false, onPrev = {}, onNext = {}, onDate = {}, onMenu = {}, onInfo = {})

@Composable
private fun CardSizesSample() {
    HeroCard(null, "Sleep") { Text("7h 54m", style = app.fitdash.ui.theme.Type.hero) }
    Spacer(Modifier.height(Space.s))
    TileGrid(listOf(
        { m -> StatTile("Steps", "8,420", null, "of 10,000", m, tint = Tint.SKY) {} },
        { m -> StatTile("Recovery", "82", null, "Above your usual", m, tint = Tint.ROSE) {} },
    ))
    Spacer(Modifier.height(Space.s))
    RowGroup {
        ListRow(NavIcons.heart, "Heart rate", "62 bpm resting")
        ListRow(NavIcons.cup, "Water", "1.25 L of 2.5 L", onClick = {}, trailing = { Text("+") }, divider = true)
    }
    Spacer(Modifier.height(Space.s))
    StripCard(null, "Water", tint = Tint.WATER) { Text("1.25 L of 2.5 L goal") }
}

@Preview(showBackground = true) @Composable private fun CardSizes() = ThemePreview { CardSizesSample() }
@Preview(showBackground = true, fontScale = 1.3f) @Composable private fun CardSizesLarge() = ThemePreview { CardSizesSample() }
@Preview(showBackground = true) @Composable private fun OrbLook() = ThemePreview { OrbSample() }
@Preview(showBackground = true) @Composable private fun GaugeLook() = ThemePreview { GaugeSample() }
@Preview(showBackground = true) @Composable private fun WeekLook() = ThemePreview { WeekSample() }
@Preview(showBackground = true) @Composable private fun TopBarLook() = ThemePreview { TopBarSample() }
