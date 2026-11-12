package com.apex.athlete.ui.more

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.BuildConfig
import com.apex.athlete.R
import com.apex.athlete.core.analytics.ANALYTICS_ALGORITHM_VERSION
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.SettingNavRow
import com.apex.athlete.core.ui.components.SettingValueRow
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.shell.SectionShell
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ThemePreference
import com.apex.athlete.navigation.ApexNavigator
import com.apex.athlete.ui.common.LocalAppContainer

@Composable
fun MoreRoute(navigator: ApexNavigator, contentPadding: PaddingValues) {
    val container = LocalAppContainer.current
    val settings by container.settings.settings.collectAsStateWithLifecycle(initialValue = null)
    MoreContent(
        demoMode = settings?.demoMode,
        isDebugBuild = BuildConfig.DEBUG,
        appVersion = BuildConfig.VERSION_NAME,
        algorithmVersion = ANALYTICS_ALGORITHM_VERSION.toString(),
        actions = MoreActions(
            dataSources = navigator::openDataSources,
            takeout = navigator::openTakeoutImport,
            exportDelete = navigator::openExportDelete,
            settings = navigator::openSettings,
            profile = navigator::openProfile,
            howItWorks = navigator::openHowItWorks,
            privacy = navigator::openPrivacy,
            licences = navigator::openLicences,
            gallery = navigator::openGallery,
        ),
        contentPadding = contentPadding,
    )
}

internal class MoreActions(
    val dataSources: () -> Unit,
    val takeout: () -> Unit,
    val exportDelete: () -> Unit,
    val settings: () -> Unit,
    val profile: () -> Unit,
    val howItWorks: () -> Unit,
    val privacy: () -> Unit,
    val licences: () -> Unit,
    val gallery: () -> Unit,
)

@Composable
internal fun MoreContent(
    demoMode: Boolean?,
    isDebugBuild: Boolean,
    appVersion: String,
    algorithmVersion: String,
    actions: MoreActions,
    contentPadding: PaddingValues,
) {
    val colors = ApexTheme.colors
    Column(
        Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = ApexSpacing.gutter)
            .padding(top = ApexSpacing.sm),
        verticalArrangement = Arrangement.spacedBy(ApexSpacing.sectionGap),
    ) {
        Text(
            stringResource(R.string.more_title),
            style = ApexTheme.type.sectionTitle,
            color = colors.foreground,
            modifier = Modifier.semantics { heading() },
        )

        SectionShell(stringResource(R.string.more_section_data)) {
            ApexCard(contentPadding = PaddingValues(horizontal = ApexSpacing.lg, vertical = ApexSpacing.xs)) {
                SettingNavRow(
                    stringResource(R.string.more_data_sources), actions.dataSources,
                    subtitle = stringResource(R.string.more_data_sources_sub), icon = ApexIcons.Sync,
                )
                if (takeoutImportAllowed(demoMode)) {
                    SettingNavRow(
                        stringResource(R.string.more_takeout), actions.takeout,
                        subtitle = stringResource(R.string.more_takeout_sub),
                    )
                } else {
                    SettingValueRow(
                        stringResource(R.string.more_takeout),
                        if (demoMode == true) stringResource(R.string.more_takeout_demo_value) else "--",
                    )
                    if (demoMode == true) {
                        Text(
                            stringResource(R.string.more_takeout_demo_reason),
                            style = ApexTheme.type.caption,
                            color = colors.mutedForeground,
                            modifier = Modifier.padding(bottom = ApexSpacing.sm),
                        )
                    }
                }
                SettingNavRow(
                    stringResource(R.string.more_export_delete), actions.exportDelete,
                    subtitle = stringResource(R.string.more_export_delete_sub),
                )
            }
        }

        SectionShell(stringResource(R.string.more_section_app)) {
            ApexCard(contentPadding = PaddingValues(horizontal = ApexSpacing.lg, vertical = ApexSpacing.xs)) {
                SettingNavRow(stringResource(R.string.more_settings), actions.settings, subtitle = stringResource(R.string.more_settings_sub))
                SettingNavRow(
                    stringResource(R.string.more_profile), actions.profile,
                    subtitle = stringResource(R.string.more_profile_sub), icon = ApexIcons.Profile,
                )
            }
        }

        SectionShell(stringResource(R.string.more_section_about)) {
            ApexCard(contentPadding = PaddingValues(horizontal = ApexSpacing.lg, vertical = ApexSpacing.xs)) {
                SettingNavRow(stringResource(R.string.more_how_it_works), actions.howItWorks, icon = ApexIcons.Info)
                SettingNavRow(stringResource(R.string.more_privacy), actions.privacy)
                SettingNavRow(stringResource(R.string.more_licences), actions.licences)
            }
        }

        if (showGalleryRow(isDebugBuild)) {
            SectionShell(stringResource(R.string.more_section_debug)) {
                ApexCard(contentPadding = PaddingValues(horizontal = ApexSpacing.lg, vertical = ApexSpacing.xs)) {
                    SettingNavRow(stringResource(R.string.more_gallery), actions.gallery)
                }
            }
        }

        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
            SettingValueRow(stringResource(R.string.more_app_version), appVersion)
            SettingValueRow(stringResource(R.string.more_algorithm_version), algorithmVersion)
            Text(
                stringResource(R.string.more_footer_note),
                style = ApexTheme.type.caption,
                color = colors.mutedForeground,
            )
        }
        Box(Modifier.padding(contentPadding))
    }
}

private val previewActions = MoreActions({}, {}, {}, {}, {}, {}, {}, {}, {})

@Preview(name = "More dark", heightDp = 1000)
@Composable
private fun MorePreviewDark() = ApexTheme(ThemePreference.DARK) {
    Box(Modifier.background(ApexTheme.colors.background)) {
        MoreContent(demoMode = true, isDebugBuild = true, appVersion = "0.1.0", algorithmVersion = "1", actions = previewActions, contentPadding = PaddingValues())
    }
}

@Preview(name = "More light", heightDp = 1000)
@Composable
private fun MorePreviewLight() = ApexTheme(ThemePreference.LIGHT) {
    Box(Modifier.background(ApexTheme.colors.background)) {
        MoreContent(demoMode = false, isDebugBuild = false, appVersion = "0.1.0", algorithmVersion = "1", actions = previewActions, contentPadding = PaddingValues())
    }
}
