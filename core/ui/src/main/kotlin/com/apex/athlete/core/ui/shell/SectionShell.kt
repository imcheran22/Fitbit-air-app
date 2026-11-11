package com.apex.athlete.core.ui.shell

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.ApexPreview
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme

/**
 * A titled group of cards (Pulse 4.7): sentence-case section title (a TalkBack heading), optional trailing
 * action, then [content] with the standard 12 dp gap between cards.
 */
@Composable
fun SectionShell(
    title: String,
    modifier: Modifier = Modifier,
    trailing: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                title,
                style = ApexTheme.type.sectionTitle,
                color = ApexTheme.colors.foreground,
                modifier = Modifier.weight(1f).semantics { heading() },
            )
            if (trailing != null) trailing()
        }
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(ApexSpacing.cardGap), content = content)
    }
}

@Preview(name = "SectionShell dark")
@Composable
private fun SectionShellPreviewDark() = ApexPreview(dark = true) { SectionShellPreviewBody() }

@Preview(name = "SectionShell light")
@Composable
private fun SectionShellPreviewLight() = ApexPreview(dark = false) { SectionShellPreviewBody() }

@Composable
private fun SectionShellPreviewBody() {
    SectionShell("My day") {
        ApexCard { Text("Card", color = ApexTheme.colors.foreground, style = ApexTheme.type.body) }
        ApexCard { Text("Card", color = ApexTheme.colors.foreground, style = ApexTheme.type.body) }
    }
}
