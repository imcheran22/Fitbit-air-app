package com.apex.athlete.widget

import android.content.Context
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceId
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.provideContent
import com.apex.athlete.R
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.ZoneId

/** Reads the snapshot file (never the database) and maps it for drawing. A missing or corrupt file gives the neutral state. */
internal suspend fun loadWidgetState(context: Context): WidgetUiState = withContext(Dispatchers.IO) {
    WidgetStateMapper.map(WidgetSnapshotStore.forContext(context).read(), System.currentTimeMillis(), ZoneId.systemDefault())
}

/** Small widget: the recovery ring (percent, band colour) with a calibrating state. Tap opens the Recovery screen. */
class RecoveryWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val state = loadWidgetState(context)
        provideContent {
            when (state) {
                WidgetUiState.OpenApex -> WidgetFrame(
                    spoken = context.getString(R.string.widget_open_apex_description),
                    route = WidgetDeepLink.ROUTE_RECOVERY,
                ) { OpenApexContent() }
                is WidgetUiState.Content -> WidgetFrame(
                    spoken = WidgetStrings(context).spoken(RingKind.RECOVERY, state.recovery),
                    route = WidgetDeepLink.ROUTE_RECOVERY,
                ) { RingTile(RingKind.RECOVERY, state.recovery, ringSize = 68.dp, numberSize = 24f) }
            }
        }
    }
}
