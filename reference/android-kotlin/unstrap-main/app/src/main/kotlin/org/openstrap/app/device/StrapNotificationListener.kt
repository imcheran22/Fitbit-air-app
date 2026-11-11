package org.openstrap.app.device

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.openstrap.app.OpenStrapApp

/** Passes the phone's notifications to [PhoneAlerts]. Android binds it once the user grants notification access. */
class StrapNotificationListener : NotificationListenerService() {
    /** Keys currently shown, so a re-post of the same notification counts as an update. */
    private val shown = HashSet<String>()

    private val alerts get() = (application as OpenStrapApp).container.phoneAlerts

    override fun onListenerConnected() {
        synchronized(shown) { shown.clear(); runCatching { activeNotifications }.getOrNull()?.forEach { shown += it.key } }
        alerts.refresh()
        alerts.reconnectStrap()
    }

    override fun onListenerDisconnected() = alerts.refresh()

    override fun onNotificationPosted(sbn: StatusBarNotification, rankingMap: RankingMap?) {
        val update = synchronized(shown) { !shown.add(sbn.key) }
        val ranking = rankingMap?.let { m -> Ranking().takeIf { m.getRanking(sbn.key, it) } }
        alerts.onNotification(sbn, ranking, update)
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) {
        synchronized(shown) { shown -= sbn.key }
        alerts.onNotificationRemoved(sbn.key)
    }
}
