package com.hcwebhook.app

import android.content.Context
import android.text.format.DateFormat
import android.text.format.DateUtils
import java.util.Date

/** Short "last sync" text for the widget and the tile. A clock time, so it never goes stale. */
object SyncStatusText {
    fun lastSync(context: Context): String {
        val time = PreferencesManager(context).getLastSyncTime()
            ?: return context.getString(R.string.trigger_never_synced)
        val formatted = if (DateUtils.isToday(time)) {
            DateFormat.getTimeFormat(context).format(Date(time))
        } else {
            DateUtils.formatDateTime(context, time, DateUtils.FORMAT_SHOW_DATE or DateUtils.FORMAT_SHOW_TIME or DateUtils.FORMAT_ABBREV_MONTH)
        }
        return context.getString(R.string.trigger_last_sync, formatted)
    }
}
