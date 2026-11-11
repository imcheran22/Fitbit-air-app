package com.hcwebhook.app

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppLockTest {

    @Test
    fun locksUntilUnlocked() {
        assertTrue(AppLock.lockedAfter(unlocked = false, backgroundedAt = null, now = 0))
    }

    @Test
    fun locksEveryTimeTheUserLeft() {
        assertTrue(AppLock.lockedAfter(unlocked = true, backgroundedAt = 1_000, now = 1_001))
    }

    @Test
    fun openWhileInForeground() {
        assertFalse(AppLock.lockedAfter(unlocked = true, backgroundedAt = null, now = Long.MAX_VALUE))
    }
}
