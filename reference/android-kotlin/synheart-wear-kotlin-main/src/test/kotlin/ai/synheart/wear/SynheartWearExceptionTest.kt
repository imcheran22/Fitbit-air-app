package ai.synheart.wear

import org.junit.Assert.*
import org.junit.Test

class SynheartWearExceptionTest {

    @Test
    fun `test exception with message only`() {
        val exception = SynheartWearException("Test error message")

        assertEquals("Test error message", exception.message)
        assertNull(exception.cause)
    }

    @Test
    fun `test exception with message and cause`() {
        val cause = IllegalStateException("Root cause")
        val exception = SynheartWearException("Test error message", cause)

        assertEquals("Test error message", exception.message)
        assertEquals(cause, exception.cause)
    }

    @Test
    fun `test exception is throwable`() {
        val exception = SynheartWearException("Test error")

        assertTrue(exception is Throwable)
        assertTrue(exception is Exception)
    }

    @Test
    fun `test exception can be caught`() {
        var caught = false

        try {
            throw SynheartWearException("Test error")
        } catch (e: SynheartWearException) {
            caught = true
            assertEquals("Test error", e.message)
        }

        assertTrue(caught)
    }

    @Test
    fun `test exception preserves stack trace`() {
        val exception = SynheartWearException("Test error")

        assertNotNull(exception.stackTrace)
        assertTrue(exception.stackTrace.isNotEmpty())
    }
}

