package com.apex.athlete.core.ui.shell

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.ui.components.ApexPreview
import com.apex.athlete.core.ui.components.apexClickable
import com.apex.athlete.core.ui.components.pressScale
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.theme.ApexColors
import com.apex.athlete.core.ui.theme.ApexShapes
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import kotlin.math.min

/** One destination in the floating tab bar. [label] comes from strings.xml (caller). */
@Immutable
data class ApexTab(val label: String, val icon: ImageVector)

/** Height of the ground gradient (DESIGN_SYSTEM.md section 2.1): top at 0, mid at 270 dp, base from 740 dp. */
private const val GROUND_HEIGHT_DP = 740f
private const val GROUND_MID_DP = 270f
private const val TAB_BAR_INSET_DP = 12f
private const val CHROME_MAX_FONT_SCALE = 1.3f

/** The fixed vertical ground gradient. Reused by [HomeHeader] so its fill lines up with the page ground. */
@Composable
fun rememberGroundBrush(): Brush {
    val colors = ApexTheme.colors
    val density = LocalDensity.current
    return remember(colors, density.density) {
        Brush.verticalGradient(
            0f to colors.backgroundTop,
            GROUND_MID_DP / GROUND_HEIGHT_DP to colors.backgroundMid,
            1f to colors.background,
            startY = 0f,
            endY = GROUND_HEIGHT_DP * density.density,
        )
    }
}

/** Bottom padding content must reserve so nothing hides behind the floating bar (bar + inset + 24 dp). */
@Composable
fun floatingBarClearance(): androidx.compose.ui.unit.Dp =
    ApexSpacing.tabBarHeight + TAB_BAR_INSET_DP.dp + ApexSpacing.xl +
        WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()

/**
 * App shell (DESIGN_SYSTEM.md section 4): fixed gradient ground, floating glass tab bar, and a round floating
 * action (Coach) with an indigo-to-blue rim. [content] receives bottom padding that clears the bar.
 *
 * [banner] is the persistent notice slot (Demo, offline, stale) pinned above the content; while it is shown the
 * status bar inset is consumed so headers inside [content] do not pad for it twice.
 * Set [showBars] false for full-screen flows (onboarding, detail screens that hide the bar).
 *
 * Material note: the glass uses near-opaque gradient tokens. `Modifier.blur` would blur the bar's own content
 * rather than what is behind it, so no blur is applied on any API level.
 */
