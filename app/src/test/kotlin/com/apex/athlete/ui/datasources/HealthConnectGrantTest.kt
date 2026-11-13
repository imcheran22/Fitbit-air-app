package com.apex.athlete.ui.datasources

import com.apex.athlete.core.data.healthconnect.HealthConnectPermissions
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class HealthConnectGrantTest {
    private val hr = HealthConnectPermissions.heartRate
    private val steps = HealthConnectPermissions.steps

    @Test fun aNewRecordPermissionStartsASync() {
        assertTrue(HealthConnectGrant.hasNewRecordPermission(before = emptySet(), after = setOf(hr)))
        assertTrue(HealthConnectGrant.hasNewRecordPermission(before = setOf(hr), after = setOf(hr, steps)))
    }

    @Test fun nothingNewOrADeniedDialogStartsNothing() {
        assertFalse(HealthConnectGrant.hasNewRecordPermission(before = setOf(hr), after = setOf(hr)))
        assertFalse(HealthConnectGrant.hasNewRecordPermission(before = setOf(hr), after = emptySet()))
        assertFalse(HealthConnectGrant.hasNewRecordPermission(before = emptySet(), after = emptySet()))
    }

    @Test fun onlyHistoryOrBackgroundIsNewDoesNotCountAsNewData() {
        assertFalse(HealthConnectGrant.hasNewRecordPermission(before = setOf(hr), after = setOf(hr, HealthConnectPermissions.background)))
    }

    @Test fun handleRefreshesAlwaysAndSyncsOnceOnlyWhenNew() {
        val calls = ArrayList<String>()
        HealthConnectGrant.handle(setOf(hr), setOf(hr, steps), refresh = { calls += "refresh" }, syncNow = { calls += "sync" })
        assertEquals(listOf("refresh", "sync"), calls)
        calls.clear()
        HealthConnectGrant.handle(setOf(hr), setOf(hr), refresh = { calls += "refresh" }, syncNow = { calls += "sync" })
        assertEquals(listOf("refresh"), calls)
    }
}
