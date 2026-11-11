package ai.synheart.wear.ramen

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import io.grpc.ManagedChannel
import io.grpc.Metadata
import io.grpc.okhttp.OkHttpChannelBuilder
import io.grpc.stub.ClientCallStreamObserver
import io.grpc.stub.ClientResponseObserver
import io.grpc.stub.StreamObserver
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import ramen.v1.Ack
import ramen.v1.AckStatus
import ramen.v1.ClientMessage
import ramen.v1.EventEnvelope
import ramen.v1.Heartbeat
import ramen.v1.RAMENServiceGrpc
import ramen.v1.ServerMessage
import ramen.v1.SubscribeRequest
import ramen.v1.SubscribeResponse
import ramen.v1.Error as RamenError
import java.util.concurrent.TimeUnit
import com.google.protobuf.Timestamp

private const val TAG = "RamenClient"
private const val PREFS_NAME = "ramen_prefs"
private const val KEY_LAST_SEQ = "ramen_last_acknowledged_seq"

/**
 * Connection state for RAMEN streaming.
 */
internal enum class RamenConnectionState {
    CONNECTING,
    CONNECTED,
    DISCONNECTED,
    RECONNECTING
}

/**
 * Parsed event from RAMEN (payload decoded as UTF-8 JSON).
 */
internal data class RamenEvent(
    val eventId: String,
    val seq: Long,
    val provider: String,
    val eventType: String,
    val payloadJson: String,
    val payload: Map<String, Any?>? = null,
    val isReplay: Boolean = false
) {
    companion object {
        fun fromEnvelope(envelope: EventEnvelope): RamenEvent {
            var payloadJson = ""
            var payload: Map<String, Any?>? = null
            try {
                if (!envelope.payload.isEmpty) {
                    payloadJson = envelope.payload.toStringUtf8()
                    @Suppress("UNCHECKED_CAST")
                    payload = com.google.gson.Gson().fromJson(
                        payloadJson, Map::class.java
                    ) as? Map<String, Any?>
                }
            } catch (_: Exception) { /* leave payload null */ }

            return RamenEvent(
                eventId = envelope.eventId,
                seq = envelope.seq,
                provider = envelope.provider,
                eventType = envelope.eventType,
                payloadJson = payloadJson,
                payload = payload,
                isReplay = envelope.hasDelivery() && envelope.delivery.isReplay
            )
        }
    }
}

/**
 * Configuration for RAMEN client.
 */
internal data class RamenConfig(
    val host: String,
    val port: Int = 443,
    val appId: String = "",
    val apiKey: String = "",
    val deviceId: String,
    val userId: String = "",
    val useTls: Boolean = true,
    val heartbeatIntervalSeconds: Int = 30,
    val heartbeatMissedAttempts: Int = 2,
    val logResponses: Boolean = false,
    val providers: List<String> = emptyList(),
    val eventTypes: List<String> = emptyList()
)

/**
 * RAMEN gRPC client: bidirectional streaming for real-time vendor wear events.
 *
 * Mirrors the Dart RamenClient:
 * - SubscribeRequest with last_acknowledged_seq, device_id, user_id
 * - X-app-id / X-api-key auth metadata on every request
 * - Seq saved in SharedPreferences
 * - Heartbeat every 30s, force-close after 2 missed
 * - Auto-reconnect with exponential backoff (max 32s)
 */
