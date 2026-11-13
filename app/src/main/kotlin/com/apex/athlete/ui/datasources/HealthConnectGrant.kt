package com.apex.athlete.ui.datasources

import com.apex.athlete.core.data.healthconnect.HealthConnectPermissions

/** What to do when the Health Connect permission dialog returns. */
object HealthConnectGrant {
    /** True when the dialog added at least one record-read permission that was not granted before. */
    fun hasNewRecordPermission(before: Set<String>, after: Set<String>): Boolean =
        (after - before).any { it in HealthConnectPermissions.recordPermissions }

    /** Always looks again at what is granted; starts one sync when new record permissions arrived. */
    fun handle(before: Set<String>, after: Set<String>, refresh: () -> Unit, syncNow: () -> Unit) {
        refresh()
        if (hasNewRecordPermission(before, after)) syncNow()
    }
}
