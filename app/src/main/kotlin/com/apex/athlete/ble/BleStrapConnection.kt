package com.apex.athlete.ble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.UUID

/**
 * Android implementation of [StrapConnection]. Scans with a service filter for 0x180D, connects, enables
 * notifications on 0x2A37 (the only write) and publishes parsed values. No health values are logged.
 * Permission checks are explicit before every Bluetooth call; the UI requests them (see [BlePermissions]).
 */
@SuppressLint("MissingPermission") // every entry point checks hasPermissions() first
class BleStrapConnection(context: Context) : StrapConnection {
    private val app = context.applicationContext
    private val main = Handler(Looper.getMainLooper())

    private val _state = MutableStateFlow<StrapState>(StrapState.Idle)
    override val state: StateFlow<StrapState> = _state.asStateFlow()
    private val _hr = MutableStateFlow<Int?>(null)
    override val heartRate: StateFlow<Int?> = _hr.asStateFlow()
    private val _rr = MutableSharedFlow<Int>(extraBufferCapacity = 64, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    override val rrIntervalsMs: Flow<Int> = _rr

    private var gatt: BluetoothGatt? = null
    private var scanning = false
    private val scanTimeout = Runnable { stopScan(); if (_state.value == StrapState.Scanning) _state.value = StrapState.Failed(StrapFailure.NOT_FOUND) }

    private fun hasPermissions() = BlePermissions.missing(Build.VERSION.SDK_INT) {
        app.checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED
    }.isEmpty()

    private fun adapter(): BluetoothAdapter? = (app.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

    override fun connect() {
        main.post {
            when (_state.value) {
                StrapState.Scanning, StrapState.Connecting, is StrapState.Connected -> return@post
                else -> Unit
            }
            if (!BlePermissions.isSupported(Build.VERSION.SDK_INT)) return@post fail(StrapFailure.UNSUPPORTED_ANDROID)
            if (!hasPermissions()) return@post fail(StrapFailure.PERMISSION_MISSING)
            val adapter = adapter() ?: return@post fail(StrapFailure.NO_BLUETOOTH)
            if (!adapter.isEnabled) return@post fail(StrapFailure.BLUETOOTH_OFF)
            val scanner = adapter.bluetoothLeScanner ?: return@post fail(StrapFailure.BLUETOOTH_OFF)
            _state.value = StrapState.Scanning
            val filter = ScanFilter.Builder().setServiceUuid(ParcelUuid(UUID.fromString(HeartRateMeasurementParser.SERVICE_UUID))).build()
            scanning = true
            scanner.startScan(listOf(filter), ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), scanCallback)
            main.postDelayed(scanTimeout, SCAN_TIMEOUT_MS)
        }
    }

    override fun disconnect() {
        main.post {
            main.removeCallbacks(scanTimeout)
            stopScan()
            closeGatt()
            _hr.value = null
            _state.value = StrapState.Idle
        }
    }

    private fun fail(reason: StrapFailure) {
        _hr.value = null
        _state.value = StrapState.Failed(reason)
    }

    private fun stopScan() {
        if (!scanning) return
        scanning = false
        if (hasPermissions()) runCatching { adapter()?.bluetoothLeScanner?.stopScan(scanCallback) }
    }

    private fun closeGatt() {
        val g = gatt ?: return
        gatt = null
        if (hasPermissions()) runCatching { g.disconnect(); g.close() }
    }

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            if (!scanning) return
            main.removeCallbacks(scanTimeout)
            stopScan()
            connectTo(result.device)
        }

        override fun onScanFailed(errorCode: Int) {
            scanning = false
            main.removeCallbacks(scanTimeout)
            fail(StrapFailure.NOT_FOUND)
        }
    }

    private fun connectTo(device: BluetoothDevice) {
        _state.value = StrapState.Connecting
        gatt = device.connectGatt(app, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
    }

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
            main.post {
                if (newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS) {
                    g.discoverServices()
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    val wasUp = _state.value is StrapState.Connected || _state.value == StrapState.Connecting
                    closeGatt()
                    _hr.value = null
                    if (wasUp) _state.value = StrapState.Failed(StrapFailure.CONNECTION_LOST)
                }
            }
        }

        override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
            main.post {
                val ch = g.getService(UUID.fromString(HeartRateMeasurementParser.SERVICE_UUID))
                    ?.getCharacteristic(UUID.fromString(HeartRateMeasurementParser.MEASUREMENT_UUID))
                if (status != BluetoothGatt.GATT_SUCCESS || ch == null) {
                    closeGatt(); return@post fail(StrapFailure.NO_HEART_RATE_SERVICE)
                }
                g.setCharacteristicNotification(ch, true)
                val cccd = ch.getDescriptor(UUID.fromString(HeartRateMeasurementParser.CCCD_UUID))
                if (cccd == null) {
                    closeGatt(); return@post fail(StrapFailure.NO_HEART_RATE_SERVICE)
                }
                // The only write to the strap: switch on notifications.
                if (Build.VERSION.SDK_INT >= 33) {
                    g.writeDescriptor(cccd, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
                } else {
                    @Suppress("DEPRECATION")
                    cccd.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                    @Suppress("DEPRECATION")
                    g.writeDescriptor(cccd)
                }
                _state.value = StrapState.Connected(runCatching { g.device.name }.getOrNull())
            }
        }

        // API 33+
        override fun onCharacteristicChanged(g: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray) {
            handle(characteristic, value)
        }

        // API 28-32
        @Deprecated("Replaced on API 33")
        override fun onCharacteristicChanged(g: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            @Suppress("DEPRECATION")
            handle(characteristic, characteristic.value)
        }
    }

    private fun handle(characteristic: BluetoothGattCharacteristic, value: ByteArray?) {
        if (characteristic.uuid != UUID.fromString(HeartRateMeasurementParser.MEASUREMENT_UUID)) return
        val m = HeartRateMeasurementParser.parse(value) ?: return
        // A reading of 0 with contact lost is "no reading", not a heart rate.
        _hr.value = m.bpm.takeIf { it > 0 && m.sensorContact != false }
        m.rrIntervalsMs.forEach { _rr.tryEmit(it) }
    }

    companion object {
        private const val SCAN_TIMEOUT_MS = 20_000L

        @Volatile private var instance: StrapConnection? = null

        /** Process-wide strap (the recorder service and the screens share one connection). */
        fun shared(context: Context): StrapConnection =
            instance ?: synchronized(this) { instance ?: BleStrapConnection(context).also { instance = it } }
    }
}
