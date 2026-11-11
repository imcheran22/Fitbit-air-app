package com.hcwebhook.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.os.Bundle
import android.text.format.DateFormat
import android.widget.RemoteViews
import androidx.core.content.ContextCompat
import java.util.Date
import kotlin.math.roundToInt

/** All home screen widgets: update them together, after every sync. */
object Widgets {
    private val providers = listOf(
        SyncStatusWidget::class.java,
        SyncNowWidget::class.java,
        HeartbeatWidget::class.java,
        TodayWidget::class.java,
    )

    /** Redraws every placed widget. */
    fun updateAll(context: Context) {
        val manager = AppWidgetManager.getInstance(context)
        providers.forEach { provider ->
            val ids = manager.getAppWidgetIds(ComponentName(context, provider))
            if (ids.isEmpty()) return@forEach
            context.sendBroadcast(
                Intent(context, provider)
                    .setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
                    .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
            )
        }
    }

    /**
     * After a sync, while the app has Health Connect access: reads the Today values when a Today
     * widget is placed, then redraws every widget.
     */
    suspend fun afterSync(context: Context) {
        val manager = AppWidgetManager.getInstance(context)
        if (manager.getAppWidgetIds(ComponentName(context, TodayWidget::class.java)).isNotEmpty()) {
            val prefs = PreferencesManager(context)
            runCatching { HealthConnectManager(context).todaySnapshot(prefs.getEnabledDataTypes()) }
                .onSuccess(prefs::setTodaySnapshot)
        }
        updateAll(context)
    }

    internal fun syncIntent(context: Context, source: String): PendingIntent = PendingIntent.getBroadcast(
        context,
        source.hashCode(),
        Intent(context, SyncTriggerReceiver::class.java).apply {
            action = SyncTrigger.ACTION_SYNC
            putExtra(SyncTrigger.EXTRA_SOURCE, source)
        },
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    internal fun openAppIntent(context: Context): PendingIntent? =
        context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
            PendingIntent.getActivity(context, 1, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        }

    /** Deliveries of the last 24 hours, without test sends: (time, success). */
    internal fun deliveriesLast24h(context: Context): List<Pair<Long, Boolean>> {
        val cutoff = System.currentTimeMillis() - DAY_MS
        return PreferencesManager(context).getWebhookLogs()
            .filter { it.timestamp >= cutoff && it.syncType != "test" }
            .map { it.timestamp to it.success }
    }

    internal fun clock(context: Context, time: Long): String = DateFormat.getTimeFormat(context).format(Date(time))

    internal const val DAY_MS = 24 * 60 * 60 * 1000L
}

/** 1×1: one tap starts a sync. */
class SyncNowWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        val views = RemoteViews(context.packageName, R.layout.widget_sync_now)
        views.setOnClickPendingIntent(R.id.widget_root, Widgets.syncIntent(context, "widget_sync_now"))
        ids.forEach { manager.updateAppWidget(it, views) }
    }
}

/** 4×2: the 24-hour activity bars of the status card, the counts and Sync now. */
class HeartbeatWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { manager.updateAppWidget(it, views(context, manager.getAppWidgetOptions(it))) }
    }

    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
        manager.updateAppWidget(id, views(context, options))
    }

    private fun views(context: Context, options: Bundle): RemoteViews {
        val events = Widgets.deliveriesLast24h(context)
        val views = RemoteViews(context.packageName, R.layout.widget_heartbeat)
        views.setTextViewText(R.id.widget_title, SyncStatusText.lastSync(context))
        views.setTextViewText(
            R.id.widget_counts,
            context.getString(R.string.widget_counts, events.count { it.second }, events.count { !it.second }),
        )
        views.setImageViewBitmap(R.id.widget_pulse, barsBitmap(context, options, events))
        views.setOnClickPendingIntent(R.id.widget_sync, Widgets.syncIntent(context, "widget_heartbeat"))
        Widgets.openAppIntent(context)?.let { views.setOnClickPendingIntent(R.id.widget_root, it) }
        return views
    }

    /** The activity bars at the widget's own size: the same bars as the status card in the app. */
    private fun barsBitmap(context: Context, options: Bundle, events: List<Pair<Long, Boolean>>): Bitmap {
        val density = context.resources.displayMetrics.density
        // In portrait the widget is MIN_WIDTH wide; a wrong width would stretch the bars.
        val widthDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH).takeIf { it > 0 } ?: 300
        // Card padding is 16 + 16, bars have 4 more at the end.
        val width = ((widthDp - 36) * density).roundToInt().coerceIn(100, 1600)
        val height = (32 * density).roundToInt()
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val ink = ContextCompat.getColor(context, R.color.widget_on_brand)
        val on = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = ink }
        val off = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = ink; alpha = 31 }
        val bars = hourlyBars(events, System.currentTimeMillis())
        val max = (bars.maxOfOrNull { it.total } ?: 0).coerceAtLeast(1)
        val gap = 3 * density
        val w = (width - gap * 23) / 24
        bars.forEachIndexed { index, hour ->
            val h = if (hour.total == 0) w else (height.toFloat() * hour.total / max).coerceAtLeast(w)
            val x = index * (w + gap)
            canvas.drawRoundRect(x, height - h, x + w, height.toFloat(), w / 2, w / 2, if (hour.total == 0) off else on)
        }
        return bitmap
    }
}

/** 2×2: today's steps, last sleep, latest weight and heart rate. Hidden while app lock is on. */
class TodayWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        val prefs = PreferencesManager(context)
        val views = RemoteViews(context.packageName, R.layout.widget_today)
        val locked = prefs.isAppLockEnabled()
        views.setViewVisibility(R.id.widget_locked, if (locked) android.view.View.VISIBLE else android.view.View.GONE)
        views.setViewVisibility(R.id.widget_values, if (locked) android.view.View.GONE else android.view.View.VISIBLE)
        val snapshot = prefs.getTodaySnapshot()?.takeIf { android.text.format.DateUtils.isToday(it.updatedAt) || it.weightKg != null }
        val none = "–"
        if (!locked) {
            views.setTextViewText(R.id.widget_steps, snapshot?.steps?.let { "%,d".format(it) } ?: none)
            views.setTextViewText(
                R.id.widget_sleep,
                snapshot?.sleepMinutes?.let { context.getString(R.string.widget_sleep_value, it / 60, it % 60) } ?: none,
            )
            views.setTextViewText(R.id.widget_weight, snapshot?.weightKg?.let { context.getString(R.string.widget_weight_value, it) } ?: none)
            views.setTextViewText(R.id.widget_heart, snapshot?.heartRate?.let { context.getString(R.string.widget_heart_value, it) } ?: none)
        }
        views.setTextViewText(
            R.id.widget_updated,
            snapshot?.let { context.getString(R.string.widget_updated, Widgets.clock(context, it.updatedAt)) }
                ?: context.getString(R.string.widget_no_data),
        )
        Widgets.openAppIntent(context)?.let { views.setOnClickPendingIntent(R.id.widget_root, it) }
        ids.forEach { manager.updateAppWidget(it, views) }
    }
}
