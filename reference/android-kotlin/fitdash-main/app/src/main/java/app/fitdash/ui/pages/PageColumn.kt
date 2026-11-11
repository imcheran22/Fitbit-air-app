package app.fitdash.ui.pages

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.fitdash.ui.components.Reveal
import app.fitdash.ui.components.TopBar
import app.fitdash.ui.formatDate
import app.fitdash.ui.theme.Palette
import app.fitdash.ui.theme.Space
import app.fitdash.ui.theme.Type
import java.time.LocalDate

data class PageChrome(
    val date: LocalDate,
    val today: LocalDate,
    val error: Boolean,
    val daysBack: Long,
    val onPrev: () -> Unit,
    val onNext: () -> Unit,
    val onPickDate: () -> Unit,
    val onMenu: () -> Unit,
    val onInfo: () -> Unit,
    val onRetry: () -> Unit,
)

@Composable
fun PageColumn(chrome: PageChrome, accent: Color, datePill: Boolean = true, content: LazyListScope.() -> Unit) {
    val top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val bottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    Box(
        Modifier
            .fillMaxSize()
            .clipToBounds()
            .drawBehind {
                drawRect(
                    Brush.radialGradient(
                        listOf(accent.copy(alpha = 0.16f), Color.Transparent),
                        center = Offset(size.width / 2, size.width * 0.35f),
                        radius = size.width * 0.85f,
                    ),
                )
            },
    ) {
        LazyColumn(
            contentPadding = PaddingValues(top = top + Space.s, bottom = bottom + 110.dp),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            item(key = "top") {
                TopBar(
                    dateText = if (datePill) formatDate(chrome.date) else null,
                    canNext = chrome.date < chrome.today,
                    onPrev = chrome.onPrev,
                    onNext = chrome.onNext,
                    onDate = chrome.onPickDate,
                    onMenu = chrome.onMenu,
                    onInfo = chrome.onInfo,
                    canPrev = chrome.date > chrome.today.minusDays(chrome.daysBack),
                )
            }
            if (chrome.error) item(key = "error") { ErrorBanner(chrome.onRetry) }
            content()
        }
    }
}

@Composable
private fun ErrorBanner(onRetry: () -> Unit) {
    Text(
        "Couldn't refresh. Tap to retry.",
        style = Type.small,
        color = Palette.Warn,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().clickable(onClick = onRetry).padding(Space.m),
    )
}

fun LazyListScope.revealItem(key: String, index: Int, content: @Composable () -> Unit) {
    item(key = key) { Reveal(key, index) { content() } }
}
