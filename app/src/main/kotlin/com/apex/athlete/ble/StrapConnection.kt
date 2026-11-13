package com.apex.athlete.ble

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow

enum class StrapFailure { UNSUPPORTED_ANDROID, NO_BLUETOOTH, BLUETOOTH_OFF, PERMISSION_MISSING, NOT_FOUND, CONNECTION_LOST, NO_HEART_RATE_SERVICE }

sealed interface StrapState {
    data object Idle : StrapState
    data object Scanning : StrapState
    data object Connecting : StrapState
    data class Connected(val deviceName: String?) : StrapState
    data class Failed(val reason: StrapFailure) : StrapState
}

/**
 * A Bluetooth heart-rate strap (standard Heart Rate service 0x180D). Read-only: the only write ever made to the
 * strap is the notification enable on the Heart Rate Measurement descriptor. Heart rate and RR intervals are
 * the strap's own values; nothing is stored here and nothing is invented when the strap is silent.
 */
interface StrapConnection {
    val state: StateFlow<StrapState>

    /** Latest heart rate in bpm; null when not connected or after the connection drops. */
    val heartRate: StateFlow<Int?>

    /** RR intervals in milliseconds as they arrive (for example for a spot HRV on the breathe screen). */
    val rrIntervalsMs: Flow<Int>

    /** Scans for the first strap advertising 0x180D and connects. No-op while already scanning or connected. */
    fun connect()

    fun disconnect()
}
