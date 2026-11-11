package com.hcwebhook.app

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SyncTriggerTest {

    @Test
    fun firstTrigger_isAllowed() {
        assertTrue(SyncTrigger.allows(null, 1_000))
    }

    @Test
    fun secondTriggerWithinAMinute_isRefused() {
        assertFalse(SyncTrigger.allows(1_000, 1_000 + SyncTrigger.MIN_INTERVAL_MS - 1))
        assertTrue(SyncTrigger.allows(1_000, 1_000 + SyncTrigger.MIN_INTERVAL_MS))
    }

    @Test
    fun clockGoingBackwards_doesNotBlock() {
        assertTrue(SyncTrigger.allows(100_000, 50_000))
    }
}
