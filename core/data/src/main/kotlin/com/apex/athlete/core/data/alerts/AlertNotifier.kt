package com.apex.athlete.core.data.alerts

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/**
 * Shows alerts as notifications. Needs the `POST_NOTIFICATIONS` permission to be declared in the
 * app manifest; on Android 13 and later the owner must also have granted it at runtime, and when
 * they have not this does nothing and reports false (it never throws).
 *
 * Lock screen: notifications are `VISIBILITY_PRIVATE` with a public version that carries no
 * number and no reading ([Alert.lockScreenText]); the full text shows only once unlocked.
 *
 * @param smallIconRes a monochrome status-bar icon; defaults to the app icon, which the app should override with its own.
 */
class AlertNotifier(
    context: Context,
    private val smallIconRes: Int = 0,
) {
    private val context = context.applicationContext

    /** Creates the channel. Safe to call any number of times. */
    fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(CHANNEL_ID, "Apex alerts", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Low recovery, readings outside your usual range, missing data and import reminders."
            lockscreenVisibility = android.app.Notification.VISIBILITY_PRIVATE
            setShowBadge(false)
        }
        context.getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
    }

    fun canPost(): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return false
        return NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    /** Posts [alert]. Returns false (and posts nothing) when notifications are not allowed. */
    fun post(alert: Alert): Boolean {
        if (!canPost()) return false
        ensureChannel()
        val icon = if (smallIconRes != 0) smallIconRes else context.applicationInfo.icon
        val open = context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
            PendingIntent.getActivity(context, alert.type.ordinal, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        }
        val publicVersion = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(icon)
            .setContentTitle("Apex")
            .setContentText(alert.lockScreenText)
            .build()
        val n = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(icon)
            .setContentTitle(alert.title)
            .setContentText(alert.body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(alert.body))
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(publicVersion)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .apply { open?.let { setContentIntent(it) } }
            .build()
        return try {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID_BASE + alert.type.ordinal, n)
            true
        } catch (_: SecurityException) {
            false // permission revoked between the check and the call
        }
    }

    companion object {
        const val CHANNEL_ID = "apex_alerts"
        private const val NOTIFICATION_ID_BASE = 7100
    }
}
