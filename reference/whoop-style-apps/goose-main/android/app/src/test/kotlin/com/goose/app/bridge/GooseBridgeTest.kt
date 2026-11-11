package com.goose.app.bridge

import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * JVM unit tests for GooseBridge error JSON formatting.
 *
 * System.loadLibrary("goose_core") cannot run in a JVM unit test — there is
 * no .so on the JVM library path. These tests call buildBridgeErrorJson()
 * directly (a package-internal top-level function) without touching GooseBridge
 * object initialization, which avoids the UnsatisfiedLinkError.
 *
 * Full native integration (handle("{}") returns JSON) is verified by
 * ./gradlew assembleDebug and on-device instrumented tests in Phase 107.
 */
class GooseBridgeTest {

    @Test
    fun buildErrorJsonContainsOkFalse() {
        val result = buildBridgeErrorJson("test error")
        assertTrue("Error JSON must contain \"ok\":false", result.contains("\"ok\":false"))
        assertTrue("Error JSON must contain error message", result.contains("test error"))
        assertTrue("Error JSON must contain \"result\":null", result.contains("\"result\":null"))
    }

    @Test
    fun buildErrorJsonEscapesBackslashesAndQuotes() {
        val result = buildBridgeErrorJson("error with \"quotes\" and \\backslash")
        assertTrue("Quotes must be escaped in JSON", result.contains("\\\"quotes\\\""))
        assertTrue("Backslashes must be escaped in JSON", result.contains("\\\\backslash"))
    }

    @Test
    fun buildErrorJsonStructureIsValid() {
        val result = buildBridgeErrorJson("some error")
        assertTrue("Must contain ok field", result.contains("\"ok\""))
        assertTrue("Must contain result field", result.contains("\"result\""))
        assertTrue("Must contain error field", result.contains("\"error\""))
        assertTrue("Must contain timing field", result.contains("\"timing\""))
        assertTrue("ok must be false", result.contains("\"ok\":false"))
        assertTrue("result must be null", result.contains("\"result\":null"))
        assertTrue("timing must be null", result.contains("\"timing\":null"))
    }
}