internal class RamenClient(
    private val context: Context,
    private val config: RamenConfig
) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private var channel: ManagedChannel? = null
    private var requestObserver: StreamObserver<ClientMessage>? = null
    private var heartbeatJob: Job? = null
    private var heartbeatsWithoutAck = 0
    private var closed = false
    private var backoffSeconds = 1
    private var hasEmittedConnected = false

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val _events = MutableSharedFlow<RamenEvent>(extraBufferCapacity = 64)
    private val _connectionState = MutableStateFlow(RamenConnectionState.DISCONNECTED)
    private val _errors = MutableSharedFlow<RamenError>(extraBufferCapacity = 16)

    /** Flow of parsed events. */
    val events: SharedFlow<RamenEvent> = _events.asSharedFlow()

    /** Flow of connection state changes. */
    val connectionState: StateFlow<RamenConnectionState> = _connectionState.asStateFlow()

    /** Flow of server errors. */
    val errors: SharedFlow<RamenError> = _errors.asSharedFlow()

    /** Last acknowledged seq (from SharedPreferences). */
    val lastSeq: Long get() = prefs.getLong(KEY_LAST_SEQ, 0L)

    /**
     * Start the subscription. Sends SubscribeRequest with last_acknowledged_seq,
     * then processes EventEnvelopes, sending Ack for each.
     */
    fun connect() {
        if (closed) return
        hasEmittedConnected = false
        log("connecting to ${config.host}:${config.port} (tls=${config.useTls})")
        _connectionState.value = RamenConnectionState.CONNECTING

        // Build gRPC channel
        val builder = OkHttpChannelBuilder.forAddress(config.host, config.port)
        if (!config.useTls) builder.usePlaintext()
        channel = builder.build()

        val stub = RAMENServiceGrpc.newStub(channel!!)

        // Attach auth metadata
        val metadata = Metadata()
        if (config.appId.isNotEmpty()) {
            metadata.put(Metadata.Key.of("x-app-id", Metadata.ASCII_STRING_MARSHALLER), config.appId)
        }
        if (config.apiKey.isNotEmpty()) {
            metadata.put(Metadata.Key.of("x-api-key", Metadata.ASCII_STRING_MARSHALLER), config.apiKey)
        }
        val authedStub = stub.withInterceptors(
            io.grpc.stub.MetadataUtils.newAttachHeadersInterceptor(metadata)
        )

        // Set up bidirectional stream
        val responseObserver = object : ClientResponseObserver<ClientMessage, ServerMessage> {
            override fun beforeStart(reqStream: ClientCallStreamObserver<ClientMessage>) {
                // Store reference so we can send Ack/Heartbeat later
            }

            override fun onNext(msg: ServerMessage) {
                when (msg.messageCase) {
                    ServerMessage.MessageCase.SUBSCRIBE_RESPONSE -> {
                        emitConnectedIfFirst()
                        onSubscribeResponse(msg.subscribeResponse)
                    }
                    ServerMessage.MessageCase.EVENT -> {
                        emitConnectedIfFirst()
                        onEvent(msg.event)
                    }
                    ServerMessage.MessageCase.HEARTBEAT_ACK -> {
                        emitConnectedIfFirst()
                        logResponse("heartbeat_ack", "rtt_ms=${msg.heartbeatAck.rttMs}")
                        heartbeatsWithoutAck = 0
                    }
                    ServerMessage.MessageCase.ERROR -> {
                        onServerError(msg.error)
                    }
                    else -> {}
                }
            }

            override fun onError(t: Throwable) {
                log("error: $t")
                stopHeartbeat()
                if (!closed) _connectionState.value = RamenConnectionState.DISCONNECTED
                val isUnimplemented = t.message?.contains("UNIMPLEMENTED") == true ||
                    t.message?.contains("unknown service") == true
                if (!isUnimplemented) scheduleReconnect()
            }

            override fun onCompleted() {
                log("stream ended")
                stopHeartbeat()
                if (!closed) {
                    _connectionState.value = RamenConnectionState.DISCONNECTED
                    scheduleReconnect()
                }
            }
        }

        requestObserver = authedStub.subscribe(responseObserver)

        // Send SubscribeRequest
        val subscribeReq = SubscribeRequest.newBuilder()
            .setAppId(config.appId)
            .setUserId(config.userId)
            .setDeviceId(config.deviceId)
            .setLastSeq(lastSeq)
            .addAllProviders(config.providers)
            .addAllEventTypes(config.eventTypes)
            .build()

        val clientMsg = ClientMessage.newBuilder()
            .setSubscribe(subscribeReq)
            .build()

        try {
            requestObserver?.onNext(clientMsg)
        } catch (e: Exception) {
            log("failed to send subscribe: $e")
        }

        heartbeatsWithoutAck = 0
        startHeartbeat()
    }

    private fun emitConnectedIfFirst() {
        if (!hasEmittedConnected && !closed) {
            hasEmittedConnected = true
            backoffSeconds = 1
            log("established")
            _connectionState.value = RamenConnectionState.CONNECTED
        }
    }

    private fun onSubscribeResponse(resp: SubscribeResponse) {
        logResponse("subscribe_response",
            "connection_id=${resp.connectionId} current_seq=${resp.currentSeq} " +
            "heartbeat_interval=${resp.heartbeatIntervalSeconds}s")
        if (resp.heartbeatIntervalSeconds > 0) {
            stopHeartbeat()
            val interval = resp.heartbeatIntervalSeconds.coerceIn(5, 300)
            startHeartbeat(interval)
        }
    }

    private fun onEvent(envelope: EventEnvelope) {
        logResponse("event",
            "event_id=${envelope.eventId} seq=${envelope.seq} " +
            "provider=${envelope.provider} type=${envelope.eventType}")
        val event = RamenEvent.fromEnvelope(envelope)
        _events.tryEmit(event)
        sendAck(envelope.seq)
        persistLastSeq(envelope.seq)
    }

    private fun onServerError(err: RamenError) {
        logResponse("error", "code=${err.code} message=${err.message} fatal=${err.fatal}")
        _errors.tryEmit(err)
        if (err.fatal) {
            stopHeartbeat()
            try { requestObserver?.onCompleted() } catch (_: Exception) {}
            if (!closed) _connectionState.value = RamenConnectionState.DISCONNECTED
        }
    }

    private fun sendAck(seq: Long) {
        val ack = Ack.newBuilder()
            .setSeq(seq)
            .setStatus(AckStatus.ACK_STATUS_SUCCESS)
            .build()
        val msg = ClientMessage.newBuilder().setAck(ack).build()
        trySend(msg)
    }

    private fun persistLastSeq(seq: Long) {
        prefs.edit().putLong(KEY_LAST_SEQ, seq).apply()
    }

    private fun sendHeartbeat() {
        heartbeatsWithoutAck++
        if (heartbeatsWithoutAck >= config.heartbeatMissedAttempts) {
            stopHeartbeat()
            try { requestObserver?.onCompleted() } catch (_: Exception) {}
            scheduleReconnect()
            return
        }
        val now = System.currentTimeMillis()
        val ts = Timestamp.newBuilder()
            .setSeconds(now / 1000)
            .setNanos(((now % 1000) * 1_000_000).toInt())
            .build()
        val hb = Heartbeat.newBuilder().setTimestamp(ts).build()
        val msg = ClientMessage.newBuilder().setHeartbeat(hb).build()
        trySend(msg)
    }

    private fun trySend(msg: ClientMessage) {
        try {
            requestObserver?.onNext(msg)
        } catch (e: Exception) {
            log("trySend failed: $e")
        }
    }

    private fun startHeartbeat(intervalSeconds: Int = config.heartbeatIntervalSeconds) {
        stopHeartbeat()
        heartbeatJob = scope.launch {
            while (isActive) {
                delay(intervalSeconds * 1000L)
                sendHeartbeat()
            }
        }
    }

    private fun stopHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = null
    }

    private fun scheduleReconnect() {
        if (closed) return
        stopHeartbeat()
        log("reconnecting in ${backoffSeconds}s")
        _connectionState.value = RamenConnectionState.RECONNECTING
        val delay = backoffSeconds
        backoffSeconds = (backoffSeconds * 2).coerceAtMost(32)
        scope.launch {
            delay(delay * 1000L)
            if (closed) return@launch
            log("reconnecting now...")
            shutdown()
            connect()
        }
    }

    private fun shutdown() {
        try { requestObserver?.onCompleted() } catch (_: Exception) {}
        requestObserver = null
        try { channel?.shutdown()?.awaitTermination(2, TimeUnit.SECONDS) } catch (_: Exception) {}
        channel = null
    }

    /** Close the client and stop reconnecting. */
    fun close() {
        closed = true
        stopHeartbeat()
        shutdown()
        scope.cancel()
    }

    private fun log(msg: String) {
        if (config.logResponses) Log.d(TAG, "connection: $msg")
    }

    private fun logResponse(type: String, detail: String) {
        if (config.logResponses) Log.d(TAG, "$type: $detail")
    }
}
