package com.apex.athlete.ble

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class BlePermissionsTest {
    @Test fun android12AndNewerNeedScanAndConnect() {
        assertEquals(listOf(BlePermissions.SCAN, BlePermissions.CONNECT), BlePermissions.required(31))
        assertTrue(BlePermissions.isSupported(36))
    }

    @Test fun olderAndroidIsUnsupportedAndAsksForNothing() {
        assertFalse(BlePermissions.isSupported(30))
        assertEquals(emptyList(), BlePermissions.required(28))
    }

    @Test fun missingListsOnlyUngrantedOnes() {
        assertEquals(listOf(BlePermissions.CONNECT), BlePermissions.missing(34) { it == BlePermissions.SCAN })
    }
}
