package com.goose.app.ble

import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.util.Log
import com.goose.app.bridge.GooseBridge
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.Instant
import java.util.UUID

/**
 * Android WHOOP BLE client — mirrors iOS CoreBluetoothBLETransport.
 *
 * Connection state machine (parity with iOS):
 *   Idle → Connecting → DiscoveringServices → Authenticating → Connected
 *                                                                  ↓
 *                                          auto-reconnect ← Disconnected
 *
 * Threading:
 *   BluetoothGattCallback runs on a dedicated BLE thread (not main).
 *   StateFlow updates are safe from any thread (MutableStateFlow is thread-safe).
 *   Bridge calls dispatch to Dispatchers.IO — never block the BLE callback thread.
 *
 * Frame routing:
 *   Gen4 notifications → FrameReassembler (multi-notification reassembly) → importFrame()
 *   Gen5 notifications → importFrame() directly (single-notification frames)
 *
 * Historical sync (Phase 105):
 *   On BLE connect, auto-triggers startHistoricalSync() which sends:
 *     GET_DATA_RANGE (cmd 34) → confirmed → SEND_HISTORICAL_DATA (cmd 22)
 *   Type-47 body frames received during sync are routed to capture.import_frame_batch
 *   with source="historical_sync". SYNC-08 routing fix in Rust core handles internal routing.
 */
class WhoopBleClient(private val context: Context) {

  companion object {
    private const val TAG = "WhoopBleClient"

    // Auto-reconnect cooldown after unexpected disconnect (mirrors iOS reconnect backoff start)
    private const val RECONNECT_DELAY_MS = 5_000L

    // Auth retry limit — mirrors iOS authRetryCount exhaustion threshold of 12 cycles
    private const val AUTH_RETRY_LIMIT = 12

    // MTU to request after connection — matches iOS BLE-REL-01 (MTU 247)
    private const val TARGET_MTU = 247

    // WHOOP authentication handshake command — written to command characteristic on connect.
    // Frame hex matches iOS GooseHello.clientHelloFrameHex: "aa0108000001e67123019101363e5c8d"
    // This is the Gen5 client hello frame; Gen4 devices also accept it in practice.
    private val CLIENT_HELLO_BYTES: ByteArray = byteArrayOf(
      0xaa.toByte(), 0x01.toByte(), 0x08.toByte(), 0x00.toByte(),
      0x00.toByte(), 0x01.toByte(), 0xe6.toByte(), 0x71.toByte(),
      0x23.toByte(), 0x01.toByte(), 0x91.toByte(), 0x01.toByte(),
      0x36.toByte(), 0x3e.toByte(), 0x5c.toByte(), 0x8d.toByte(),
    )

    // Historical sync command bytes (mirrors iOS HistoricalCommandKind)
    // GET_DATA_RANGE = cmd 34 (0x22), SEND_HISTORICAL_DATA = cmd 22 (0x16)
    // HISTORICAL_DATA_RESULT ack = cmd 23 (0x17)
    private const val CMD_GET_DATA_RANGE: Byte = 34        // 0x22
    private const val CMD_SEND_HISTORICAL_DATA: Byte = 22  // 0x16
    private const val CMD_HISTORICAL_DATA_RESULT: Byte = 23 // 0x17
    private const val PACKET_TYPE_COMMAND: Byte = 0x01

    // Idle timeout after SEND_HISTORICAL_DATA write — completes sync if no more frames arrive
    private const val SYNC_IDLE_TIMEOUT_MS = 30_000L

    // Optical enable command bytes (mirrors iOS startPhysiologyCapture sequence for Gen5/MG)
    // ENABLE_OPTICAL_DATA = cmd 107 (0x6B), TOGGLE_OPTICAL_MODE = cmd 108 (0x6C)
    private const val CMD_ENABLE_OPTICAL_DATA: Byte = 107        // 0x6B
    private const val CMD_TOGGLE_OPTICAL_MODE: Byte = 108        // 0x6C

    // iOS revisionBoolean(true) encoding — two bytes [0x01, 0x01]
    private val REVISION_BOOLEAN_TRUE: ByteArray = byteArrayOf(0x01, 0x01)
  }

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

  private val _connectionState = MutableStateFlow<BleConnectionState>(BleConnectionState.Idle)
  val connectionState: StateFlow<BleConnectionState> = _connectionState.asStateFlow()

