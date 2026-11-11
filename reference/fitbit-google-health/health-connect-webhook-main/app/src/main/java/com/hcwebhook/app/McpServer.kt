package com.hcwebhook.app

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

/** What the MCP tools can do. [HealthMcpTools] is the app's version; tests use a fake. */
interface McpTools {
    /** Health data as the webhook JSON, for [types] (empty: all enabled types) in a time range. */
    suspend fun healthData(types: List<String>, start: String?, end: String?, days: Int?): String
    suspend fun dataTypes(): String
    suspend fun syncStatus(): String
    suspend fun recentDeliveries(limit: Int, success: Boolean?): String
    /** Null when the user did not allow AI apps to start a sync. */
    val syncNow: (suspend () -> String)?
}

/**
 * A Model Context Protocol server over streamable HTTP, without sessions: the client posts one
 * JSON-RPC message to `/mcp` and gets the JSON-RPC response as `application/json`.
 * See https://modelcontextprotocol.io/specification/2025-06-18/basic/transports.
 */
class McpServer(private val tools: McpTools, private val version: String) {

    /** The JSON-RPC response to [body], or null for a notification, which gets no response. */
    suspend fun handle(body: String): String? {
        val message = try {
            Json.parseToJsonElement(body).jsonObject
        } catch (_: Exception) {
            return error(JsonNull, PARSE_ERROR, "Parse error")
        }
        val id = message["id"]
        val method = message["method"]?.jsonPrimitive?.contentOrNull
            ?: return if (id == null) null else error(id, INVALID_REQUEST, "Invalid request")
        if (id == null) return null // notifications/initialized and other notifications
        val params = message["params"] as? JsonObject
        return when (method) {
            "initialize" -> result(id, initializeResult(params))
            "ping" -> result(id, JsonObject(emptyMap()))
            "tools/list" -> result(id, buildJsonObject { put("tools", toolList()) })
            "tools/call" -> result(id, callTool(params))
            else -> error(id, METHOD_NOT_FOUND, "Method not found: $method")
        }
    }

    private fun initializeResult(params: JsonObject?): JsonObject {
        val requested = params?.get("protocolVersion")?.jsonPrimitive?.contentOrNull
        return buildJsonObject {
            put("protocolVersion", requested?.takeIf { it in SUPPORTED_VERSIONS } ?: SUPPORTED_VERSIONS.first())
            putJsonObject("capabilities") { putJsonObject("tools") { put("listChanged", false) } }
            putJsonObject("serverInfo") {
                put("name", "hc-webhook")
                put("title", "HC Webhook")
                put("version", version)
            }
            put(
                "instructions",
                "Reads health data from Health Connect on the user's phone. Times are ISO-8601. " +
                    "get_health_data returns the same JSON as the app's webhooks."
            )
        }
    }

    private fun toolList(): JsonArray = buildJsonArray {
        add(tool("get_health_data", "Read health data from Health Connect for a time range, as the webhook JSON. Without start and end, reads the last day.") {
            putJsonObject("types") {
                put("type", "array")
                put("description", "Payload keys to return, for example steps, heart_rate, sleep. Empty: all enabled types.")
                putJsonObject("items") { put("type", "string") }
            }
            putJsonObject("start") { put("type", "string"); put("description", "Range start, ISO-8601, for example 2026-10-22T00:00:00Z.") }
            putJsonObject("end") { put("type", "string"); put("description", "Range end, ISO-8601. Default: now.") }
            putJsonObject("days") { put("type", "integer"); put("description", "Read the last N days instead of start and end.") }
        })
        add(tool("list_data_types", "List the health data types, whether the app syncs them and whether it has access in Health Connect.") {})
        add(tool("get_sync_status", "The last sync, the sync schedule, the webhooks and the deliveries of the last 24 hours.") {})
        add(tool("get_recent_deliveries", "Recent webhook deliveries, newest first: time, target host, status code and item count.") {
            putJsonObject("limit") { put("type", "integer"); put("description", "Number of deliveries, 1 to 100. Default: 20.") }
            putJsonObject("success") { put("type", "boolean"); put("description", "Only deliveries that went through (true) or failed (false).") }
        })
        if (tools.syncNow != null) {
            add(tool("sync_now", "Start a sync now: send new health data to the user's webhooks.") {})
        }
    }

    private fun tool(name: String, description: String, properties: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit) = buildJsonObject {
        put("name", name)
        put("description", description)
        putJsonObject("inputSchema") {
            put("type", "object")
            putJsonObject("properties", properties)
        }
    }

    private suspend fun callTool(params: JsonObject?): JsonObject {
        val name = params?.get("name")?.jsonPrimitive?.contentOrNull
        val args = params?.get("arguments") as? JsonObject
        return try {
            val text = when (name) {
                "get_health_data" -> tools.healthData(
                    types = (args?.get("types") as? JsonArray)?.mapNotNull { it.jsonPrimitive.contentOrNull }.orEmpty(),
                    start = args.string("start"),
                    end = args.string("end"),
                    days = args?.get("days")?.jsonPrimitive?.intOrNull,
                )
                "list_data_types" -> tools.dataTypes()
                "get_sync_status" -> tools.syncStatus()
                "get_recent_deliveries" -> tools.recentDeliveries(
                    limit = (args?.get("limit")?.jsonPrimitive?.intOrNull ?: 20).coerceIn(1, 100),
                    success = args?.get("success")?.jsonPrimitive?.contentOrNull?.toBooleanStrictOrNull(),
                )
                "sync_now" -> tools.syncNow?.invoke() ?: return toolError("sync_now is off. Turn on \"AI can start a sync\" in the app.")
                else -> return toolError("Unknown tool: $name")
            }
            buildJsonObject {
                putJsonArray("content") { add(buildJsonObject { put("type", "text"); put("text", text) }) }
                put("isError", false)
            }
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            toolError(e.message ?: e::class.java.simpleName)
        }
    }

    private fun toolError(message: String) = buildJsonObject {
        putJsonArray("content") { add(buildJsonObject { put("type", "text"); put("text", message) }) }
        put("isError", true)
    }

    private fun JsonObject?.string(key: String) = this?.get(key)?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }

    private fun result(id: JsonElement, result: JsonElement) = buildJsonObject {
        put("jsonrpc", "2.0")
        put("id", id)
        put("result", result)
    }.toString()

    private fun error(id: JsonElement, code: Int, message: String) = buildJsonObject {
        put("jsonrpc", "2.0")
        put("id", id)
        putJsonObject("error") {
            put("code", code)
            put("message", message)
        }
    }.toString()

    companion object {
        /** Newest first; an older client gets the version it asks for. */
        val SUPPORTED_VERSIONS = listOf("2025-06-18", "2025-03-26", "2024-11-05")
        private const val PARSE_ERROR = -32700
        private const val INVALID_REQUEST = -32600
        private const val METHOD_NOT_FOUND = -32601
    }
}
