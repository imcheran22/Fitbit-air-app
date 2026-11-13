package com.apex.athlete.core.data.source

import com.apex.athlete.core.network.GoogleHealthNetwork
import com.apex.athlete.core.network.auth.AuthState
import com.apex.athlete.core.network.googlehealth.ApiResult
import com.apex.athlete.core.network.googlehealth.GhPairedDevice
import com.apex.athlete.core.network.googlehealth.GoogleHealthError
import com.apex.athlete.core.network.googlehealth.GoogleTime
import com.apex.athlete.core.network.rate.RequestPriority
import kotlinx.coroutines.flow.first

/**
 * What the Google Health `pairedDevices.list` call tells about the Fitbit Air. Every field may be null:
 * a missing value is shown as "Not available", never guessed. Not stored in Room.
 */
data class FitbitAirStatus(
    /** `deviceVersion`, the product name of the device. */
    val model: String?,
    /** 0..100, or null when absent or out of range. */
    val batteryPercent: Int?,
    /** `High`, `Medium`, `Low` or `Empty` as sent; shown only when no percentage is known. */
    val batteryStatus: String?,
    /** Last sync of the band with the phone app, epoch millis. */
    val lastSyncMillis: Long?,
) {
    companion object {
        /** The tracker that synced most recently; scales and other kinds are ignored. Null when there is none. */
        fun from(devices: List<GhPairedDevice>): FitbitAirStatus? {
            val trackers = devices.filter { it.deviceType != "SCALE" }
            val best = trackers.maxByOrNull { GoogleTime.parseInstant(it.lastSyncTime)?.toEpochMilli() ?: Long.MIN_VALUE }
                ?: return null
            return FitbitAirStatus(
                model = best.deviceVersion?.trim()?.takeIf { it.isNotEmpty() },
                batteryPercent = best.batteryLevel?.takeIf { it in 0L..100L }?.toInt(),
                batteryStatus = best.batteryStatus?.trim()?.takeIf { it.isNotEmpty() },
                lastSyncMillis = GoogleTime.parseInstant(best.lastSyncTime)?.toEpochMilli(),
            )
        }
    }
}

sealed interface AirStatusResult {
    data class Found(val status: FitbitAirStatus) : AirStatusResult
    /** Signed in, but no tracker is paired (or the list is empty). */
    data object NoDevice : AirStatusResult
    data object NotSignedIn : AirStatusResult
    /** 403: this sign-in predates the settings scope. Reconnect Google Health to grant it. */
    data object ScopeMissing : AirStatusResult
    /** Network, server, rate limit or unreadable answer. Not cached. */
    data object Unavailable : AirStatusResult
}

/**
 * Fetches the Air's status on demand (one read-only `GET`, foreground priority) and keeps the answer in memory
 * for [cacheMillis]. Failures are not cached. Nothing here is written to the database or logged.
 */
class FitbitAirStatusReader(
    private val network: () -> GoogleHealthNetwork,
    private val nowMillis: () -> Long = System::currentTimeMillis,
    private val cacheMillis: Long = 5 * 60_000L,
) {
    private class Cached(val network: GoogleHealthNetwork, val result: AirStatusResult, val atMillis: Long)

    @Volatile private var cache: Cached? = null

    /** The last good answer for the current network, if still fresh; no request. */
    fun cached(): AirStatusResult? {
        val c = cache ?: return null
        return if (c.network === network() && nowMillis() - c.atMillis < cacheMillis) c.result else null
    }

    suspend fun get(force: Boolean = false): AirStatusResult {
        val net = network() as? GoogleHealthNetwork.Ready ?: return AirStatusResult.NotSignedIn
        if (net.authState.first() !is AuthState.SignedIn) return AirStatusResult.NotSignedIn
        if (!force) cached()?.let { return it }
        val result = when (val r = net.client.listPairedDevices(RequestPriority.FOREGROUND)) {
            ApiResult.NoData -> AirStatusResult.NoDevice
            is ApiResult.Success -> FitbitAirStatus.from(r.value)?.let { AirStatusResult.Found(it) } ?: AirStatusResult.NoDevice
            is ApiResult.Failure -> return when (r.error) {
                is GoogleHealthError.PermissionDenied -> AirStatusResult.ScopeMissing
                is GoogleHealthError.AuthExpired, GoogleHealthError.NotConfigured -> AirStatusResult.NotSignedIn
                else -> AirStatusResult.Unavailable
            }
        }
        cache = Cached(net, result, nowMillis())
        return result
    }
}
