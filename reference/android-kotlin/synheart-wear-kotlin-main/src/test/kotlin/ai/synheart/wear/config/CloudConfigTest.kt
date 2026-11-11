package ai.synheart.wear.config

import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Unit tests for CloudConfig
 *
 * Tests configuration validation and defaults
 */
class CloudConfigTest {

    @Test
    fun `should create CloudConfig with default values`() {
        // When
        val config = CloudConfig(appId = "test-app")

        // Then
        assertEquals("https://api.synheart.ai/wear", config.baseUrl)
        assertEquals("test-app", config.appId)
        assertEquals("synheart://oauth/callback", config.redirectUri)
        assertEquals(null, config.organizationId)
        assertFalse(config.enableDebugLogging)
    }

    @Test
    fun `should create CloudConfig with custom values`() {
        // When
        val config = CloudConfig(
            baseUrl = "https://custom-api.example.com",
            appId = "custom-app",
            redirectUri = "myapp://oauth/callback",
            organizationId = "org-123",
            enableDebugLogging = true
        )

        // Then
        assertEquals("https://custom-api.example.com", config.baseUrl)
        assertEquals("custom-app", config.appId)
        assertEquals("myapp://oauth/callback", config.redirectUri)
        assertEquals("org-123", config.organizationId)
        assertTrue(config.enableDebugLogging)
    }

    @Test
    fun `should use default redirectUri when not specified`() {
        // When
        val config = CloudConfig(appId = "test-app")

        // Then
        assertEquals("synheart://oauth/callback", config.redirectUri)
    }

    @Test
    fun `should allow custom redirectUri scheme`() {
        // When
        val config = CloudConfig(
            appId = "test-app",
            redirectUri = "com.example.myapp://oauth/whoop"
        )

        // Then
        assertEquals("com.example.myapp://oauth/whoop", config.redirectUri)
    }

    @Test
    fun `default debug logging should be false`() {
        // When
        val config = CloudConfig(appId = "test-app")

        // Then
        assertFalse(config.enableDebugLogging)
    }

    @Test
    fun `should support production base URL`() {
        // When
        val config = CloudConfig(
            baseUrl = "https://api.synheart.ai/wear",
            appId = "prod-app"
        )

        // Then
        assertEquals("https://api.synheart.ai/wear", config.baseUrl)
    }

    @Test
    fun `organizationId should be optional`() {
        // When
        val config = CloudConfig(appId = "test-app")

        // Then
        assertEquals(null, config.organizationId)
    }

    @Test
    fun `should create config with all fields specified`() {
        // Given
        val baseUrl = "https://test.synheart.io"
        val appId = "app-xyz"
        val redirectUri = "myapp://callback"
        val orgId = "org-abc"
        val debugLogging = true

        // When
        val config = CloudConfig(
            baseUrl = baseUrl,
            appId = appId,
            redirectUri = redirectUri,
            organizationId = orgId,
            enableDebugLogging = debugLogging
        )

        // Then
        assertEquals(baseUrl, config.baseUrl)
        assertEquals(appId, config.appId)
        assertEquals(redirectUri, config.redirectUri)
        assertEquals(orgId, config.organizationId)
        assertEquals(debugLogging, config.enableDebugLogging)
    }
}

