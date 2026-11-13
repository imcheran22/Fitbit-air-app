package com.apex.athlete.ble

/**
 * Runtime Bluetooth permissions for the strap. Apex supports the strap on Android 12 (API 31) and newer only:
 * below that, scanning needs the location permission, which a private health app should not ask for.
 * BLUETOOTH_SCAN is declared `neverForLocation` in the manifest.
 */
object BlePermissions {
    const val SCAN = "android.permission.BLUETOOTH_SCAN"
    const val CONNECT = "android.permission.BLUETOOTH_CONNECT"

    fun isSupported(sdkInt: Int): Boolean = sdkInt >= 31

    fun required(sdkInt: Int): List<String> = if (isSupported(sdkInt)) listOf(SCAN, CONNECT) else emptyList()

    fun missing(sdkInt: Int, granted: (String) -> Boolean): List<String> = required(sdkInt).filterNot(granted)
}
