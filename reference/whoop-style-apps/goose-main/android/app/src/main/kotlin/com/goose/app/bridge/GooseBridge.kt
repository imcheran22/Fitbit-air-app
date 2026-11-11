package com.goose.app.bridge

/**
 * JNI bridge to the Rust goose_core library.
 *
 * Mirrors GooseRustBridge.swift: JSON-RPC envelope pattern.
 * Request: {"schema":"goose.bridge.request.v1","method":"...","args":{...}}
 * Response: {"ok":true,"result":...,"error":null,"timing":...}
 *
 * THREADING: handle() blocks the calling thread for the full Rust+SQLite
 * round trip. Never call from the main thread. Use safeHandle() for
 * error-safe invocation, or wrap in a coroutine on Dispatchers.IO.
 */
object GooseBridge {
    init {
        System.loadLibrary("goose_core")
    }

    /**
     * Raw JNI call to Rust goose_bridge_handle_json via android_jni.rs.
     * Throws UnsatisfiedLinkError if .so is not loaded, or any Throwable
     * from the native side.
     */
    external fun handle(request: String): String

    /**
     * Safe wrapper — returns error JSON instead of throwing.
     * Use this in all production code paths.
     */
    fun safeHandle(request: String): String {
        return try {
            handle(request)
        } catch (e: Throwable) {
            buildBridgeErrorJson(e.message ?: "Unknown native error")
        }
    }
}

/**
 * Package-internal helper: formats a native error as a bridge error JSON response.
 * Kept as a top-level function so unit tests can exercise it without triggering
 * GooseBridge object initialization (which calls System.loadLibrary).
 *
 * Response schema: {"ok":false,"result":null,"error":{"message":"..."},"timing":null}
 */
internal fun buildBridgeErrorJson(message: String): String {
    val escaped = message.replace("\\", "\\\\").replace("\"", "\\\"")
    return """{"ok":false,"result":null,"error":{"message":"$escaped"},"timing":null}"""
}
