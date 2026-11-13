package com.apex.athlete.core.data.settings

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.runBlocking
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** The experimental Health age switch (DECISIONS D13): off by default, persisted, cleared with everything else. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class HealthAgeSettingRobolectricTest {
    @Test
    fun offByDefaultThenPersistedThenClearedWithAllData(): Unit = runBlocking {
        val store = SettingsStore(ApplicationProvider.getApplicationContext<Context>())
        assertFalse(AppSettings().healthAgeEnabled)
        assertFalse(store.currentSettings().healthAgeEnabled)

        store.update { it.copy(healthAgeEnabled = true, theme = ThemeChoice.DARK) }
        val on = store.currentSettings()
        assertTrue(on.healthAgeEnabled)
        assertEquals(ThemeChoice.DARK, on.theme) // other settings are untouched by the toggle

        store.update { it.copy(healthAgeEnabled = false) }
        assertFalse(store.currentSettings().healthAgeEnabled)

        store.update { it.copy(healthAgeEnabled = true) }
        store.clear()
        assertFalse(store.currentSettings().healthAgeEnabled)
    }
}
