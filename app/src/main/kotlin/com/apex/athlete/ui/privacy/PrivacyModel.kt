package com.apex.athlete.ui.privacy

import androidx.annotation.StringRes
import com.apex.athlete.R
import com.apex.athlete.core.data.healthconnect.HealthConnectPermissions

/**
 * One Health Connect permission Apex requests. [permission] is taken from [HealthConnectPermissions], so
 * this list cannot drift from the code that requests the permissions (a unit test checks it covers all of them).
 */
internal class HealthConnectUse(
    val permission: String,
    @StringRes val name: Int,
    @StringRes val why: Int,
)

internal val healthConnectUses: List<HealthConnectUse> = listOf(
    HealthConnectUse(HealthConnectPermissions.heartRate, R.string.privacy_hc_heart_rate, R.string.privacy_hc_heart_rate_why),
    HealthConnectUse(HealthConnectPermissions.restingHeartRate, R.string.privacy_hc_resting_hr, R.string.privacy_hc_resting_hr_why),
    HealthConnectUse(HealthConnectPermissions.hrv, R.string.privacy_hc_hrv, R.string.privacy_hc_hrv_why),
    HealthConnectUse(HealthConnectPermissions.sleep, R.string.privacy_hc_sleep, R.string.privacy_hc_sleep_why),
    HealthConnectUse(HealthConnectPermissions.oxygenSaturation, R.string.privacy_hc_spo2, R.string.privacy_hc_spo2_why),
    HealthConnectUse(HealthConnectPermissions.respiratoryRate, R.string.privacy_hc_respiratory, R.string.privacy_hc_respiratory_why),
    HealthConnectUse(HealthConnectPermissions.skinTemperature, R.string.privacy_hc_skin_temp, R.string.privacy_hc_skin_temp_why),
    HealthConnectUse(HealthConnectPermissions.steps, R.string.privacy_hc_steps, R.string.privacy_hc_steps_why),
    HealthConnectUse(HealthConnectPermissions.exercise, R.string.privacy_hc_exercise, R.string.privacy_hc_exercise_why),
    HealthConnectUse(HealthConnectPermissions.totalCalories, R.string.privacy_hc_calories, R.string.privacy_hc_calories_why),
    HealthConnectUse(HealthConnectPermissions.vo2Max, R.string.privacy_hc_vo2, R.string.privacy_hc_vo2_why),
    HealthConnectUse(HealthConnectPermissions.floors, R.string.privacy_hc_floors, R.string.privacy_hc_floors_why),
    HealthConnectUse(HealthConnectPermissions.distance, R.string.privacy_hc_distance, R.string.privacy_hc_distance_why),
    HealthConnectUse(HealthConnectPermissions.history, R.string.privacy_hc_history, R.string.privacy_hc_history_why),
    HealthConnectUse(HealthConnectPermissions.background, R.string.privacy_hc_background, R.string.privacy_hc_background_why),
)
