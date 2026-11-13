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
            goals = navigator::openGoals,
            plan = navigator::openPlan,
            reports = navigator::openReports,
            quickLog = navigator::openQuickLog,
            behaviours = navigator::openBehaviours,
            food = navigator::openFood,
            bloodPressure = navigator::openBloodPressure,
            recorder = navigator::openRecorder,
            breathe = navigator::openBreathe,
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
    val goals: () -> Unit,
    val plan: () -> Unit,
    val reports: () -> Unit,
    val quickLog: () -> Unit,
    val behaviours: () -> Unit,
    val food: () -> Unit,
    val bloodPressure: () -> Unit,
    val recorder: () -> Unit,
    val breathe: () -> Unit,
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

        SectionShell(stringResource(R.string.more_section_plan)) {
            ApexCard(contentPadding = PaddingValues(horizontal = ApexSpacing.lg, vertical = ApexSpacing.xs)) {
                SettingNavRow(
                    stringResource(R.string.more_goals), actions.goals,
                    subtitle = stringResource(R.string.more_goals_sub), icon = ApexIcons.Check,
                )
                SettingNavRow(
                    stringResource(R.string.more_plan), actions.plan,
                    subtitle = stringResource(R.string.more_plan_sub), icon = ApexIcons.Overview,
                )
                SettingNavRow(
                    stringResource(R.string.more_reports), actions.reports,
                    subtitle = stringResource(R.string.more_reports_sub), icon = ApexIcons.Journal,
                )
            }
        }

        SectionShell(stringResource(R.string.more_section_log)) {
            ApexCard(contentPadding = PaddingValues(horizontal = ApexSpacing.lg, vertical = ApexSpacing.xs)) {
                SettingNavRow(
                    stringResource(R.string.more_quick_log), actions.quickLog,
                    subtitle = stringResource(R.string.more_quick_log_sub), icon = ApexIcons.Plus,
                )
                SettingNavRow(
                    stringResource(R.string.more_behaviours), actions.behaviours,
                    subtitle = stringResource(R.string.more_behaviours_sub), icon = ApexIcons.Bolt,
                )
                SettingNavRow(
                    stringResource(R.string.more_food), actions.food,
                    subtitle = stringResource(R.string.more_food_sub), icon = ApexIcons.Cloud,
                )
                SettingNavRow(
                    stringResource(R.string.more_blood_pressure), actions.bloodPressure,
                    subtitle = stringResource(R.string.more_blood_pressure_sub), icon = ApexIcons.Heart,
                )
            }
        }

        SectionShell(stringResource(R.string.more_section_tools)) {
            ApexCard(contentPadding = PaddingValues(horizontal = ApexSpacing.lg, vertical = ApexSpacing.xs)) {
                SettingNavRow(
                    stringResource(R.string.more_recorder), actions.recorder,
                    subtitle = stringResource(R.string.more_recorder_sub), icon = ApexIcons.Pulse,
                )
                SettingNavRow(
                    stringResource(R.string.more_breathe), actions.breathe,
                    subtitle = stringResource(R.string.more_breathe_sub), icon = ApexIcons.Wind,
                )
            }
        }

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

private val previewActions = MoreActions({}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {})

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
