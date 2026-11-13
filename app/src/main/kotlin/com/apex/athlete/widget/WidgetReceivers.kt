package com.apex.athlete.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import com.apex.athlete.ApexAthleteApplication
import kotlinx.coroutines.launch

/**
 * Shared behaviour of the three receivers: when a widget is added or restored, make sure the 30-minute redraw is
 * queued and the snapshot is current, so a new widget does not wait for the next sync to show data.
 */
abstract class ApexWidgetReceiver : GlanceAppWidgetReceiver() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        super.onUpdate(context, appWidgetManager, appWidgetIds)
        val app = context.applicationContext as? ApexAthleteApplication ?: return
        WidgetRefreshWorker.schedule(context)
        val container = app.container
        container.appScope.launch { container.widgetPublisher.publish() }
    }
}

class RecoveryWidgetReceiver : ApexWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = RecoveryWidget()
}

class TodayWidgetReceiver : ApexWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = TodayWidget()
}

class HeartRateWidgetReceiver : ApexWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = HeartRateWidget()
}
