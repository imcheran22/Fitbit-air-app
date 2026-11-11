package com.apex.athlete.core.ui.shell

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.ApexPreview
import com.apex.athlete.core.ui.components.InsightCard
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme

/**
 * Detail screen layout (Pulse 4.6): [DetailHeader], an optional pinned [banner], then one scrolling column of
 * [hero] (centred), [insight], [primary] cards (12 dp gaps) and [secondary] sections (32 dp above).
 * [bottomPadding] should be the scaffold's content padding (or 24 dp when the bar is hidden).
 */
@Composable
fun DetailShell(
    title: String,
    onBack: () -> Unit,
    backDescription: String,
    modifier: Modifier = Modifier,
    onInfo: (() -> Unit)? = null,
    infoDescription: String? = null,
    bottomPadding: Dp = ApexSpacing.xl,
    banner: (@Composable () -> Unit)? = null,
    hero: @Composable () -> Unit,
    insight: (@Composable () -> Unit)? = null,
    primary: @Composable ColumnScope.() -> Unit = {},
    secondary: (@Composable ColumnScope.() -> Unit)? = null,
) {
    Column(modifier.fillMaxSize()) {
        DetailHeader(title, onBack, backDescription, onInfo = onInfo, infoDescription = infoDescription)
        if (banner != null) Box(Modifier.padding(horizontal = ApexSpacing.gutter, vertical = 8.dp)) { banner() }
        Column(
            Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = ApexSpacing.gutter),
            verticalArrangement = Arrangement.spacedBy(ApexSpacing.xl),
        ) {
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { hero() }
            if (insight != null) insight()
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(ApexSpacing.cardGap), content = primary)
            if (secondary != null) {
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(ApexSpacing.sectionGap), content = secondary)
            }
            Spacer(Modifier.height(bottomPadding))
        }
    }
}

@Preview(name = "DetailShell dark", heightDp = 600)
@Composable
private fun DetailShellPreviewDark() = ApexPreview(dark = true) { DetailShellPreviewBody() }

@Preview(name = "DetailShell light", heightDp = 600)
@Composable
private fun DetailShellPreviewLight() = ApexPreview(dark = false) { DetailShellPreviewBody() }

@Composable
private fun DetailShellPreviewBody() {
    DetailShell(
        title = "Today",
        onBack = {},
        backDescription = "Back",
        onInfo = {},
        infoDescription = "How this is calculated",
        hero = { Text("94%", style = ApexTheme.type.dialHero, color = ApexTheme.colors.foreground) },
        insight = { InsightCard("Your HRV is above your baseline, which lifted Recovery today.") },
        primary = { ApexCard { Text("Primary", style = ApexTheme.type.body, color = ApexTheme.colors.foreground) } },
        secondary = { ApexCard { Text("Secondary", style = ApexTheme.type.body, color = ApexTheme.colors.foreground) } },
    )
}
