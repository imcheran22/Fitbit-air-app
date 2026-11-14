package com.apex.athlete.ui.howitworks

import androidx.annotation.StringRes
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
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import com.apex.athlete.R
import com.apex.athlete.core.analytics.ANALYTICS_ALGORITHM_VERSION
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.SettingValueRow
import com.apex.athlete.core.ui.shell.DetailHeader
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.core.ui.theme.ThemePreference
import com.apex.athlete.navigation.ApexNavigator

/** One explanation section: a title and its paragraphs, all string resources (copy follows docs/FORMULAS.md). */
internal class ExplainerSection(
    @StringRes val title: Int,
    val paragraphs: List<Int>,
)

internal val explainerSections: List<ExplainerSection> = listOf(
    ExplainerSection(
        R.string.howitworks_recovery_title,
        listOf(
            R.string.howitworks_recovery_p1, R.string.howitworks_recovery_p2,
            R.string.howitworks_recovery_p3, R.string.howitworks_recovery_p4,
        ),
    ),
    ExplainerSection(
        R.string.howitworks_strain_title,
        listOf(R.string.howitworks_strain_p1, R.string.howitworks_strain_p2, R.string.howitworks_strain_p3),
    ),
    ExplainerSection(
        R.string.howitworks_sleep_title,
        listOf(R.string.howitworks_sleep_p1, R.string.howitworks_sleep_p2, R.string.howitworks_sleep_p3),
    ),
    ExplainerSection(
        R.string.howitworks_load_title,
        listOf(R.string.howitworks_load_p1, R.string.howitworks_load_p2, R.string.howitworks_load_p3),
    ),
    ExplainerSection(
        R.string.howitworks_baselines_title,
        listOf(R.string.howitworks_baselines_p1, R.string.howitworks_baselines_p2, R.string.howitworks_baselines_p3),
    ),
    ExplainerSection(
        R.string.howitworks_vo2_title,
        listOf(R.string.howitworks_vo2_p1, R.string.howitworks_vo2_p2),
    ),
    ExplainerSection(
        R.string.howitworks_maxhr_title,
        listOf(R.string.howitworks_maxhr_p1, R.string.howitworks_maxhr_p2),
    ),
)

@Composable
fun HowItWorksRoute(navigator: ApexNavigator) {
    HowItWorksContent(onBack = navigator::back)
}

@Composable
internal fun HowItWorksContent(onBack: () -> Unit) {
    val colors = ApexTheme.colors
    Column(Modifier.fillMaxSize()) {
        DetailHeader(
            title = stringResource(R.string.howitworks_title),
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
            Text(stringResource(R.string.howitworks_intro), style = ApexTheme.type.body, color = colors.foregroundBody)
            Text(stringResource(R.string.howitworks_missing_note), style = ApexTheme.type.body, color = colors.foregroundBody)
            Spacer(Modifier.height(ApexSpacing.xs))
            explainerSections.forEach { section -> SectionCard(section) }
            VersionCard()
            Spacer(Modifier.height(ApexSpacing.xl))
        }
    }
}

@Composable
private fun SectionCard(section: ExplainerSection) {
    val colors = ApexTheme.colors
    ApexCard(Modifier.fillMaxWidth()) {
        Text(
            stringResource(section.title),
            style = ApexTheme.type.sheetTitle,
            color = colors.foreground,
            modifier = Modifier.semantics { heading() },
        )
        section.paragraphs.forEach { id ->
            Text(
                stringResource(id),
                style = ApexTheme.type.body,
                color = colors.foregroundBody,
                modifier = Modifier.padding(top = ApexSpacing.sm),
            )
        }
    }
}

/** The constant comes from :core:analytics, so it is always the version the scores were computed with. */
@Composable
private fun VersionCard() {
    val colors = ApexTheme.colors
    ApexCard(Modifier.fillMaxWidth()) {
        Text(
            stringResource(R.string.howitworks_version_title),
            style = ApexTheme.type.sheetTitle,
            color = colors.foreground,
            modifier = Modifier.semantics { heading() },
        )
        SettingValueRow(
            title = stringResource(R.string.howitworks_version_label),
            value = ANALYTICS_ALGORITHM_VERSION.toString(),
        )
        Text(stringResource(R.string.howitworks_version_source), style = ApexTheme.type.caption, color = colors.mutedForeground)
        Text(
            stringResource(R.string.howitworks_version_note),
            style = ApexTheme.type.caption,
            color = colors.mutedForeground,
            modifier = Modifier.padding(top = ApexSpacing.xs),
        )
    }
}

@Preview(name = "HowItWorks dark", heightDp = 1600)
@Composable
private fun HowItWorksPreviewDark() = ApexTheme(ThemePreference.DARK) {
    Column(Modifier.background(ApexTheme.colors.background)) { HowItWorksContent(onBack = {}) }
}

@Preview(name = "HowItWorks light", heightDp = 1600)
@Composable
private fun HowItWorksPreviewLight() = ApexTheme(ThemePreference.LIGHT) {
    Column(Modifier.background(ApexTheme.colors.background)) { HowItWorksContent(onBack = {}) }
}
