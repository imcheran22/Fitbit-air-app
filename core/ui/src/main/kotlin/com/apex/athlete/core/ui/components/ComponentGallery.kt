package com.apex.athlete.core.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.R
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.shell.SectionShell
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.core.ui.theme.RecoveryBand

/**
 * Every kit component in every state, on the page ground. The :app hosts this in debug builds and uses it
 * for screenshot tests. Wrap it in `ApexTheme { }` (and `ApexScaffold` if the bar should be visible).
 */
@Composable
fun ComponentGallery(modifier: Modifier = Modifier) {
    val colors = ApexTheme.colors
    val src = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API
    val derived = DataProvenance.MATHEMATICALLY_DERIVED
    val states = listOf(
        MetricState.Loading,
        MetricState.Value(66.0, 0, "ms", src, stringResource(R.string.gallery_as_of)),
        MetricState.Value(58.0, 0, "%", derived, stringResource(R.string.gallery_as_of), isProvisional = true),
        MetricState.Calibrating(4),
        MetricState.Stale(55.0, 0, "bpm", DataProvenance.IMPORTED_HEALTH_CONNECT, stringResource(R.string.gallery_since)),
        MetricState.Unavailable(MetricReason.NOT_WORN),
        MetricState.Error(),
    )
    var selectedDay by remember { mutableStateOf("2") }
    var toggle by remember { mutableStateOf(true) }
    var text by remember { mutableStateOf("") }
    val days = listOf(
        DayStripItem("1", "M", "21", RecoveryBand.GREEN, stringResource(R.string.gallery_day_green)),
        DayStripItem("2", "T", "22", RecoveryBand.YELLOW, stringResource(R.string.gallery_day_yellow)),
        DayStripItem("3", "W", "23", null, stringResource(R.string.gallery_day_none)),
        DayStripItem("4", "T", "24", RecoveryBand.RED, stringResource(R.string.gallery_day_red)),
    )
    Column(
        modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .statusBarsPadding()
            .padding(ApexSpacing.gutter),
        verticalArrangement = Arrangement.spacedBy(ApexSpacing.sectionGap),
    ) {
        Text(stringResource(R.string.gallery_title), style = ApexTheme.type.sectionTitle, color = colors.foreground)

        SectionShell(stringResource(R.string.gallery_dials)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                ScoreDial(MetricState.Value(90.0, 0, "%", derived, stringResource(R.string.gallery_as_of)), DialVariant.Sleep, DialSize.Home, stringResource(R.string.gallery_sleep), onClick = {})
                ScoreDial(MetricState.Value(94.0, 0, "%", derived, stringResource(R.string.gallery_as_of)), DialVariant.Recovery, DialSize.Home, stringResource(R.string.gallery_recovery), onClick = {})
                ScoreDial(MetricState.Value(9.4, 1, null, derived, stringResource(R.string.gallery_as_of)), DialVariant.Strain, DialSize.Home, stringResource(R.string.gallery_strain), strainTarget = 10.0..14.0, onClick = {})
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                ScoreDial(MetricState.Loading, DialVariant.Recovery, DialSize.Small, stringResource(R.string.gallery_recovery))
                ScoreDial(MetricState.Calibrating(4), DialVariant.Recovery, DialSize.Small, stringResource(R.string.gallery_recovery))
                ScoreDial(MetricState.Unavailable(MetricReason.NOT_WORN), DialVariant.Sleep, DialSize.Small, stringResource(R.string.gallery_sleep))
                ScoreDial(MetricState.Stale(61.0, 0, "%", derived, stringResource(R.string.gallery_since)), DialVariant.Sleep, DialSize.Small, stringResource(R.string.gallery_sleep))
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                MiniRing(MetricState.Value(58.0, 0, "%", derived, null), DialVariant.Recovery, stringResource(R.string.gallery_recovery))
                MiniRing(MetricState.Loading, DialVariant.Strain, stringResource(R.string.gallery_strain))
            }
            ScoreDial(
                MetricState.Value(72.0, 0, "%", derived, stringResource(R.string.gallery_as_of), isProvisional = true),
                DialVariant.Recovery, DialSize.Hero, stringResource(R.string.gallery_recovery),
            )
            ScoreDial(MetricState.Calibrating(4), DialVariant.Recovery, DialSize.Hero, stringResource(R.string.gallery_recovery))
            StrainTargetBar(MetricState.Value(9.4, 1, null, derived, stringResource(R.string.gallery_as_of)), 10.0, 14.0)
        }

        SectionShell(stringResource(R.string.gallery_rows)) {
            ApexCard {
                states.forEachIndexed { i, s -> KeyStatRow(stringResource(R.string.gallery_hrv), s, icon = ApexIcons.Pulse, average = 55.0, sd = 6.0, goodDirection = GoodDirection.UP, onClick = {}) }
            }
            ApexCard {
                ContributorRow(stringResource(R.string.gallery_hrv), states[1], icon = ApexIcons.Pulse, points = 9.0, baselineMean = 55.0, baselineSd = 8.0)
                ContributorRow(stringResource(R.string.gallery_sleep), states[2], icon = ApexIcons.Moon, status = ContributorStatus.Sufficient)
                ContributorRow(stringResource(R.string.gallery_sleep), states[5], icon = ApexIcons.Moon)
            }
            DriverList(
                listOf(DriverItem("a", stringResource(R.string.gallery_hrv), 12.0), DriverItem("b", stringResource(R.string.gallery_sleep), -5.0)),
                unit = stringResource(R.string.gallery_points_unit),
            )
        }

        SectionShell(stringResource(R.string.gallery_cards)) {
            InsightCard(stringResource(R.string.gallery_insight), linkLabel = stringResource(R.string.gallery_insight_link), onLinkClick = {}, provenance = derived)
            ActivityCard(stringResource(R.string.gallery_sleep), ActivityKind.Sleep, MetricState.Value(6.5, 1, "h", src, null), "00:51", "07:38", onClick = {})
            ActivityCard(stringResource(R.string.gallery_run), ActivityKind.Workout, MetricState.Unavailable(MetricReason.INSUFFICIENT_HR_DATA), "11:16", "12:14")
            ActivityCardSkeleton()
            DayStrip(days, selectedDay, { selectedDay = it }, stringResource(R.string.gallery_choose_day))
            DatePill(stringResource(R.string.gallery_today), {}, {}, {}, canGoNext = false, previousDescription = stringResource(R.string.gallery_prev), nextDescription = stringResource(R.string.gallery_next))
        }

        SectionShell(stringResource(R.string.gallery_state_view)) {
            ApexCard {
                states.forEach { s ->
                    com.apex.athlete.core.ui.state.MetricStateView(s) { v ->
                        Column {
                            com.apex.athlete.core.ui.state.MetricValueText(v)
                            MetricProvenance(v)
                            if (v.isProvisional) Tag(stringResource(R.string.tag_provisional))
                        }
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Tag(stringResource(R.string.tag_provisional))
                Tag(stringResource(R.string.tag_calibrating), tone = ChipTone.INFO)
                StatusChip(stringResource(R.string.chip_in_range), tone = ChipTone.OPTIMAL, icon = ApexIcons.Check)
                StatusChip(stringResource(R.string.chip_out_of_range), tone = ChipTone.WARNING, icon = ApexIcons.Warning)
            }
            DataProvenance.entries.forEach { ProvenanceLabel(it, asOf = stringResource(R.string.gallery_as_of)) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SkeletonLine(96.dp)
                SkeletonRing(40.dp, 4.dp)
            }
        }

        SectionShell(stringResource(R.string.gallery_banners)) {
            ConnectionBanner(BannerKind.Demo, stringResource(R.string.gallery_banner_demo), description = stringResource(R.string.gallery_banner_demo_body))
            ConnectionBanner(BannerKind.Importing, stringResource(R.string.gallery_banner_import), progress = 0.23f)
            ConnectionBanner(BannerKind.Stale, stringResource(R.string.gallery_banner_stale), description = stringResource(R.string.gallery_banner_stale_body), actionLabel = stringResource(R.string.gallery_retry), onAction = {})
            ConnectionBanner(BannerKind.Offline, stringResource(R.string.gallery_banner_offline))
            ConnectionBanner(BannerKind.AuthRevoked, stringResource(R.string.gallery_banner_revoked), actionLabel = stringResource(R.string.gallery_reconnect), onAction = {})
        }

        SectionShell(stringResource(R.string.gallery_controls)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ApexButton(stringResource(R.string.gallery_primary), {})
                ApexButton(stringResource(R.string.gallery_secondary), {}, style = ApexButtonStyle.Secondary)
                ApexButton(stringResource(R.string.gallery_destructive), {}, style = ApexButtonStyle.Destructive)
            }
            ApexCard {
                SettingToggleRow(stringResource(R.string.gallery_setting_toggle), toggle, { toggle = it }, subtitle = stringResource(R.string.gallery_setting_sub))
                SettingNavRow(stringResource(R.string.gallery_setting_nav), {}, value = stringResource(R.string.gallery_setting_value))
                SettingValueRow(stringResource(R.string.gallery_setting_readonly), stringResource(R.string.gallery_setting_version))
            }
            ApexTextField(text, { text = it }, stringResource(R.string.gallery_field), placeholder = stringResource(R.string.gallery_field_hint))
            ApexTextField("abc", {}, stringResource(R.string.gallery_field), errorText = stringResource(R.string.gallery_field_error))
        }
    }
}

@Preview(name = "Gallery dark", heightDp = 2400)
@Composable
private fun GalleryPreviewDark() = ApexPreview(dark = true) { ComponentGallery() }

@Preview(name = "Gallery light", heightDp = 2400)
@Composable
private fun GalleryPreviewLight() = ApexPreview(dark = false) { ComponentGallery() }
