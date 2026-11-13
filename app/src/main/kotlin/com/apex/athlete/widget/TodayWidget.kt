package com.apex.athlete.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceComposable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.provideContent
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.padding
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import com.apex.athlete.R

/**
 * Medium widget: recovery, sleep score and day strain side by side, each with a ring and its source mark, and the
 * time of the last update. Tap opens the Overview.
 */
class TodayWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val state = loadWidgetState(context)
        provideContent {
            when (state) {
                WidgetUiState.OpenApex -> WidgetFrame(
                    spoken = context.getString(R.string.widget_open_apex_description),
                    route = WidgetDeepLink.ROUTE_OVERVIEW,
                ) { OpenApexContent() }
                is WidgetUiState.Content -> {
                    val strings = WidgetStrings(context)
                    val updated = strings.updated(state.updatedAtMillis)
                    val sentences = listOf(
                        strings.spoken(RingKind.RECOVERY, state.recovery),
                        strings.spoken(RingKind.SLEEP, state.sleep),
                        strings.spoken(RingKind.STRAIN, state.strain),
                    ).joinToString(". ")
                    WidgetFrame(spoken = strings.join(sentences, updated), route = WidgetDeepLink.ROUTE_OVERVIEW) {
                        TodayContent(state, updated)
                    }
                }
            }
        }
    }
}

@Composable
@GlanceComposable
private fun TodayContent(state: WidgetUiState.Content, updated: String) {
    Column(modifier = GlanceModifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
        Row(
            modifier = GlanceModifier.fillMaxWidth().defaultWeight(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            RingTile(RingKind.RECOVERY, state.recovery, ringSize = 44.dp, numberSize = 14f, modifier = GlanceModifier.defaultWeight())
            RingTile(RingKind.SLEEP, state.sleep, ringSize = 44.dp, numberSize = 14f, modifier = GlanceModifier.defaultWeight())
            RingTile(
                RingKind.STRAIN, state.strain, ringSize = 44.dp, numberSize = 14f,
                modifier = GlanceModifier.defaultWeight(), showProvisionalLine = true,
            )
        }
        Text(
            text = updated,
            modifier = GlanceModifier.fillMaxWidth().padding(top = 2.dp),
            style = TextStyle(color = WidgetPalette.muted, fontSize = 10.sp, textAlign = TextAlign.Center),
            maxLines = 1,
        )
    }
}
