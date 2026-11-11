package ai.synheart.wear.adapters

import android.annotation.SuppressLint
import android.bluetooth.*
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.ParcelUuid
import android.util.Log
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import java.util.UUID

/**
 * BLE Heart Rate Monitor provider using Android BluetoothLeScanner
 *
 * Provides scan, connect, disconnect, and real-time heart rate streaming
 * from any Bluetooth Low Energy heart rate monitor (Polar, Garmin, Wahoo, etc.).
 *
 * Implements RFC-BLE-HRM: reconnection with 3 retries and exponential backoff,
 * HR parsing (uint8/uint16 + RR intervals), and structured error codes.
 */
class BleHrmProvider(private val context: Context) {

    companion object {
        private const val TAG = "BleHrmProvider"

        // Standard Bluetooth SIG UUIDs
        val HR_SERVICE_UUID: UUID = UUID.fromString("0000180d-0000-1000-8000-00805f9b34fb")
        val HR_MEASUREMENT_UUID: UUID = UUID.fromString("00002a37-0000-1000-8000-00805f9b34fb")
        val BATTERY_SERVICE_UUID: UUID = UUID.fromString("0000180f-0000-1000-8000-00805f9b34fb")
        val BATTERY_LEVEL_UUID: UUID = UUID.fromString("00002a19-0000-1000-8000-00805f9b34fb")
        val CCCD_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

        private const val MAX_RECONNECT_ATTEMPTS = 3
        private val RECONNECT_BACKOFFS = longArrayOf(1000L, 2000L, 4000L)
    }

    // Public properties
    private val _heartRateFlow = MutableSharedFlow<HeartRateSample>(replay = 1)

    /** Flow of heart rate samples from the connected device */
    val heartRateFlow: SharedFlow<HeartRateSample> = _heartRateFlow.asSharedFlow()

    /** Last received heart rate sample */
    var lastSample: HeartRateSample? = null
        private set

    // Private state
    private val bluetoothAdapter: BluetoothAdapter? =
        (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

    private var bluetoothGatt: BluetoothGatt? = null
    private var connectedDeviceId: String? = null
    private var connectedDeviceName: String? = null
    private var currentSessionId: String? = null
    private var enableBattery: Boolean = false

    private var scanJob: Job? = null
    private var reconnectJob: Job? = null
    private var reconnectAttempt = 0
    private var isReconnecting = false

    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())

    // Scan callback
    private var scanResults: MutableMap<String, BleHrmDevice> = mutableMapOf()
    private var scanContinuation: CancellableContinuation<List<BleHrmDevice>>? = null

