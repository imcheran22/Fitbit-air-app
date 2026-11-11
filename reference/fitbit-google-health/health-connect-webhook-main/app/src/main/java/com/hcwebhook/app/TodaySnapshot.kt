package com.hcwebhook.app

import kotlinx.serialization.Serializable

/** What the Today widget shows. Read after each sync, while the app has Health Connect access. */
@Serializable
data class TodaySnapshot(
    val updatedAt: Long,
    /** Today's steps from the Health Connect total, so apps that write the same steps count once. */
    val steps: Long? = null,
    val sleepMinutes: Long? = null,
    val weightKg: Double? = null,
    val heartRate: Long? = null,
)
