package com.apex.athlete

import android.app.Activity
import android.content.Intent
import android.os.Bundle

/**
 * Receives Google's OAuth redirect (custom scheme from the manifest placeholder), hands the URI to
 * the sign-in completion and finishes at once. The URI is never logged. Completion runs in the
 * application scope, so it does not depend on this activity living.
 */
class OAuthRedirectActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val uri = intent?.data?.toString()
        if (uri != null) {
            (application as ApexAthleteApplication).container.auth.complete(uri)
        }
        startActivity(
            Intent(this, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
        )
        finish()
    }
}