  // Live heart rate in BPM — null until first R22 notification received
  private val _liveHeartRateBPM = MutableStateFlow<Int?>(null)
  val liveHeartRateBPM: StateFlow<Int?> = _liveHeartRateBPM.asStateFlow()

  // Called after each historical sync completes — used by AppViewModel to trigger upload + metrics refresh
  var onSyncComplete: (() -> Unit)? = null

  private var gatt: BluetoothGatt? = null
  private var activeServiceUuid: UUID? = null
  private var activeGeneration: WhoopGeneration? = null
  private var lastDevice: BluetoothDevice? = null

  // Gen4 multi-notification frame reassembly buffer (not used for Gen5)
  private val gen4Reassembler = FrameReassembler()

  // Prevents auto-reconnect when user explicitly called disconnect()
  @Volatile private var userDisconnected = false

  // Auth retry tracking — mirrors iOS authRetryCount / authExhausted
  @Volatile private var authRetryCount = 0
  @Volatile private var authExhausted = false

  // Serialised CCCD write queue — next write triggered in onDescriptorWrite
  // Must only be accessed from the BLE callback thread or while holding gattLock
  private val pendingCccdQueue = ArrayDeque<BluetoothGattDescriptor>()

  // Track whether client hello was already sent this connection (mirror iOS clientHelloSentForCurrentConnection)
  @Volatile private var clientHelloSentForCurrentConnection = false

  // Reconnect job reference — cancel if user disconnects before delay expires
  private var reconnectJob: Job? = null

  // ──────────────────────────────────────────────────────────────────────────
  // Historical sync state (Phase 105)
  // ──────────────────────────────────────────────────────────────────────────

  // Prevents concurrent syncs — checked before writing any historical command
  @Volatile private var syncInProgress: Boolean = false

  // Sequence counter — starts at 57 to mirror iOS nextHistoricalCommandSequence initial value
  @Volatile private var syncSequence: Byte = 57

  // Tracks which command we are waiting for an ack on (0 = none pending)
  @Volatile private var pendingSyncCommand: Byte = 0

  // ──────────────────────────────────────────────────────────────────────────
  // Optical enable state (Phase 117)
  // ──────────────────────────────────────────────────────────────────────────

  // Dedicated sensor sequence counter — starts at signed -76 (unsigned 180 per D-02)
  // Must NOT share syncSequence; optical commands run on a separate counter to avoid
  // collision with historical sync command sequencing (research Pitfall 2).
  @Volatile private var sensorSequence: Byte = (-76).toByte()

  // ──────────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Initiate a connection to the given WHOOP device.
   * Safe to call from any thread.
   */
  fun connect(device: BluetoothDevice) {
    userDisconnected = false
    reconnectJob?.cancel()
    lastDevice = device
    Log.d(TAG, "connect: ${device.address}")
    _connectionState.value = BleConnectionState.Connecting(device.address)
    gatt = device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
  }

  /**
   * Explicitly disconnect — suppresses auto-reconnect.
   * Safe to call from any thread.
   */
  fun disconnect() {
    userDisconnected = true
    reconnectJob?.cancel()
    Log.d(TAG, "disconnect: explicit")
    gatt?.disconnect()
  }

  /** True when BLE connection is in the Connected state. */
  fun isConnected(): Boolean = connectionState.value.isConnected

  /**
   * Start a historical sync session. Sends GET_DATA_RANGE → SEND_HISTORICAL_DATA
   * command sequence to the WHOOP device. Auto-triggered on BLE connect (D-02).
   *
   * Safe to call from any thread — GATT writes dispatch to the BLE callback thread.
   * Guards against concurrent invocations via syncInProgress flag.
   */
  fun startHistoricalSync() {
    if (syncInProgress) {
      Log.d(TAG, "Historical sync already in progress — skipping")
      return
    }
    syncInProgress = true
    Log.d(TAG, "Historical sync: starting — sending GET_DATA_RANGE")
    // Gen5: empty payload (standard); Gen4: [0x00] (usesPageSequenceSync path)
    val payload = when (activeGeneration) {
      WhoopGeneration.GEN4 -> byteArrayOf(0x00)
      else -> byteArrayOf()
    }
    writeHistoricalCommand(CMD_GET_DATA_RANGE, payload)
    pendingSyncCommand = CMD_GET_DATA_RANGE
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BluetoothGattCallback
  // ──────────────────────────────────────────────────────────────────────────

  @Suppress("DEPRECATION")
  private val gattCallback = object : BluetoothGattCallback() {

    override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
      when (newState) {
        BluetoothProfile.STATE_CONNECTED -> {
          Log.d(TAG, "GATT connected — requesting MTU $TARGET_MTU")
          gatt.requestMtu(TARGET_MTU)
        }
        BluetoothProfile.STATE_DISCONNECTED -> {
          val address = gatt.device.address
          val reason = if (status == BluetoothGatt.GATT_SUCCESS) "closed" else "error_$status"
          Log.d(TAG, "GATT disconnected: address=$address reason=$reason")
          onGattDisconnected(address, reason)
        }
      }
    }

    override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
      Log.d(TAG, "MTU changed: $mtu status=$status")
      val address = gatt.device.address
      _connectionState.value = BleConnectionState.DiscoveringServices(address)
      gatt.discoverServices()
    }

