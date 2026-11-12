package com.apex.athlete.ui.privacy

import com.apex.athlete.core.data.healthconnect.HealthConnectPermissions
import kotlin.test.Test
import kotlin.test.assertEquals

class PrivacyModelTest {
    @Test fun explainsEveryPermissionApexRequests() {
        assertEquals(HealthConnectPermissions.all, healthConnectUses.map { it.permission }.toSet())
        assertEquals(HealthConnectPermissions.all.size, healthConnectUses.size)
    }
}
