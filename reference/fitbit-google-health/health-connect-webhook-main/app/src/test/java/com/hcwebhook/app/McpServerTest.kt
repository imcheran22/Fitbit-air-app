package com.hcwebhook.app

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class McpServerTest {

    private class FakeTools(override val syncNow: (suspend () -> String)? = null) : McpTools {
        var lastTypes: List<String>? = null
        override suspend fun healthData(types: List<String>, start: String?, end: String?, days: Int?): String {
            lastTypes = types
            return """{"steps":[]}"""
        }
        override suspend fun dataTypes() = "[]"
        override suspend fun syncStatus() = "{}"
        override suspend fun recentDeliveries(limit: Int, success: Boolean?) = "[limit=$limit]"
    }

    private fun call(server: McpServer, body: String): JsonObject =
        Json.parseToJsonElement(runBlocking { server.handle(body) }!!).jsonObject

    @Test
    fun initialize_echoesSupportedVersion() {
        val response = call(McpServer(FakeTools(), "1.9.29"), """{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26"}}""")
        val result = response["result"]!!.jsonObject

        assertEquals("2025-03-26", result["protocolVersion"]!!.jsonPrimitive.content)
        assertEquals("hc-webhook", result["serverInfo"]!!.jsonObject["name"]!!.jsonPrimitive.content)
        assertEquals(1, response["id"]!!.jsonPrimitive.int)
    }

    @Test
    fun initialize_unknownVersion_getsNewest() {
        val response = call(McpServer(FakeTools(), "1"), """{"jsonrpc":"2.0","id":"a","method":"initialize","params":{"protocolVersion":"1999-01-01"}}""")

        assertEquals(McpServer.SUPPORTED_VERSIONS.first(), response["result"]!!.jsonObject["protocolVersion"]!!.jsonPrimitive.content)
    }

    @Test
    fun notification_getsNoResponse() {
        assertNull(runBlocking { McpServer(FakeTools(), "1").handle("""{"jsonrpc":"2.0","method":"notifications/initialized"}""") })
    }

    @Test
    fun toolsList_hidesSyncNowUntilAllowed() {
        fun names(tools: FakeTools) = call(McpServer(tools, "1"), """{"jsonrpc":"2.0","id":2,"method":"tools/list"}""")["result"]!!
            .jsonObject["tools"]!!.jsonArray.map { it.jsonObject["name"]!!.jsonPrimitive.content }

        assertFalse("sync_now" in names(FakeTools()))
        assertTrue("sync_now" in names(FakeTools(syncNow = { "ok" })))
    }

    @Test
    fun toolsCall_passesArgumentsAndClampsLimit() {
        val tools = FakeTools()
        val server = McpServer(tools, "1")
        call(server, """{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_health_data","arguments":{"types":["steps"]}}}""")
        val deliveries = call(server, """{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_recent_deliveries","arguments":{"limit":500}}}""")

        assertEquals(listOf("steps"), tools.lastTypes)
        assertEquals("[limit=100]", deliveries["result"]!!.jsonObject["content"]!!.jsonArray[0].jsonObject["text"]!!.jsonPrimitive.content)
    }

    @Test
    fun syncNowOff_isToolError() {
        val response = call(McpServer(FakeTools(), "1"), """{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"sync_now"}}""")

        assertTrue(response["result"]!!.jsonObject["isError"]!!.jsonPrimitive.boolean)
    }

    @Test
    fun badJsonAndUnknownMethod_areJsonRpcErrors() {
        val server = McpServer(FakeTools(), "1")

        assertEquals(-32700, call(server, "{nope")["error"]!!.jsonObject["code"]!!.jsonPrimitive.int)
        assertEquals(-32601, call(server, """{"jsonrpc":"2.0","id":6,"method":"resources/list"}""")["error"]!!.jsonObject["code"]!!.jsonPrimitive.int)
    }
}