    override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
      val address = gatt.device.address
      if (status != BluetoothGatt.GATT_SUCCESS) {
        Log.w(TAG, "Service discovery failed: status=$status")
        _connectionState.value = BleConnectionState.Disconnected(
          reason = "service_discovery_failed_$status",
          willReconnect = !userDisconnected && !authExhausted,
        )
        return
      }

      // Identify WHOOP generation from discovered services
      val whoopService = gatt.services.firstOrNull { WhoopUuids.isWhoopService(it.uuid) }
      if (whoopService == null) {
        Log.w(TAG, "No WHOOP service found — disconnecting")
        gatt.disconnect()
        return
      }

      val serviceUuid = whoopService.uuid
      activeServiceUuid = serviceUuid
      activeGeneration = resolveGeneration(gatt.device, serviceUuid)
      Log.d(TAG, "WHOOP service discovered: $serviceUuid generation=$activeGeneration")

      // Queue CCCD enable for all notification characteristics
      pendingCccdQueue.clear()
      for (notifyUuid in WhoopUuids.notifyCharsFor(serviceUuid)) {
        val char = whoopService.getCharacteristic(notifyUuid) ?: continue
        if (!gatt.setCharacteristicNotification(char, true)) continue
        val descriptor = char.getDescriptor(WhoopUuids.CCCD_UUID) ?: continue
        @Suppress("DEPRECATION")
        descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
        pendingCccdQueue.addLast(descriptor)
      }

      _connectionState.value = BleConnectionState.Authenticating(address)

      // Start CCCD write chain
      writeNextCccd(gatt)

