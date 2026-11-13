package com.apex.athlete.widget

import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ColorFilter
import androidx.glance.GlanceComposable
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.glance.layout.fillMaxSize
import com.apex.athlete.R
import kotlin.math.roundToInt

private val WidgetCorner = 24.dp
private val WidgetPadding = 8.dp
private const val RING_STROKE_FRACTION = 0.11f

/**
 * The widget surface: theme-aware background, one spoken description for the whole widget (it is one tap target,
 * so TalkBack reads this sentence), and the tap that opens Apex on [route].
 */
@Composable
@GlanceComposable
internal fun WidgetFrame(
    spoken: String,
    route: String,
    content: @Composable @GlanceComposable () -> Unit,
) {
    val context = LocalContext.current
    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .appWidgetBackground()
            .background(WidgetPalette.surface)
            .cornerRadius(WidgetCorner)
            .padding(WidgetPadding)
            .semantics { contentDescription = spoken }
            .clickable(actionStartActivity(WidgetDeepLink.launchIntent(context, route))),
        contentAlignment = Alignment.Center,
    ) {
        content()
    }
}

/** The neutral state: no snapshot, an unreadable one, or Demo mode. Says nothing about the owner. */
@Composable
@GlanceComposable
internal fun OpenApexContent() {
    val context = LocalContext.current
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = context.getString(R.string.app_name),
            style = TextStyle(color = WidgetPalette.foreground, fontSize = 18.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center),
            maxLines = 1,
        )
        Text(
            text = context.getString(R.string.widget_open_apex),
            style = TextStyle(color = WidgetPalette.secondary, fontSize = 12.sp, textAlign = TextAlign.Center),
            maxLines = 2,
        )
    }
}

/**
 * A score ring with its number, label and source mark. The ring is two tinted bitmaps (track, then fill); the number
 * is real text so it follows the system font size. A tile without a number shows `--` and its reason.
 */
@Composable
@GlanceComposable
internal fun RingTile(
    kind: RingKind,
    tile: TileState,
    ringSize: Dp,
    numberSize: Float,
    modifier: GlanceModifier = GlanceModifier,
    showProvisionalLine: Boolean = false,
) {
    val context = LocalContext.current
    val strings = WidgetStrings(context)
    val density = context.resources.displayMetrics.density
    val sizePx = (ringSize.value * density).roundToInt().coerceAtLeast(1)
    val strokePx = sizePx * RING_STROKE_FRACTION
    val value = tile as? TileState.Value
    val fraction = value?.fraction ?: 0f

    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalAlignment = Alignment.CenterVertically) {
        Box(modifier = GlanceModifier.size(ringSize), contentAlignment = Alignment.Center) {
            Image(
                provider = ImageProvider(RingBitmaps.track(sizePx, strokePx)),
                contentDescription = null,
                modifier = GlanceModifier.size(ringSize),
                colorFilter = ColorFilter.tint(WidgetPalette.track),
            )
            if (fraction > 0f) {
                Image(
                    provider = ImageProvider(RingBitmaps.fill(sizePx, strokePx, fraction)),
                    contentDescription = null,
                    modifier = GlanceModifier.size(ringSize),
                    colorFilter = ColorFilter.tint(WidgetPalette.fill(kind, value?.band)),
                )
            }
            Text(
                text = strings.centre(tile),
                style = TextStyle(color = WidgetPalette.foreground, fontSize = numberSize.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center),
                maxLines = 1,
            )
        }
        Text(
            text = strings.label(kind),
            style = TextStyle(color = WidgetPalette.foreground, fontSize = 11.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center),
            maxLines = 1,
        )
        Text(
            text = strings.subLine(tile),
            style = TextStyle(color = WidgetPalette.muted, fontSize = 10.sp, textAlign = TextAlign.Center),
            maxLines = 1,
        )
        if (showProvisionalLine && value?.provisional == true) {
            Text(
                text = strings.provisional(),
                style = TextStyle(color = WidgetPalette.muted, fontSize = 10.sp, textAlign = TextAlign.Center),
                maxLines = 1,
            )
        }
    }
}
