package com.apex.athlete.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceComposable
import androidx.glance.GlanceId
import androidx.glance.LocalContext
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.provideContent
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import com.apex.athlete.R

/**
 * Small widget: the latest heart rate with its age. A reading that is missing, older than six hours or not
 * plausible shows "No recent reading", never a number. Tap opens the Heart-rate day screen.
 */
class HeartRateWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val state = loadWidgetState(context)
        provideContent {
            when (state) {
                WidgetUiState.OpenApex -> WidgetFrame(
                    spoken = context.getString(R.string.widget_open_apex_description),
                    route = WidgetDeepLink.ROUTE_HEART_RATE,
                ) { OpenApexContent() }
                is WidgetUiState.Content -> WidgetFrame(
                    spoken = WidgetStrings(context).heartRateSpoken(state.heartRate),
                    route = WidgetDeepLink.ROUTE_HEART_RATE,
                ) { HeartRateContent(state.heartRate) }
            }
        }
    }
}

@Composable
@GlanceComposable
private fun HeartRateContent(tile: HeartRateTile) {
    val context = LocalContext.current
    val strings = WidgetStrings(context)
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = context.getString(R.string.widget_label_heart_rate),
            style = TextStyle(color = WidgetPalette.accentText, fontSize = 12.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center),
            maxLines = 1,
        )
        when (tile) {
            is HeartRateTile.Reading -> {
                Text(
                    text = tile.bpm.toString(),
                    style = TextStyle(color = WidgetPalette.foreground, fontSize = 32.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center),
                    maxLines = 1,
                )
                Text(
                    text = context.getString(R.string.widget_unit_bpm),
                    style = TextStyle(color = WidgetPalette.secondary, fontSize = 12.sp, textAlign = TextAlign.Center),
                    maxLines = 1,
                )
                Text(
                    text = strings.age(tile.ageMinutes),
                    style = TextStyle(color = WidgetPalette.secondary, fontSize = 12.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center),
                    maxLines = 1,
                )
                Text(
                    text = strings.provenanceMark(tile.provenance),
                    style = TextStyle(color = WidgetPalette.muted, fontSize = 10.sp, textAlign = TextAlign.Center),
                    maxLines = 1,
                )
            }
            HeartRateTile.NoRecent -> Text(
                text = context.getString(R.string.widget_hr_no_recent),
                style = TextStyle(color = WidgetPalette.foreground, fontSize = 15.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center),
                maxLines = 3,
            )
        }
    }
}