    @SuppressLint("MissingPermission")
    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val device = result.device
            val name = result.scanRecord?.deviceName ?: device.name
            val bleDevice = BleHrmDevice(
                deviceId = device.address,
                name = name,
                rssi = result.rssi
            )
            scanResults[device.address] = bleDevice
        }

        override fun onScanFailed(errorCode: Int) {
            Log.e(TAG, "Scan failed with error code: $errorCode")
            scanContinuation?.resumeWith(Result.failure(
                BleHrmException(BleHrmErrorCode.PERMISSION_DENIED, "BLE scan failed with error: $errorCode")
            ))
            scanContinuation = null
        }
    }

    // GATT callback
    @SuppressLint("MissingPermission")
    /**
     * Ask for a low-latency connection interval before enabling HR notifications.
     *
     * Chest straps that report RR intervals send one notification per heartbeat.
     * On the platform's default (balanced) interval the link cannot always carry
     * a notification per beat once heart rate climbs past roughly 70 bpm, and the
     * strap drops the beats it could not send rather than queueing them. The HR
     * value stays plausible, so the loss is invisible downstream; only the RR
     * series is short. A high-priority interval keeps up with any human heart
     * rate. Best-effort: the call is advisory and the stack may decline.
     */
    private fun requestLowLatency(gatt: BluetoothGatt) {
        try {
            gatt.requestConnectionPriority(BluetoothGatt.CONNECTION_PRIORITY_HIGH)
        } catch (_: SecurityException) {
            // Missing BLUETOOTH_CONNECT at this point would already have failed connectGatt.
        }
    }

    private val gattCallback = object : BluetoothGattCallback() {

        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> {
                    Log.d(TAG, "Connected to GATT server")
                    isReconnecting = false
                    reconnectAttempt = 0
                    requestLowLatency(gatt)
                    gatt.discoverServices()
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    Log.d(TAG, "Disconnected from GATT server (status=$status)")
                    bluetoothGatt = null

                    if (isReconnecting || (status != 0 && reconnectAttempt < MAX_RECONNECT_ATTEMPTS)) {
                        attemptReconnect()
                    } else {
                        connectedDeviceId = null
                        connectedDeviceName = null
                    }
                }
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                Log.e(TAG, "Service discovery failed: $status")
                return
            }

            val hrService = gatt.getService(HR_SERVICE_UUID)
            if (hrService == null) {
                Log.e(TAG, "Heart Rate service not found")
                return
            }

            val hrCharacteristic = hrService.getCharacteristic(HR_MEASUREMENT_UUID)
            if (hrCharacteristic == null) {
                Log.e(TAG, "Heart Rate Measurement characteristic not found")
                return
            }

            // Enable notifications for HR measurement
            gatt.setCharacteristicNotification(hrCharacteristic, true)
            val descriptor = hrCharacteristic.getDescriptor(CCCD_UUID)
            if (descriptor != null) {
                descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                gatt.writeDescriptor(descriptor)
            }

            // Optionally read battery
            if (enableBattery) {
                val batteryService = gatt.getService(BATTERY_SERVICE_UUID)
                val batteryChar = batteryService?.getCharacteristic(BATTERY_LEVEL_UUID)
                if (batteryChar != null) {
                    // Queue battery read after descriptor write
                    scope.launch {
                        delay(500)
                        gatt.readCharacteristic(batteryChar)
                    }
                }
            }
        }

        override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            if (characteristic.uuid == HR_MEASUREMENT_UUID) {
                val data = characteristic.value ?: return
                val (bpm, rrIntervals) = HeartRateParser.parse(data)
                if (bpm <= 0) return

                val sample = HeartRateSample(
                    tsMs = System.currentTimeMillis(),
                    bpm = bpm,
                    source = "ble_hrm",
                    deviceId = connectedDeviceId ?: "",
                    deviceName = connectedDeviceName,
                    sessionId = currentSessionId,
                    rrIntervalsMs = rrIntervals
                )
                lastSample = sample
                scope.launch {
                    _heartRateFlow.emit(sample)
                }
            }
        }
    }

    // MARK: - Public Methods

    /**
     * Scan for BLE heart rate monitors
     *
     * @param timeoutMs Scan timeout in milliseconds (default 10000)
     * @param namePrefix Optional filter by device name prefix
     * @return List of discovered BLE HRM devices
     * @throws BleHrmException on bluetooth/permission errors
     */
    @SuppressLint("MissingPermission")
    suspend fun scan(timeoutMs: Long = 10000, namePrefix: String? = null): List<BleHrmDevice> {
        ensureBluetoothReady()

        val scanner = bluetoothAdapter?.bluetoothLeScanner
            ?: throw BleHrmException(BleHrmErrorCode.BLUETOOTH_OFF, "BLE scanner not available")

        scanResults.clear()

        val filters = listOf(
            ScanFilter.Builder()
                .setServiceUuid(ParcelUuid(HR_SERVICE_UUID))
                .build()
        )
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()

        return suspendCancellableCoroutine { continuation ->
            scanContinuation = continuation

            scanner.startScan(filters, settings, scanCallback)

            // Stop scan after timeout
            scanJob = scope.launch {
                delay(timeoutMs)
                scanner.stopScan(scanCallback)

                val results = if (namePrefix != null) {
                    scanResults.values.filter { it.name?.startsWith(namePrefix) == true }
                } else {
                    scanResults.values.toList()
                }

                if (scanContinuation != null) {
                    scanContinuation = null
                    continuation.resumeWith(Result.success(results))
                }
            }

            continuation.invokeOnCancellation {
                scanner.stopScan(scanCallback)
                scanJob?.cancel()
            }
        }
    }

    /**
     * Connect to a BLE HRM device by its address
     *
     * @param deviceId MAC address of the BLE device
     * @param sessionId Optional session identifier for tagging samples
     * @param enableBattery Whether to subscribe to battery level notifications
     * @throws BleHrmException on connection failure
     */
    @SuppressLint("MissingPermission")
    suspend fun connect(deviceId: String, sessionId: String? = null, enableBattery: Boolean = false) {
        ensureBluetoothReady()

        this.currentSessionId = sessionId
        this.enableBattery = enableBattery
        this.connectedDeviceId = deviceId
        this.reconnectAttempt = 0
        this.isReconnecting = false

        val device = bluetoothAdapter?.getRemoteDevice(deviceId)
            ?: throw BleHrmException(BleHrmErrorCode.DEVICE_NOT_FOUND, "Device not found: $deviceId")

        connectedDeviceName = device.name

        // Connect with auto-connect false for faster initial connection
        bluetoothGatt = device.connectGatt(context, false, gattCallback)
            ?: throw BleHrmException(BleHrmErrorCode.DEVICE_NOT_FOUND, "Failed to create GATT connection")

        // Wait for service discovery (timeout after 15s)
        withTimeout(15000) {
            // Poll for connection + service discovery
            while (bluetoothGatt?.services?.isEmpty() != false) {
                delay(100)
            }
        }
    }

    /**
     * Disconnect from the currently connected device
     */
    @SuppressLint("MissingPermission")
    suspend fun disconnect() {
        isReconnecting = false
        reconnectAttempt = MAX_RECONNECT_ATTEMPTS // prevent auto-reconnect
        reconnectJob?.cancel()

        bluetoothGatt?.let { gatt ->
            gatt.disconnect()
            gatt.close()
        }
        bluetoothGatt = null
        connectedDeviceId = null
        connectedDeviceName = null
    }

    /**
     * Check if a device is currently connected
     */
    fun isConnected(): Boolean {
        return bluetoothGatt != null && connectedDeviceId != null
    }

    /**
     * Clean up resources
     */
    @SuppressLint("MissingPermission")
    fun dispose() {
        isReconnecting = false
        reconnectAttempt = MAX_RECONNECT_ATTEMPTS
        reconnectJob?.cancel()
        scanJob?.cancel()

        bluetoothGatt?.let { gatt ->
            gatt.disconnect()
            gatt.close()
        }
        bluetoothGatt = null
        connectedDeviceId = null
        connectedDeviceName = null
        scope.cancel()
    }

    // MARK: - Private Methods

    private fun ensureBluetoothReady() {
        if (bluetoothAdapter == null) {
            throw BleHrmException(BleHrmErrorCode.BLUETOOTH_OFF, "Bluetooth not available")
        }
        if (!bluetoothAdapter.isEnabled) {
            throw BleHrmException(BleHrmErrorCode.BLUETOOTH_OFF, "Bluetooth is disabled")
        }

        // Check permissions for Android 12+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (context.checkSelfPermission(android.Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED) {
                throw BleHrmException(BleHrmErrorCode.PERMISSION_DENIED, "BLUETOOTH_SCAN permission not granted")
            }
            if (context.checkSelfPermission(android.Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                throw BleHrmException(BleHrmErrorCode.PERMISSION_DENIED, "BLUETOOTH_CONNECT permission not granted")
            }
        }
    }

    @SuppressLint("MissingPermission")
    private fun attemptReconnect() {
        val deviceId = connectedDeviceId ?: return
        if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
            Log.w(TAG, "Max reconnect attempts reached")
            connectedDeviceId = null
            connectedDeviceName = null
            return
        }

        isReconnecting = true
        val delay = RECONNECT_BACKOFFS[reconnectAttempt]
        reconnectAttempt++

        reconnectJob = scope.launch {
            delay(delay)
            if (!isReconnecting) return@launch

            try {
                val device = bluetoothAdapter?.getRemoteDevice(deviceId) ?: return@launch
                bluetoothGatt = device.connectGatt(context, false, gattCallback)
            } catch (e: Exception) {
                Log.e(TAG, "Reconnect attempt failed: ${e.message}")
                attemptReconnect()
            }
        }
    }
}
