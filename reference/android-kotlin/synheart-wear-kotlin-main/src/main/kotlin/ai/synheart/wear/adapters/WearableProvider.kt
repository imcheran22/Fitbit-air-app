package ai.synheart.wear.adapters

import ai.synheart.wear.models.DeviceAdapter
import ai.synheart.wear.models.WearMetrics
import kotlinx.serialization.InternalSerializationApi
import java.util.*

/**
 * Protocol defining the interface for all wearable device providers
 *
 * All wearable providers (WHOOP, Garmin, Fitbit, etc.) must implement this interface
 * to ensure consistent interface across different vendors.
 */
@OptIn(InternalSerializationApi::class)
interface WearableProvider {
    /**
     * The vendor/device type this provider supports
     */
    val vendor: DeviceAdapter
    
    /**
     * Check if a user account is currently connected
     *
     * @return True if connected, false otherwise
     */
    fun isConnected(): Boolean
    
    /**
     * Get the connected user ID
     *
     * @return User ID if connected, null otherwise
     */
    fun getUserId(): String?
    
    /**
     * Connect the user's account (initiates OAuth flow)
     *
     * This method will:
     * 1. Get authorization URL from Wear Service
     * 2. Return URL to be opened in browser/Chrome Custom Tab
     * 
     * User must handle deep link callback separately and call connectWithCode()
     *
     * @return Authorization URL to open in browser
     * @throws Exception if connection fails
     */
    suspend fun connect(): String
    
    /**
     * Complete the OAuth connection with authorization code
     *
     * This method should be called when the app receives the OAuth callback
     * via deep link with the authorization code.
     *
     * @param code Authorization code from OAuth callback
     * @param state State parameter from OAuth callback (for CSRF protection)
     * @param redirectUri The redirect URI that was used in the authorization request
     * @return User ID from successful connection
     * @throws Exception if connection fails
     */
    suspend fun connectWithCode(code: String, state: String, redirectUri: String): String
    
    /**
     * Disconnect the user's account
     *
     * Removes the connection and clears stored credentials.
     *
     * @throws Exception if disconnection fails
     */
    suspend fun disconnect()
    
    /**
     * Fetch recovery data
     *
     * @param startDate Start date for data query (optional)
     * @param endDate End date for data query (optional)
     * @param limit Maximum number of records (optional)
     * @param cursor Pagination cursor (optional)
     * @return List of WearMetrics containing recovery data
     */
    suspend fun fetchRecovery(
        startDate: Date? = null,
        endDate: Date? = null,
        limit: Int? = null,
        cursor: String? = null
    ): List<WearMetrics>
}