@Composable
fun ApexScaffold(
    tabs: List<ApexTab>,
    selectedTab: Int,
    onTabSelected: (Int) -> Unit,
    coachContentDescription: String,
    onCoachClick: () -> Unit,
    modifier: Modifier = Modifier,
    banner: (@Composable () -> Unit)? = null,
    showBars: Boolean = true,
    content: @Composable (PaddingValues) -> Unit,
) {
    val ground = rememberGroundBrush()
    val bottom = if (showBars) floatingBarClearance() else WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    Box(modifier.fillMaxSize().drawBehind { drawRect(ground) }) {
        Column(Modifier.fillMaxSize()) {
            if (banner != null) {
                Box(Modifier.statusBarsPadding().padding(horizontal = ApexSpacing.gutter, vertical = 8.dp)) { banner() }
            }
            val contentModifier = Modifier.weight(1f).fillMaxWidth().let {
                if (banner != null) it.consumeWindowInsets(WindowInsets.statusBars) else it
            }
            Box(contentModifier) { content(PaddingValues(bottom = bottom)) }
        }
        if (showBars) {
            Row(
                Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .padding(horizontal = TAB_BAR_INSET_DP.dp)
                    .padding(bottom = TAB_BAR_INSET_DP.dp + WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                GlassTabBar(tabs, selectedTab, onTabSelected, Modifier.weight(1f))
                FloatingAction(coachContentDescription, onCoachClick)
            }
        }
    }
}

private fun Modifier.glassSurface(colors: ApexColors, brush: Brush, shape: Shape): Modifier = this
    .clip(shape)
    .background(brush)
    .border(1.dp, colors.glassRim, shape)
    .drawWithContent {
        drawContent()
        // Top light: a 1 dp edge just inside the rim.
        val h = 1.dp.toPx()
        drawLine(colors.glassEdge, Offset(18.dp.toPx(), h), Offset(size.width - 18.dp.toPx(), h), strokeWidth = h)
    }

@Composable
private fun GlassTabBar(tabs: List<ApexTab>, selected: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier) {
    val colors = ApexTheme.colors
    val brush = remember(colors) { Brush.verticalGradient(listOf(colors.glassTop, colors.glassBottom)) }
    Row(
        modifier
            .height(ApexSpacing.tabBarHeight)
            .glassSurface(colors, brush, ApexShapes.glass)
            .selectableGroup()
            .padding(horizontal = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        tabs.forEachIndexed { index, tab ->
            TabItem(tab, selected = index == selected, onClick = { onSelect(index) }, modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun TabItem(tab: ApexTab, selected: Boolean, onClick: () -> Unit, modifier: Modifier) {
    val colors = ApexTheme.colors
    val source = remember { MutableInteractionSource() }
    val tint = if (selected) colors.foreground else colors.mutedForeground
    val density = LocalDensity.current
    val capped = Density(density.density, min(density.fontScale, CHROME_MAX_FONT_SCALE))
    Box(
        modifier
            .fillMaxHeight()
            .pressScale(source)
            .selectable(selected = selected, interactionSource = source, indication = null, role = Role.Tab, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier
                .padding(vertical = 6.dp)
                .background(if (selected) colors.glassLens else androidx.compose.ui.graphics.Color.Transparent, RoundedCornerShape(16.dp))
                .padding(horizontal = 10.dp, vertical = 4.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(tab.icon, contentDescription = null, tint = tint, modifier = Modifier.size(24.dp))
            CompositionLocalProvider(LocalDensity provides capped) {
                Text(tab.label, style = ApexTheme.type.tabLabel, color = tint, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
private fun FloatingAction(description: String, onClick: () -> Unit) {
    val colors = ApexTheme.colors
    val fill = remember(colors) { Brush.verticalGradient(listOf(colors.glassActionTop, colors.glassActionBottom)) }
    val rim = remember(colors) { Brush.linearGradient(listOf(colors.actionRimFrom, colors.actionRimTo)) }
    Box(
        Modifier
            .size(ApexSpacing.floatingAction)
            .apexClickable(onClick = onClick, role = Role.Button)
            .clip(CircleShape)
            .background(fill)
            .border(2.dp, rim, CircleShape)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Icon(ApexIcons.Coach, contentDescription = null, tint = colors.foreground, modifier = Modifier.size(28.dp))
    }
}

@Preview(name = "Scaffold dark", heightDp = 640)
@Composable
private fun ScaffoldPreviewDark() = ScaffoldPreviewBody(dark = true)

@Preview(name = "Scaffold light", heightDp = 640)
@Composable
private fun ScaffoldPreviewLight() = ScaffoldPreviewBody(dark = false)

@Composable
private fun ScaffoldPreviewBody(dark: Boolean) {
    val tabs = listOf(
        ApexTab("Overview", ApexIcons.Overview),
        ApexTab("Health", ApexIcons.Health),
        ApexTab("Journal", ApexIcons.Journal),
        ApexTab("More", ApexIcons.More),
    )
    com.apex.athlete.core.ui.theme.ApexTheme(if (dark) com.apex.athlete.core.ui.theme.ThemePreference.DARK else com.apex.athlete.core.ui.theme.ThemePreference.LIGHT) {
        ApexScaffold(tabs, 0, {}, "Coach", {}) { padding ->
            Column(Modifier.padding(padding).padding(ApexSpacing.gutter)) {
                Text("Overview", style = ApexTheme.type.sectionTitle, color = ApexTheme.colors.foreground)
                Spacer(Modifier.width(1.dp))
            }
        }
    }
}
