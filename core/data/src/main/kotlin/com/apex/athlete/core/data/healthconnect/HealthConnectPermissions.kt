package com.apex.athlete.core.data.healthconnect

import androidx.health.connect.client.PermissionController

/**
 * The exact permission strings Apex asks for, and which stream needs which. Every one is a READ
 * permission: Apex never requests or uses a write permission.
 *
 * Strings are the documented `android.permission.health.*` names; the same list must appear as
 * `<uses-permission>` entries in the app manifest (see [manifestPermissions]), otherwise the
 * Health Connect dialog fails silently.
 */
object HealthConnectPermissions {
    const val PROVIDER_PACKAGE = "com.google.android.apps.healthdata"

    private const val P = "android.permission.health."

    val heartRate = P + "READ_HEART_RATE"
    val restingHeartRate = P + "READ_RESTING_HEART_RATE"
    val hrv = P + "READ_HEART_RATE_VARIABILITY"
    val sleep = P + "READ_SLEEP"
    val oxygenSaturation = P + "READ_OXYGEN_SATURATION"
    val respiratoryRate = P + "READ_RESPIRATORY_RATE"
    val skinTemperature = P + "READ_SKIN_TEMPERATURE"
    val steps = P + "READ_STEPS"
    val exercise = P + "READ_EXERCISE"
    val totalCalories = P + "READ_TOTAL_CALORIES_BURNED"
    val vo2Max = P + "READ_VO2_MAX"
    val floors = P + "READ_FLOORS_CLIMBED"
    val distance = P + "READ_DISTANCE"

    /** Lets reads reach further back than 30 days before the first grant. Feature-gated. */
    val history = P + "READ_HEALTH_DATA_HISTORY"

    /** Lets background workers read. Feature-gated. */
    val background = P + "READ_HEALTH_DATA_IN_BACKGROUND"

    fun forFamily(family: HcFamily): String = when (family) {
        HcFamily.HEART_RATE -> heartRate
        HcFamily.RESTING_HEART_RATE -> restingHeartRate
        HcFamily.HRV_RMSSD -> hrv
        HcFamily.SLEEP -> sleep
        HcFamily.OXYGEN_SATURATION -> oxygenSaturation
        HcFamily.RESPIRATORY_RATE -> respiratoryRate
        HcFamily.SKIN_TEMPERATURE -> skinTemperature
        HcFamily.STEPS -> steps
        HcFamily.EXERCISE -> exercise
        HcFamily.TOTAL_CALORIES -> totalCalories
        HcFamily.VO2_MAX -> vo2Max
        HcFamily.FLOORS -> floors
        HcFamily.DISTANCE -> distance
    }

    /** One read permission per record family; each stream needs its own. */
    val recordPermissions: Set<String> = HcFamily.entries.map(::forFamily).toSet()

    /** Everything Apex requests in one dialog (record reads plus history and background). */
    val all: Set<String> = recordPermissions + history + background

    /** What the manifest must declare: identical to [all]. */
    val manifestPermissions: Set<String> get() = all

    /**
     * Whether history and background permissions are requested only when the platform reports the
     * feature. Requesting an unsupported permission is rejected by the dialog, so the caller asks
     * for [requestable] rather than [all].
     */
    fun requestable(features: (HcFeature) -> Boolean): Set<String> = buildSet {
        addAll(recordPermissions)
        if (features(HcFeature.SKIN_TEMPERATURE).not()) remove(skinTemperature)
        if (features(HcFeature.READ_HEALTH_DATA_HISTORY)) add(history)
        if (features(HcFeature.READ_HEALTH_DATA_IN_BACKGROUND)) add(background)
    }

    /** The contract :app registers with `registerForActivityResult`; input is [requestable] or [all]. */
    fun requestContract() = PermissionController.createRequestPermissionResultContract()
}
