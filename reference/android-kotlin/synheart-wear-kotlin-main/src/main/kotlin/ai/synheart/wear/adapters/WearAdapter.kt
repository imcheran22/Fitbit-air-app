package ai.synheart.wear.adapters

import ai.synheart.wear.models.PermissionType
import ai.synheart.wear.models.WearMetrics
import kotlinx.serialization.InternalSerializationApi

/**
 * Interface for wearable device adapters
 *
 * Implementations provide device-specific data access while conforming
 * to the unified WearMetrics output format.
 */
@OptIn(InternalSerializationApi::class)
internal interface WearAdapter {
    /**
     * Unique identifier for this adapter
     */
    val id: String

    /**
     * Initialize the adapter
     */
    suspend fun initialize()

    /**
     * Request permissions from the user
     *
     * @param permissions Set of permission types to request
     * @return Map of permission types to granted status
     */
    suspend fun requestPermissions(permissions: Set<PermissionType>): Map<PermissionType, Boolean>

    /**
     * Get current permission status
     *
     * @return Map of permission types to granted status
     */
    fun getPermissionStatus(): Map<PermissionType, Boolean>

    /**
     * Read a snapshot of current metrics
     *
     * @param isRealTime Whether to read real-time data
     * @return WearMetrics containing current biometric data
     */
    suspend fun readSnapshot(isRealTime: Boolean = false): WearMetrics

    /**
     * Check if adapter is available on this device
     */
    suspend fun isAvailable(): Boolean
}
