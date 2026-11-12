package com.apex.athlete.ui.licences

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.apex.athlete.R
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.apexClickable
import com.apex.athlete.core.ui.components.hideFromTalkBack
import com.apex.athlete.core.ui.components.minTouchTarget
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.shell.DetailHeader
import com.apex.athlete.core.ui.shell.SectionShell
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.core.ui.theme.ThemePreference
import com.apex.athlete.navigation.ApexNavigator

@Composable
fun LicencesRoute(navigator: ApexNavigator) {
    LicencesContent(onBack = navigator::back)
}

@Composable
internal fun LicencesContent(onBack: () -> Unit) {
    val colors = ApexTheme.colors
    Column(Modifier.fillMaxSize()) {
        DetailHeader(
            title = stringResource(R.string.licences_title),
            onBack = onBack,
            backDescription = stringResource(R.string.common_back),
        )
        Column(
            Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = ApexSpacing.gutter),
            verticalArrangement = Arrangement.spacedBy(ApexSpacing.sectionGap),
        ) {
            Text(stringResource(R.string.licences_intro), style = ApexTheme.type.body, color = colors.foregroundBody)
            SectionShell(stringResource(R.string.licences_section_libraries)) {
                ApexCard { libraryEntries.forEach { EntryRow(it) } }
            }
            SectionShell(stringResource(R.string.licences_section_fonts)) {
                ApexCard { fontEntries.forEach { EntryRow(it) } }
            }
            SectionShell(stringResource(R.string.licences_section_texts)) {
                usedLicences().forEach { LicenceText(it) }
            }
            Spacer(Modifier.height(ApexSpacing.xl))
        }
    }
}

@Composable
private fun EntryRow(entry: LicenceEntry) {
    val colors = ApexTheme.colors
    val name = stringResource(entry.name)
    val licence = stringResource(entry.licence.displayName)
    val notice = entry.notice?.let { stringResource(it) }
    val spoken = listOfNotNull(stringResource(R.string.licences_entry_description, name, licence), notice).joinToString(". ")
    Column(
        Modifier
            .fillMaxWidth()
            .minTouchTarget()
            .padding(vertical = 8.dp)
            .semantics(mergeDescendants = true) { contentDescription = spoken },
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(name, style = ApexTheme.type.body, color = colors.foreground, modifier = Modifier.hideFromTalkBack())
        Text(licence, style = ApexTheme.type.caption, color = colors.mutedForeground, modifier = Modifier.hideFromTalkBack())
        if (notice != null) {
            Text(notice, style = ApexTheme.type.caption, color = colors.mutedForeground, modifier = Modifier.hideFromTalkBack())
        }
    }
}

/** A collapsible licence text. Raw text is read from `res/raw` only when first opened. */
@Composable
private fun LicenceText(kind: LicenceKind) {
    val colors = ApexTheme.colors
    var expanded by rememberSaveable(kind.name) { mutableStateOf(false) }
    val title = stringResource(kind.textTitle)
    val action = stringResource(if (expanded) R.string.licences_text_hide else R.string.licences_text_show)
    val spoken = stringResource(R.string.licences_text_toggle_description, title, action)
    ApexCard {
        Row(
            Modifier
                .fillMaxWidth()
                .minTouchTarget()
                .apexClickable(onClick = { expanded = !expanded }, role = Role.Button)
                .semantics(mergeDescendants = true) { contentDescription = spoken },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(title, style = ApexTheme.type.bodyStrong, color = colors.foreground, modifier = Modifier.weight(1f).hideFromTalkBack())
            Icon(
                if (expanded) ApexIcons.ChevronUp else ApexIcons.ChevronDown,
                contentDescription = null,
                tint = colors.mutedForeground,
                modifier = Modifier.hideFromTalkBack(),
            )
        }
        if (expanded) {
            val resources = LocalContext.current.resources
            val body = when {
                kind.inlineText != null -> stringResource(kind.inlineText)
                kind.rawText != null -> remember(kind) {
                    runCatching { resources.openRawResource(kind.rawText).bufferedReader().use { it.readText() } }.getOrNull()
                } ?: stringResource(R.string.licences_text_unavailable)
                else -> stringResource(R.string.licences_text_unavailable)
            }
            Text(
                body,
                style = ApexTheme.type.caption,
                color = colors.foregroundBody,
                modifier = Modifier.padding(top = ApexSpacing.sm),
            )
        }
    }
}

@Preview(name = "Licences dark", heightDp = 1400)
@Composable
private fun LicencesPreviewDark() = ApexTheme(ThemePreference.DARK) {
    Column(Modifier.background(ApexTheme.colors.background)) { LicencesContent(onBack = {}) }
}

@Preview(name = "Licences light", heightDp = 1400)
@Composable
private fun LicencesPreviewLight() = ApexTheme(ThemePreference.LIGHT) {
    Column(Modifier.background(ApexTheme.colors.background)) { LicencesContent(onBack = {}) }
}
