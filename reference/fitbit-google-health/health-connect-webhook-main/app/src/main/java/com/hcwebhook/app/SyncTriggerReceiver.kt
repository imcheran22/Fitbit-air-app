package com.hcwebhook.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Receives [SyncTrigger.ACTION_SYNC] from Tasker, MacroDroid, adb or the widget's button.
 * It reads no other extras than the source label, and starts a normal sync.
 */
class SyncTriggerReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != SyncTrigger.ACTION_SYNC) return
        val source = intent.getStringExtra(SyncTrigger.EXTRA_SOURCE)
            ?.takeIf { it in ALLOWED_SOURCES } ?: "intent"
        val started = SyncTrigger.request(context, source)
        Log.d("SyncTriggerReceiver", if (started) "Sync started ($source)" else "Ignored: under a minute since the last trigger")
    }

    private companion object {
        val ALLOWED_SOURCES = setOf("intent", "widget")
    }
}
