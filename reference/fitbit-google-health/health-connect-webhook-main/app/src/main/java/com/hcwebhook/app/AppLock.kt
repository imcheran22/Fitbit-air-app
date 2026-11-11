package com.hcwebhook.app

import android.content.Context
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity

/**
 * App lock with the device's own screen lock: fingerprint, face, or the PIN, pattern or password.
 * The app keeps no secret of its own. It asks at a cold start and every time the user comes back
 * to the app. Screens that the app opens itself (Health Connect permissions, the file picker,
 * system settings) call [allowNextLeave] first, so coming back from them does not ask again.
 */
object AppLock {
    private const val AUTHENTICATORS = BIOMETRIC_WEAK or DEVICE_CREDENTIAL

    @Volatile private var unlocked = false
    @Volatile private var backgroundedAt: Long? = null
    /** The system prompt is showing; its PIN screen is another activity, so leaving is expected. */
    @Volatile private var authenticating = false
    /** The app opened a screen of its own; coming back from it does not ask. */
    @Volatile private var leaveAllowed = false

    /** True when the device has a screen lock, so app lock can work. */
    fun canUse(context: Context): Boolean =
        BiometricManager.from(context).canAuthenticate(AUTHENTICATORS) == BiometricManager.BIOMETRIC_SUCCESS

    fun isLocked(context: Context, now: Long = System.currentTimeMillis()): Boolean {
        if (!PreferencesManager(context).isAppLockEnabled()) return false
        val locked = lockedAfter(unlocked, backgroundedAt, now)
        if (locked) unlocked = false
        return locked
    }

    /** Locked when never unlocked in this process, or when the user left the app. */
    internal fun lockedAfter(unlocked: Boolean, backgroundedAt: Long?, now: Long): Boolean =
        !unlocked || backgroundedAt != null

    /** Call before the app opens a screen of its own, such as the Health Connect permissions. */
    fun allowNextLeave() {
        leaveAllowed = true
    }

    fun onBackground(now: Long = System.currentTimeMillis()) {
        if (authenticating || leaveAllowed) return
        backgroundedAt = now
    }

    /** Call in onStart after [isLocked]: the app is in front again. */
    fun onForeground() {
        backgroundedAt = null
        leaveAllowed = false
    }

    /** Shows the system prompt. [onResult] gets true when the user unlocked. */
    fun authenticate(activity: FragmentActivity, title: String, onResult: (Boolean) -> Unit) {
        if (authenticating) return
        authenticating = true
        val prompt = BiometricPrompt(
            activity,
            ContextCompat.getMainExecutor(activity),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    authenticating = false
                    unlocked = true
                    backgroundedAt = null
                    onResult(true)
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    authenticating = false
                    onResult(false)
                }
            },
        )
        prompt.authenticate(
            BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setAllowedAuthenticators(AUTHENTICATORS)
                .build()
        )
    }
}

/** Hides the app's preview in Recents while app lock is on (Android 13+). Screenshots still work. */
fun applyRecentsPreview(activity: android.app.Activity) {
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
        activity.setRecentsScreenshotEnabled(!PreferencesManager(activity).isAppLockEnabled())
    }
}
