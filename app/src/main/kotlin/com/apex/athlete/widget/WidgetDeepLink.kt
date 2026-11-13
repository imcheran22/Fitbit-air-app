package com.apex.athlete.widget

import android.content.Context
import android.content.Intent
import android.net.Uri
import com.apex.athlete.MainActivity

/**
 * Where a widget tap goes. The widget puts one of the route strings below in [EXTRA_ROUTE] of the intent that
 * opens `MainActivity`; the host reads it with [routeFrom] and navigates. The routes are the base names of the
 * entries in `ApexRoutes` (the day argument is optional there, so the screen opens on the selected day).
 */
object WidgetDeepLink {
    const val EXTRA_ROUTE: String = "com.apex.athlete.widget.EXTRA_ROUTE"

    /** The Recovery screen (`ApexRoutes.RECOVERY` is `recovery?d={d}`). */
    const val ROUTE_RECOVERY: String = "recovery"

    /** Overview tab root (`ApexRoutes.OVERVIEW`). */
    const val ROUTE_OVERVIEW: String = "overview"

    /** The Heart-rate day screen (`ApexRoutes.HEART_RATE_DAY` is `heartrate?d={d}`). */
    const val ROUTE_HEART_RATE: String = "heartrate"

    val routes: Set<String> = setOf(ROUTE_RECOVERY, ROUTE_OVERVIEW, ROUTE_HEART_RATE)

    private const val ACTION_OPEN = "com.apex.athlete.widget.OPEN"
    private const val URI_SCHEME = "apex-widget"

    /** [route] when it is one of [routes], otherwise null. MainActivity is exported, so the extra is never trusted blindly. */
    fun validate(route: String?): String? = route?.takeIf { it in routes }

    /** The widget route carried by [intent], or null when it carries none (or an unknown one). */
    fun routeFrom(intent: Intent?): String? = validate(intent?.getStringExtra(EXTRA_ROUTE))

    /**
     * The intent a widget tap starts. The data URI only makes each target's PendingIntent distinct (extras are
     * ignored when Android compares intents); MainActivity has no filter for it and is addressed explicitly.
     */
    internal fun launchIntent(context: Context, route: String): Intent =
        Intent(context, MainActivity::class.java)
            .setAction(ACTION_OPEN)
            .setData(Uri.fromParts(URI_SCHEME, route, null))
            .putExtra(EXTRA_ROUTE, route)
}
