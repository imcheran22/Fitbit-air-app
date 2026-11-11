package com.hcwebhook.app

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews

/** 3×1: last sync time, the counts of the last 24 hours, a sync button, and a tap to open the app. */
class SyncStatusWidget : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { manager.updateAppWidget(it, views(context)) }
    }

    companion object {
        private fun views(context: Context): RemoteViews {
            val prefs = PreferencesManager(context)
            val views = RemoteViews(context.packageName, R.layout.widget_sync_status)
            views.setTextViewText(R.id.widget_status, SyncStatusText.lastSync(context))
            val events = Widgets.deliveriesLast24h(context)
            views.setTextViewText(
                R.id.widget_summary,
                if (events.isEmpty()) prefs.getLastSyncSummary().orEmpty()
                else context.getString(R.string.widget_counts, events.count { it.second }, events.count { !it.second }),
            )
            views.setOnClickPendingIntent(R.id.widget_sync, Widgets.syncIntent(context, "widget"))
            Widgets.openAppIntent(context)?.let { views.setOnClickPendingIntent(R.id.widget_root, it) }
            return views
        }
    }
}