      // Send auth command
      sendAuthCommand(gatt)
    }

    override fun onDescriptorWrite(
      gatt: BluetoothGatt,
      descriptor: BluetoothGattDescriptor,
      status: Int,
    ) {
      Log.d(TAG, "CCCD write complete: ${descriptor.characteristic.uuid} status=$status")
      writeNextCccd(gatt)
    }

    // API 33+ (Android T) signature — preferred path
    override fun onCharacteristicChanged(
      gatt: BluetoothGatt,
      characteristic: BluetoothGattCharacteristic,
      value: ByteArray,
    ) {
      handleNotification(characteristic, value)
    }

    // Deprecated API < 33 fallback — delegates to unified handler
    @Deprecated("Deprecated in API 33")
    override fun onCharacteristicChanged(
      gatt: BluetoothGatt,
      characteristic: BluetoothGattCharacteristic,
    ) {
      @Suppress("DEPRECATION")
      handleNotification(characteristic, characteristic.value ?: return)
    }

    override fun onCharacteristicWrite(
      gatt: BluetoothGatt,
      characteristic: BluetoothGattCharacteristic,
      status: Int,
    ) {
      if (status != BluetoothGatt.GATT_SUCCESS) {
        authRetryCount++
        Log.w(TAG, "Char write failed: status=$status retryCount=$authRetryCount")
        if (authRetryCount >= AUTH_RETRY_LIMIT) {
          authExhausted = true
          Log.e(TAG, "Auth exhausted after $AUTH_RETRY_LIMIT attempts — disconnecting without reconnect")
          userDisconnected = true // suppress reconnect
          gatt.disconnect()
        }
        return
      }

      // Historical sync state machine: after GET_DATA_RANGE write confirmed, send SEND_HISTORICAL_DATA
      if (syncInProgress && pendingSyncCommand == CMD_GET_DATA_RANGE) {
        Log.d(TAG, "GET_DATA_RANGE write confirmed — sending SEND_HISTORICAL_DATA")
        val payload = when (activeGeneration) {
          WhoopGeneration.GEN4 -> byteArrayOf(0x00)
          else -> byteArrayOf()
        }
        pendingSyncCommand = CMD_SEND_HISTORICAL_DATA
        writeHistoricalCommand(CMD_SEND_HISTORICAL_DATA, payload)
      }

      // After SEND_HISTORICAL_DATA write confirmed, start idle timeout
      if (syncInProgress && pendingSyncCommand == CMD_SEND_HISTORICAL_DATA) {
        scope.launch {
          delay(SYNC_IDLE_TIMEOUT_MS)
          completeSyncIfActive("idle_timeout")
        }
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ──────────────────────────────────────────────────────────────────────────

  private fun resolveGeneration(device: BluetoothDevice, serviceUuid: UUID): WhoopGeneration {
    if (WhoopUuids.isGen4(serviceUuid)) return WhoopGeneration.GEN4
    // Gen5 service UUID — check device name for MG suffix
    val name = try { device.name } catch (_: SecurityException) { null }
    return if (name?.lowercase()?.contains(" mg") == true) {
      WhoopGeneration.MG
    } else {
      WhoopGeneration.GEN5
    }
  }

  private fun sendAuthCommand(gatt: BluetoothGatt) {
    if (clientHelloSentForCurrentConnection) {
      Log.d(TAG, "Client hello already sent for this connection — skipping")
      return
    }
    val serviceUuid = activeServiceUuid ?: return
    val service = gatt.getService(serviceUuid) ?: return
    val commandChar = service.getCharacteristic(WhoopUuids.commandCharFor(serviceUuid)) ?: run {
      Log.w(TAG, "Command characteristic not found")
      return
    }

    val writeType = when {
      commandChar.properties and BluetoothGattCharacteristic.PROPERTY_WRITE != 0 ->
        BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
      commandChar.properties and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0 ->
        BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
      else -> {
        Log.w(TAG, "Command characteristic not writable")
        return
      }
    }

    @Suppress("DEPRECATION")
    commandChar.value = CLIENT_HELLO_BYTES
    commandChar.writeType = writeType
    @Suppress("DEPRECATION")
    val success = gatt.writeCharacteristic(commandChar)
    clientHelloSentForCurrentConnection = true
    Log.d(TAG, "Client hello sent: success=$success writeType=$writeType")
  }

  private fun writeNextCccd(gatt: BluetoothGatt) {
    val next = pendingCccdQueue.removeFirstOrNull() ?: return
    @Suppress("DEPRECATION")
    gatt.writeDescriptor(next)
  }

  private fun handleNotification(characteristic: BluetoothGattCharacteristic, value: ByteArray) {
    val generation = activeGeneration ?: return
    val address = gatt?.device?.address ?: ""

    // Capture sync flag before any async dispatch to avoid race with completeSyncIfActive()
    val isSync = syncInProgress

    // First notification after auth send = auth succeeded — transition to Connected
    // D-02: auto-trigger historical sync immediately after connecting
    if (_connectionState.value is BleConnectionState.Authenticating) {
      Log.d(TAG, "First notification received — auth succeeded, transitioning to Connected")
      _connectionState.value = BleConnectionState.Connected(address, generation)
      // Launch sync on scope (not on BLE callback thread) — syncInProgress guard prevents duplicates
      scope.launch { startHistoricalSync() }
      // Gen5/MG only: send optical enable commands after a 500ms delay so historical sync
      // commands queue first (research A2, D-02). Gen4 never receives optical commands (Pitfall 3).
      if (generation == WhoopGeneration.GEN5 || generation == WhoopGeneration.MG) {
        val currentGatt = gatt
        if (currentGatt != null) {
          scope.launch { delay(500); sendOpticalEnableCommands(currentGatt) }
        }
      }
    }

    val frameSource = if (isSync) "historical_sync" else "android_ble"

    when (generation) {
      WhoopGeneration.GEN4 -> {
        // Multi-notification reassembly (SYNC-09 prepend-buffer algorithm)
        val frames = gen4Reassembler.feed(value)
        for (frame in frames) {
          importFrame(frame, frameSource)
        }
      }
      WhoopGeneration.GEN5, WhoopGeneration.MG -> {
        // Single-notification frames — pass directly to bridge
        importFrame(value, frameSource)
      }
    }

    // R22 live HR extraction — packet type 0x10: byte[0]=type, bytes[2-3]=milli-bpm little-endian
    if (value.size >= 4 && value[0] == 0x10.toByte()) {
      val milliBeats = (value[2].toInt() and 0xFF) or ((value[3].toInt() and 0xFF) shl 8)
      val bpm = milliBeats / 10
      if (bpm > 0) _liveHeartRateBPM.value = bpm
    }
  }

  /**
   * Build a WHOOP BLE command frame.
   *
   * Wire format (mirrors iOS buildCommandFrame):
   *   [PACKET_TYPE_COMMAND(0x01), bodyLenLow, bodyLenHigh, outerSeq, innerSeq, commandByte, ...data]
   *
   * body = [sequence, command] + data
   * frame = [0x01, bodyLen&0xFF, (bodyLen>>8)&0xFF, sequence] + body
   */
  private fun buildCommandFrame(sequence: Byte, command: Byte, data: ByteArray): ByteArray {
    val body = byteArrayOf(sequence, command) + data
    val bodyLen = body.size
    return byteArrayOf(
      PACKET_TYPE_COMMAND,
      (bodyLen and 0xFF).toByte(),
      ((bodyLen ushr 8) and 0xFF).toByte(),
      sequence,
    ) + body
  }

  /**
   * Write a historical sync command to the WHOOP command characteristic.
   *
   * Guards: returns early if sync is not in progress or GATT is not available.
   * Increments syncSequence (wrapping byte) before each write.
   * Must only be called when syncInProgress == true.
   */
  private fun writeHistoricalCommand(command: Byte, data: ByteArray) {
    if (!syncInProgress) {
      Log.d(TAG, "writeHistoricalCommand: sync not in progress — skipping cmd=0x${command.toString(16)}")
      return
    }
    val currentGatt = gatt ?: run {
      Log.w(TAG, "writeHistoricalCommand: gatt is null — cannot write cmd=0x${command.toString(16)}")
      return
    }
    val serviceUuid = activeServiceUuid ?: run {
      Log.w(TAG, "writeHistoricalCommand: no active service — cannot write cmd=0x${command.toString(16)}")
      return
    }
    val service = currentGatt.getService(serviceUuid) ?: run {
      Log.w(TAG, "writeHistoricalCommand: service not found for $serviceUuid")
      return
    }
    val commandChar = service.getCharacteristic(WhoopUuids.commandCharFor(serviceUuid)) ?: run {
      Log.w(TAG, "writeHistoricalCommand: command characteristic not found")
      return
    }

    val writeType = when {
      commandChar.properties and BluetoothGattCharacteristic.PROPERTY_WRITE != 0 ->
        BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
      commandChar.properties and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0 ->
        BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
      else -> {
        Log.w(TAG, "writeHistoricalCommand: characteristic not writable")
        return
      }
    }

    syncSequence = (syncSequence + 1).toByte()
    val frame = buildCommandFrame(syncSequence, command, data)

    @Suppress("DEPRECATION")
    commandChar.value = frame
    commandChar.writeType = writeType
    @Suppress("DEPRECATION")
    val success = currentGatt.writeCharacteristic(commandChar)
    Log.d(TAG, "hist cmd=0x${command.toString(16)} seq=$syncSequence len=${frame.size} success=$success")
  }

  /**
   * Send ENABLE_OPTICAL_DATA (cmd 107) and TOGGLE_OPTICAL_MODE (cmd 108) to the device.
   *
   * Mirrors iOS startPhysiologyCapture optical command sequence for Gen5/MG.
   * Uses a dedicated sensorSequence counter — must NOT share syncSequence.
   * Commands are staggered by 250ms to match iOS 0.25s spacing.
   *
   * Only called for Gen5 and MG devices; Gen4 must never invoke this (Pitfall 3).
   */
  private suspend fun sendOpticalEnableCommands(gatt: BluetoothGatt) {
    val serviceUuid = activeServiceUuid ?: run {
      Log.w(TAG, "sendOpticalEnableCommands: no active service — skipping")
      return
    }
    val service = gatt.getService(serviceUuid) ?: run {
      Log.w(TAG, "sendOpticalEnableCommands: service not found for $serviceUuid")
      return
    }
    val commandChar = service.getCharacteristic(WhoopUuids.commandCharFor(serviceUuid)) ?: run {
      Log.w(TAG, "sendOpticalEnableCommands: command characteristic not found")
      return
    }

    val writeType = when {
      commandChar.properties and BluetoothGattCharacteristic.PROPERTY_WRITE != 0 ->
        BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
      commandChar.properties and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0 ->
        BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
      else -> {
        Log.w(TAG, "sendOpticalEnableCommands: characteristic not writable")
        return
      }
    }

    val commands = listOf(CMD_ENABLE_OPTICAL_DATA, CMD_TOGGLE_OPTICAL_MODE)
    commands.forEachIndexed { index, cmd ->
      delay(250L * index)
      sensorSequence = (sensorSequence + 1).toByte()
      val frame = buildCommandFrame(sensorSequence, cmd, REVISION_BOOLEAN_TRUE)
      @Suppress("DEPRECATION")
      commandChar.value = frame
      commandChar.writeType = writeType
      @Suppress("DEPRECATION")
      val success = gatt.writeCharacteristic(commandChar)
      Log.d(TAG, "optical cmd=0x${cmd.toString(16)} seq=$sensorSequence len=${frame.size} success=$success")
    }
  }

  /**
   * Complete the historical sync session if one is active.
   * Safe to call from any thread.
   */
  private fun completeSyncIfActive(reason: String) {
    if (!syncInProgress) return
    syncInProgress = false
    pendingSyncCommand = 0
    Log.d(TAG, "Historical sync complete: reason=$reason")
    onSyncComplete?.invoke()
  }

  private fun importFrame(frameBytes: ByteArray, source: String = "android_ble") {
    if (frameBytes.isEmpty()) return
    scope.launch(Dispatchers.IO) {
      val frameHex = frameBytes.joinToString("") { "%02x".format(it) }
      val dbPath = context.filesDir.absolutePath + "/goose.sqlite"
      val evidenceId = java.util.UUID.randomUUID().toString()
      val capturedAt = Instant.now().toString()
      val deviceModel = when (activeGeneration) {
        WhoopGeneration.GEN4 -> "whoop4"
        WhoopGeneration.GEN5 -> "whoop5"
        WhoopGeneration.MG -> "whoop_mg"
        null -> "unknown"
      }
      val request = buildImportRequest(dbPath, evidenceId, capturedAt, deviceModel, frameHex, source)
      GooseBridge.safeHandle(request)
    }
  }

  private fun buildImportRequest(
    dbPath: String,
    evidenceId: String,
    capturedAt: String,
    deviceModel: String,
    frameHex: String,
    source: String,
  ): String {
    // Build JSON manually using org.json.JSONObject (Android SDK built-in, no extra deps)
    val frame = org.json.JSONObject().apply {
      put("evidence_id", evidenceId)
      put("source", source)
      put("captured_at", capturedAt)
      put("device_model", deviceModel)
      put("frame_hex", frameHex)
      put("sensitivity", "normal")
    }
    val frames = org.json.JSONArray().apply { put(frame) }
    val args = org.json.JSONObject().apply {
      put("database_path", dbPath)
      put("frames", frames)
    }
    return org.json.JSONObject().apply {
      put("schema", "goose.bridge.request.v1")
      put("method", "capture.import_frame_batch")
      put("args", args)
    }.toString()
  }

  private fun onGattDisconnected(address: String, reason: String) {
    // Reset historical sync state on disconnect to prevent orphaned syncInProgress
    syncInProgress = false
    pendingSyncCommand = 0
    gen4Reassembler.reset()
    clientHelloSentForCurrentConnection = false
    gatt?.close()
    gatt = null

    val willReconnect = !userDisconnected && !authExhausted
    _connectionState.value = BleConnectionState.Disconnected(
      reason = reason,
      willReconnect = willReconnect,
    )

    if (willReconnect) {
      reconnectJob = scope.launch {
        Log.d(TAG, "Auto-reconnect in ${RECONNECT_DELAY_MS}ms...")
        delay(RECONNECT_DELAY_MS)
        val device = lastDevice ?: return@launch
        if (!userDisconnected) {
          connect(device)
        }
      }
    }
  }
}
