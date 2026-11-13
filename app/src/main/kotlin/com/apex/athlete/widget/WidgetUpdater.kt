package com.apex.athlete.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.updateAll
import kotlinx.coroutines.CancellationException

/** Asks Android to redraw the widgets from the snapshot file. No exact alarms, no permissions. */
internal object WidgetUpdater {

    private val receivers: List<Class<out ApexWidgetReceiver>> = listOf(
        RecoveryWidgetReceiver::class.java,
        TodayWidgetReceiver::class.java,
        HeartRateWidgetReceiver::class.java,
    )

    /** True when at least one Apex widget is on a home screen. Cheap: one AppWidgetManager lookup per widget type. */
    fun hasAnyWidget(context: Context): Boolean {
        val manager = AppWidgetManager.getInstance(context.applicationContext)
        return receivers.any { manager.getAppWidgetIds(ComponentName(context.applicationContext, it)).isNotEmpty() }
    }

    /** Redraws every installed Apex widget. A failure in one never stops the others. */
    suspend fun refreshAll(context: Context) {
        val widgets: List<GlanceAppWidget> = listOf(RecoveryWidget(), TodayWidget(), HeartRateWidget())
        for (widget in widgets) {
            try {
                widget.updateAll(context.applicationContext)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // A widget that cannot be redrawn keeps what it shows; the next refresh tries again.
            }
        }
    }
}
