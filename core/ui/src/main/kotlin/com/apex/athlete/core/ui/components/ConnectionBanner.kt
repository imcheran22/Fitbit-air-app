package com.apex.athlete.core.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.theme.ApexShapes
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.core.ui.theme.ApexColors
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.layout.Spacer

enum class BannerKind {
    /** Persistent Demo-mode banner: synthetic data, separate store. Gradient `bannerFrom` to `bannerTo`. */
    Demo,
    /** Not connected to any source yet. */
    NotConnected,
    /** History import running; pass [progress]. */
    Importing,
    /** Last successful sync is old. */
    Stale,
    /** No network. */
    Offline,
    /** Authorisation revoked or expired: sync is paused. Announced assertively. */
    AuthRevoked,
}

private fun iconFor(kind: BannerKind): ImageVector = when (kind) {
    BannerKind.Demo -> ApexIcons.ApexMark
    BannerKind.NotConnected -> ApexIcons.Cloud
    BannerKind.Importing -> ApexIcons.Sync
    BannerKind.Stale -> ApexIcons.Warning
    BannerKind.Offline -> ApexIcons.Cloud
    BannerKind.AuthRevoked -> ApexIcons.Warning
}

private fun ApexColors.bannerIconTint(kind: BannerKind): Color = when (kind) {
    BannerKind.Demo -> coachText
    BannerKind.NotConnected -> foreground
    BannerKind.Importing -> coachText
    BannerKind.Stale -> warningText
    BannerKind.Offline -> warningText
    BannerKind.AuthRevoked -> recoveryRedText
}

/**
 * The single place the app talks about its data connection (Pulse 5.13), also the persistent Demo banner
 * and the stale / offline notices. Texts come from the caller (strings.xml); [progress] 0..1 draws a bar.
 * Live region: polite, except [BannerKind.AuthRevoked] which is assertive.
 */
@Composable
fun ConnectionBanner(
    kind: BannerKind,
    title: String,
    modifier: Modifier = Modifier,
    description: String? = null,
    progress: Float? = null,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    val colors = ApexTheme.colors
    val bg = if (kind == BannerKind.Demo) {
        Modifier.background(Brush.horizontalGradient(listOf(colors.bannerFrom, colors.bannerTo)))
    } else {
        Modifier.background(colors.card)
    }
    val live = if (kind == BannerKind.AuthRevoked) LiveRegionMode.Assertive else LiveRegionMode.Polite
    Column(
        modifier
            .fillMaxWidth()
            .clip(ApexShapes.card)
            .then(bg)
            .semantics(mergeDescendants = true) { liveRegion = live }
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
            Icon(iconFor(kind), contentDescription = null, tint = colors.bannerIconTint(kind), modifier = Modifier.size(20.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(title, style = ApexTheme.type.bodyStrong, color = colors.foreground)
                if (description != null) {
                    Text(description, style = ApexTheme.type.body, color = colors.foregroundSecondary)
                }
            }
        }
        if (progress != null) ProgressBar(progress.coerceIn(0f, 1f))
        if (actionLabel != null && onAction != null) {
            ApexButton(
                text = actionLabel,
                onClick = onAction,
                style = ApexButtonStyle.Secondary,
                modifier = Modifier.align(Alignment.End),
            )
        }
    }
}

@Composable
private fun ProgressBar(fraction: Float) {
    val track = ApexTheme.colors.dialTrack
    val fill = ApexTheme.colors.coach
    Spacer(
        Modifier
            .fillMaxWidth()
            .height(6.dp)
            .drawBehind {
                val r = CornerRadius(2.dp.toPx())
                drawRoundRect(track, Offset.Zero, size, r)
                drawRoundRect(fill, Offset.Zero, Size(size.width * fraction, size.height), r)
            },
    )
}

@Preview(name = "Banners dark")
@Composable
private fun BannersPreviewDark() = ApexPreview(dark = true) { BannersPreviewBody() }

@Preview(name = "Banners light")
@Composable
private fun BannersPreviewLight() = ApexPreview(dark = false) { BannersPreviewBody() }

@Composable
private fun BannersPreviewBody() {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        ConnectionBanner(BannerKind.Demo, "Demo mode", "Synthetic data in a separate store.")
        ConnectionBanner(BannerKind.Importing, "Importing history", "42 of 180 days.", progress = 0.23f)
        ConnectionBanner(BannerKind.Stale, "Sync is behind", "Last sync 3 h ago.", actionLabel = "Retry", onAction = {})
        ConnectionBanner(BannerKind.AuthRevoked, "Reconnect Google", "Access was revoked.", actionLabel = "Reconnect", onAction = {})
    }
}
