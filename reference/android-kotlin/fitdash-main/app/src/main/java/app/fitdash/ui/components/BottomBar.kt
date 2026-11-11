package app.fitdash.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.layout
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.fitdash.ui.theme.LocalReduceMotion
import app.fitdash.ui.theme.Motion
import app.fitdash.ui.theme.Palette
import app.fitdash.ui.theme.Type
import kotlin.math.roundToInt

data class NavItem(val label: String, val icon: ImageVector)

private val BarShape = RoundedCornerShape(24.dp)
private val ItemShape = RoundedCornerShape(18.dp)

@Composable
fun BottomBar(items: List<NavItem>, pager: PagerState, onSelect: (Int) -> Unit, modifier: Modifier = Modifier) {
    val reduce = LocalReduceMotion.current
    Row(
        modifier
            .height(62.dp)
            .shadow(12.dp, BarShape, ambientColor = Palette.Accent.copy(alpha = 0.13f), spotColor = Palette.Accent.copy(alpha = 0.13f))
            .clip(BarShape)
            .background(Palette.Glass)
            .padding(horizontal = 6.dp),
        horizontalArrangement = Arrangement.SpaceAround,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        items.forEachIndexed { i, item ->
            val selected = pager.currentPage == i
            val reveal by animateFloatAsState(if (selected) 1f else 0f, if (reduce) snap() else Motion.settle, label = "navLabel")
            Row(
                Modifier
                    .clip(ItemShape)
                    .background(if (selected) Palette.Accent else Color.Transparent)
                    .clickable { onSelect(i) }
                    .clearAndSetSemantics { contentDescription = item.label; this.selected = selected; role = Role.Tab }
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(item.icon, null, Modifier.size(22.dp), tint = if (selected) Palette.OnAccent else Palette.Muted)
                Text(
                    item.label,
                    Modifier
                        .clipToBounds()
                        .layout { measurable, constraints ->
                            val placeable = measurable.measure(constraints.copy(maxWidth = Constraints.Infinity))
                            layout((placeable.width * reveal).roundToInt().coerceAtLeast(0), placeable.height) { placeable.place(0, 0) }
                        }
                        .padding(start = 6.dp),
                    style = Type.body.copy(fontSize = 12.5.sp, fontWeight = FontWeight.Bold),
                    color = Palette.OnAccent,
                    maxLines = 1,
                    softWrap = false,
                )
            }
        }
    }
}
