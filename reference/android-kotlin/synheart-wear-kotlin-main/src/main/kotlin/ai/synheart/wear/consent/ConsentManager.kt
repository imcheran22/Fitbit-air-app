package ai.synheart.wear.consent

import android.content.Context
import ai.synheart.wear.models.PermissionType

/**
 * Manages user consent for data access and processing
 *
 * Implements privacy-first consent management following GDPR requirements.
 *
 * @param context Android application context
 */
class ConsentManager(private val context: Context) {

    private val prefs by lazy {
        context.getSharedPreferences("synheart_wear_consent", Context.MODE_PRIVATE)
    }

    /**
     * Initialize consent manager
     */
    suspend fun initialize() {
        // Initialize consent tracking
    }

    /**
     * Validate that required consents are granted
     *
     * @param permissions Set of required permissions
     * @throws ConsentException if required consents are not granted
     */
    fun validateConsents(permissions: Set<PermissionType>) {
        permissions.forEach { permission ->
            val key = "consent_${permission.name}"
            if (!prefs.getBoolean(key, false)) {
                throw ConsentException("Consent required for $permission")
            }
        }
    }

    /**
     * Grant consent for a permission
     *
     * @param permission Permission type
     */
    fun grantConsent(permission: PermissionType) {
        prefs.edit()
            .putBoolean("consent_${permission.name}", true)
            .putLong("consent_time_${permission.name}", System.currentTimeMillis())
            .apply()
    }

    /**
     * Revoke consent for a permission
     *
     * @param permission Permission type
     */
    fun revokeConsent(permission: PermissionType) {
        prefs.edit()
            .putBoolean("consent_${permission.name}", false)
            .apply()
    }

    /**
     * Revoke all consents (GDPR compliance)
     */
    fun revokeAllConsents() {
        prefs.edit().clear().apply()
    }

    /**
     * Check if consent is granted
     *
     * @param permission Permission type
     * @return True if consent is granted
     */
    fun hasConsent(permission: PermissionType): Boolean {
        return prefs.getBoolean("consent_${permission.name}", false)
    }
}

/**
 * Exception thrown when consent validation fails
 */
class ConsentException(message: String) : Exception(message)
