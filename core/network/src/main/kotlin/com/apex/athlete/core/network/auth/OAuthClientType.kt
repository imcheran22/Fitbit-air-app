package com.apex.athlete.core.network.auth

/**
 * Which kind of Google OAuth client the build was made for. It decides the redirect scheme only;
 * the rest of the flow (PKCE, no client secret) is identical.
 *
 * Chosen at build time by `apex.oauthClientType` or the environment variable `APEX_OAUTH_CLIENT_TYPE`
 * (see `app/build.gradle.kts`).
 */
enum class OAuthClientType(val wireName: String) {
    /** Android-type client (the documented fallback): redirect scheme is the application ID, `com.apex.athlete:/oauth2redirect`. */
    ANDROID("android"),

    /** iOS-type client (the default): redirect scheme is the reversed client ID, `com.googleusercontent.apps.<id>:/oauth2redirect`. */
    IOS("ios"),
    ;

    companion object {
        /** iOS style: Google's native-app page says custom URI schemes are no longer supported for Android-type clients. */
        val DEFAULT: OAuthClientType = IOS

        /** Case-insensitive; null, blank or unknown text gives [DEFAULT] (ios). Never throws. */
        fun parse(raw: String?): OAuthClientType {
            val v = raw?.trim()?.lowercase().orEmpty()
            return entries.firstOrNull { it.wireName == v } ?: DEFAULT
        }
    }
}
