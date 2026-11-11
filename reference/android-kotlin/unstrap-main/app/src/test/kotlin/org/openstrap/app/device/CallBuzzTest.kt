package org.openstrap.app.device

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.openstrap.app.data.db.OpenStrapDatabase
import org.openstrap.app.data.settings.SettingsStore
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** A ringing call wins: from its start until its stop, other buzzes are dropped instead of cutting it off. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class CallBuzzTest {
    @Test
    fun otherBuzzesAreDroppedUntilTheCallStops() = runTest {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val db = Room.inMemoryDatabaseBuilder(context, OpenStrapDatabase::class.java).allowMainThreadQueries().build()
        try {
            val strap = StrapManager(context, SettingsStore(context), db.healthDao())
            // Not connected: a buzz normally fails with "not connected", so a silent return means it was dropped.
            assertTrue(runCatching { strap.buzz(listOf(200)) }.exceptionOrNull() is StrapCommandException)
            runCatching { strap.startCallBuzz(pulsed = false) }
            assertTrue(runCatching { strap.buzz(listOf(200)) }.isSuccess)
            runCatching { strap.stopCallBuzz() }
            assertTrue(runCatching { strap.buzz(listOf(200)) }.exceptionOrNull() is StrapCommandException)
        } finally {
            db.close()
        }
    }
}
