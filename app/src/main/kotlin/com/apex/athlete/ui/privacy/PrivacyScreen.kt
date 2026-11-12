package com.apex.athlete.ui.privacy

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import com.apex.athlete.R
import com.apex.athlete.core.ui.components.ApexButton
import com.apex.athlete.core.ui.components.ApexButtonStyle
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.hideFromTalkBack
import com.apex.athlete.core.ui.shell.DetailHeader
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.core.ui.theme.ThemePreference
import com.apex.athlete.navigation.ApexNavigator

@Composable
fun PrivacyRoute(navigator: ApexNavigator) {
    PrivacyContent(onBack = navigator::back, onExportDelete = navigator::openExportDelete)
}

@Composable
internal fun PrivacyContent(onBack: () -> Unit, onExportDelete: () -> Unit) {
    val colors = ApexTheme.colors
    Column(Modifier.fillMaxSize()) {
        DetailHeader(
            title = stringResource(R.string.privacy_title),
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
            Text(stringResource(R.string.privacy_intro), style = ApexTheme.type.body, color = colors.foregroundBody)
            InfoBlock(R.string.privacy_local_title, listOf(R.string.privacy_local_body))
            InfoBlock(R.string.privacy_noanalytics_title, listOf(R.string.privacy_noanalytics_body))
            InfoBlock(R.string.privacy_readonly_title, listOf(R.string.privacy_readonly_body))
            HealthConnectCard()
            InfoBlock(R.string.privacy_other_permissions_title, listOf(R.string.privacy_other_permissions_body))
            InfoBlock(R.string.privacy_network_title, listOf(R.string.privacy_network_google, R.string.privacy_network_anthropic))
            ApexCard(Modifier.fillMaxWidth()) {
                CardTitle(R.string.privacy_control_title)
                Text(
                    stringResource(R.string.privacy_control_body),
                    style = ApexTheme.type.body,
                    color = colors.foregroundBody,
                    modifier = Modifier.padding(vertical = ApexSpacing.sm),
                )
                ApexButton(
                    text = stringResource(R.string.privacy_control_button),
                    onClick = onExportDelete,
                    style = ApexButtonStyle.Secondary,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            Spacer(Modifier.height(ApexSpacing.xl))
        }
    }
}

@Composable
private fun CardTitle(titleRes: Int) {
    Text(
        stringResource(titleRes),
        style = ApexTheme.type.sheetTitle,
        color = ApexTheme.colors.foreground,
        modifier = Modifier.semantics { heading() },
    )
}

@Composable
private fun InfoBlock(titleRes: Int, bodies: List<Int>) {
    ApexCard(Modifier.fillMaxWidth()) {
        CardTitle(titleRes)
        bodies.forEach { id ->
            Text(
                stringResource(id),
                style = ApexTheme.type.body,
                color = ApexTheme.colors.foregroundBody,
                modifier = Modifier.padding(top = ApexSpacing.sm),
            )
        }
    }
}

@Composable
private fun HealthConnectCard() {
    val colors = ApexTheme.colors
    ApexCard(Modifier.fillMaxWidth()) {
        CardTitle(R.string.privacy_hc_title)
        Text(
            stringResource(R.string.privacy_hc_intro),
            style = ApexTheme.type.body,
            color = colors.foregroundBody,
            modifier = Modifier.padding(vertical = ApexSpacing.sm),
        )
        healthConnectUses.forEach { use ->
            val name = stringResource(use.name)
            val why = stringResource(use.why)
            val spoken = stringResource(R.string.privacy_hc_item_description, name, why)
            Column(
                Modifier
                    .fillMaxWidth()
                    .padding(vertical = ApexSpacing.xs)
                    .semantics(mergeDescendants = true) { contentDescription = spoken },
            ) {
                Text(name, style = ApexTheme.type.bodyStrong, color = colors.foreground, modifier = Modifier.hideFromTalkBack())
                Text(why, style = ApexTheme.type.caption, color = colors.mutedForeground, modifier = Modifier.hideFromTalkBack())
            }
        }
    }
}

@Preview(name = "Privacy dark", heightDp = 1800)
@Composable
private fun PrivacyPreviewDark() = ApexTheme(ThemePreference.DARK) {
    Column(Modifier.background(ApexTheme.colors.background)) { PrivacyContent(onBack = {}, onExportDelete = {}) }
}

@Preview(name = "Privacy light", heightDp = 1800)
@Composable
private fun PrivacyPreviewLight() = ApexTheme(ThemePreference.LIGHT) {
    Column(Modifier.background(ApexTheme.colors.background)) { PrivacyContent(onBack = {}, onExportDelete = {}) }
}
