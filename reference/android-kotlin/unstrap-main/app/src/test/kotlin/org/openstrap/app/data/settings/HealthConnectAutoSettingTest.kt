package org.openstrap.app.data.settings

import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Auto sync to Health Connect as stored: off by default, stopping keeps why, the switch clears it, forgetting the strap keeps it. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class HealthConnectAutoSettingTest {
    private val settings = SettingsStore(ApplicationProvider.getApplicationContext())

    @Test fun `the setting's states`() = runTest {
        settings.forgetDevice()
        settings.setHealthConnectAuto(false)
        assertEquals(HealthConnectAuto(on = false), settings.healthConnectAuto.first().copy(lastSynced = null))

        settings.setHealthConnectAuto(true)
        settings.setHealthConnectSynced(1_800_000_000L)
        assertEquals(HealthConnectAuto(on = true, lastSynced = 1_800_000_000L), settings.healthConnectAuto.first())

        settings.stopHealthConnectAuto(HealthConnectAuto.Stopped.PERMISSIONS)
        assertEquals(HealthConnectAuto(false, 1_800_000_000L, HealthConnectAuto.Stopped.PERMISSIONS), settings.healthConnectAuto.first())

        // Forgetting the strap keeps it: it's about the data.
        settings.forgetDevice()
        assertEquals(HealthConnectAuto(false, 1_800_000_000L, HealthConnectAuto.Stopped.PERMISSIONS), settings.healthConnectAuto.first())

        // Turning it on again clears why it stopped.
        settings.setHealthConnectAuto(true)
        assertEquals(HealthConnectAuto(true, 1_800_000_000L, null), settings.healthConnectAuto.first())
        settings.setHealthConnectAuto(false)
        assertEquals(HealthConnectAuto(false, 1_800_000_000L, null), settings.healthConnectAuto.first())
    }
}
