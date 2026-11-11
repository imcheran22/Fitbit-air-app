package com.apex.athlete.core.network.auth

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent

/** Opens the Google consent page in a Chrome Custom Tab (falls back to the default browser). */
object CustomTabsLauncher {
    /**
     * Launches [request]'s URL. Only `https` URLs are opened, so a bad configuration can never
     * hand the browser another kind of link.
     */
    fun launch(context: Context, request: AuthorizationRequest) {
        val uri = Uri.parse(request.url)
        require(uri.scheme == "https") { "authorization URL must be https" }
        val intent = CustomTabsIntent.Builder().setShowTitle(true).build()
        if (context !is Activity) intent.intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        intent.launchUrl(context, uri)
    }
}
