package ai.synheart.wear.config

import ai.synheart.wear.models.DeviceAdapter
import org.junit.Assert.*
import org.junit.Test

class SynheartWearConfigTest {

    @Test
    fun `test default config has HEALTH_CONNECT enabled`() {
        val config = SynheartWearConfig()

        assertTrue(config.enabledAdapters.contains(DeviceAdapter.HEALTH_CONNECT))
        assertEquals(1, config.enabledAdapters.size)
    }

    @Test
    fun `test default config has caching enabled`() {
        val config = SynheartWearConfig()

        assertTrue(config.enableLocalCaching)
    }

    @Test
    fun `test default config has encryption enabled`() {
        val config = SynheartWearConfig()

        assertTrue(config.enableEncryption)
    }

    @Test
    fun `test default stream interval is 3 seconds`() {
        val config = SynheartWearConfig()

        assertEquals(3000L, config.streamInterval)
    }

    @Test
    fun `test default max cache size is 100MB`() {
        val config = SynheartWearConfig()

        assertEquals(100 * 1024 * 1024L, config.maxCacheSize)
    }

    @Test
    fun `test default max cache age is 30 days`() {
        val config = SynheartWearConfig()

        val expectedAge = 30L * 24 * 60 * 60 * 1000
        assertEquals(expectedAge, config.maxCacheAge)
    }

    @Test
    fun `test custom config with multiple adapters`() {
        val config = SynheartWearConfig(
            enabledAdapters = setOf(
                DeviceAdapter.HEALTH_CONNECT,
                DeviceAdapter.SAMSUNG_HEALTH,
                DeviceAdapter.FITBIT
            )
        )

        assertEquals(3, config.enabledAdapters.size)
        assertTrue(config.enabledAdapters.contains(DeviceAdapter.HEALTH_CONNECT))
        assertTrue(config.enabledAdapters.contains(DeviceAdapter.SAMSUNG_HEALTH))
        assertTrue(config.enabledAdapters.contains(DeviceAdapter.FITBIT))
    }

    @Test
    fun `test custom config with caching disabled`() {
        val config = SynheartWearConfig(
            enableLocalCaching = false
        )

        assertFalse(config.enableLocalCaching)
    }

    @Test
    fun `test custom config with encryption disabled`() {
        val config = SynheartWearConfig(
            enableEncryption = false
        )

        assertFalse(config.enableEncryption)
    }

    @Test
    fun `test custom config with different stream interval`() {
        val config = SynheartWearConfig(
            streamInterval = 5000L
        )

        assertEquals(5000L, config.streamInterval)
    }

    @Test
    fun `test custom config with smaller cache size`() {
        val config = SynheartWearConfig(
            maxCacheSize = 50 * 1024 * 1024L
        )

        assertEquals(50 * 1024 * 1024L, config.maxCacheSize)
    }

    @Test
    fun `test custom config with shorter cache age`() {
        val config = SynheartWearConfig(
            maxCacheAge = 7L * 24 * 60 * 60 * 1000
        )

        assertEquals(7L * 24 * 60 * 60 * 1000, config.maxCacheAge)
    }

    @Test
    fun `test config with all adapters`() {
        val config = SynheartWearConfig(
            enabledAdapters = setOf(
                DeviceAdapter.HEALTH_CONNECT,
                DeviceAdapter.SAMSUNG_HEALTH,
                DeviceAdapter.FITBIT,
                DeviceAdapter.GARMIN,
                DeviceAdapter.OURA,
                DeviceAdapter.WHOOP,
                DeviceAdapter.BLE_HRM
            )
        )

        assertEquals(7, config.enabledAdapters.size)
        DeviceAdapter.values().forEach { adapter ->
            assertTrue(config.enabledAdapters.contains(adapter))
        }
    }

    @Test
    fun `test config is immutable data class`() {
        val config1 = SynheartWearConfig(streamInterval = 1000L)
        val config2 = config1.copy(streamInterval = 2000L)

        assertEquals(1000L, config1.streamInterval)
        assertEquals(2000L, config2.streamInterval)
        assertNotEquals(config1, config2)
    }
}

