package ai.synheart.wear.adapters

import ai.synheart.wear.SynheartWearException
import ai.synheart.wear.models.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import java.util.Date

/**
 * Public facade for the Garmin Health SDK (native device) integration.
 *
 * Wraps the native Garmin Health SDK and exposes only generic, SDK-owned
 * types — [ScannedDevice], [PairedDevice], [DeviceConnectionState],
 * [DeviceConnectionEvent], [WearMetrics].
 *
 * **Open-source build is a stub.** The Garmin Health SDK real-time
 * streaming (RTS) capability requires a separate license from Garmin
 * and ships as a proprietary native binary. Without that overlay every
 * data-access method on this class throws [SynheartWearException]
 * immediately rather than returning silent empty results — so consumers
 * can't mistake a stubbed build for a working one.
 *
 * Build with the overlay via `make build-with-garmin` (see
 * [GARMIN_SETUP.md](../../../../GARMIN_SETUP.md)). For cloud-based
 * Garmin data (OAuth + webhooks) without the overlay, use
 * [GarminProvider] instead.
 *
 * ```kotlin
 * val garmin = GarminHealth(licenseKey = "your-garmin-sdk-key")
 * garmin.initialize()
 * try {
 *     val paired = garmin.pairDevice(device)
 * } catch (e: SynheartWearException) {
 *     // OSS build: overlay not linked. Switch to GarminProvider for cloud data.
 * }
 * ```
 */
class GarminHealth(
    @Suppress("UNUSED_PARAMETER") licenseKey: String
) {
    private var _isInitialized = false

    /** Whether the SDK facade is initialized (does not imply the overlay is present). */
    val isInitialized: Boolean get() = _isInitialized

    /**
     * Initialize the Garmin Health SDK facade.
     *
     * Succeeds even in the OSS build; subsequent data-access calls
     * still throw because the licensed native binary is absent.
     */
    suspend fun initialize() {
        if (_isInitialized) return
        _isInitialized = true
    }

    fun dispose() {
        _isInitialized = false
    }

    // ── Scanning ──────────────────────────────────────────────

    suspend fun startScanning(timeoutSeconds: Int = 30) {
        ensureInitialized()
        notLinked("startScanning")
    }

    suspend fun stopScanning() {
        notLinked("stopScanning")
    }

    val scannedDevicesFlow: Flow<List<ScannedDevice>>
        get() = flow { notLinked("scannedDevicesFlow") }

    // ── Pairing ───────────────────────────────────────────────

    suspend fun pairDevice(device: ScannedDevice): PairedDevice {
        ensureInitialized()
        notLinked("pairDevice")
    }

    suspend fun forgetDevice(device: PairedDevice) {
        ensureInitialized()
        notLinked("forgetDevice")
    }

    suspend fun getPairedDevices(): List<PairedDevice> {
        ensureInitialized()
        notLinked("getPairedDevices")
    }

    // ── Connection ────────────────────────────────────────────

    val connectionStateFlow: Flow<DeviceConnectionEvent>
        get() = flow { notLinked("connectionStateFlow") }

    suspend fun getConnectionState(device: PairedDevice): DeviceConnectionState {
        ensureInitialized()
        notLinked("getConnectionState")
    }

    // ── Sync ──────────────────────────────────────────────────

    suspend fun requestSync(device: PairedDevice) {
        ensureInitialized()
        notLinked("requestSync")
    }

    // ── Streaming ─────────────────────────────────────────────

    suspend fun startStreaming(device: PairedDevice? = null) {
        ensureInitialized()
        notLinked("startStreaming")
    }

    suspend fun stopStreaming(device: PairedDevice? = null) {
        notLinked("stopStreaming")
    }

    val realTimeFlow: Flow<WearMetrics>
        get() = flow { notLinked("realTimeFlow") }

    // ── Metrics ───────────────────────────────────────────────

    suspend fun readMetrics(
        startTime: Date? = null,
        endTime: Date? = null
    ): WearMetrics? {
        ensureInitialized()
        notLinked("readMetrics")
    }

    // ── Private ───────────────────────────────────────────────

    private fun ensureInitialized() {
        if (!_isInitialized) {
            throw SynheartWearException(
                "GarminHealth not initialized. Call initialize() first."
            )
        }
    }

    private fun notLinked(operation: String): Nothing {
        throw SynheartWearException(
            "GarminHealth.$operation: native Garmin Health SDK overlay is not linked " +
            "in this OSS build. Run `make build-with-garmin` to link the licensed " +
            "binary, or switch to GarminProvider for cloud-based Garmin data. " +
            "See GARMIN_SETUP.md for details."
        )
    }
}
