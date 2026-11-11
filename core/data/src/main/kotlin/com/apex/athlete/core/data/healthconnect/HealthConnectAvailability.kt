package com.apex.athlete.core.data.healthconnect

/** What the screens need to explain Health Connect's state. Contains no health data. */
data class HealthConnectStatus(
    val sdk: HcSdkStatus,
    /** Record-read permissions currently granted. */
    val grantedRecordPermissions: Set<String>,
    /** Record-read permissions still missing (excluding skin temperature when the platform lacks it). */
    val missingRecordPermissions: Set<String>,
    /** Reads before about 30 days ahead of the first grant return nothing unless this is true. */
    val historyGranted: Boolean,
    val historyFeatureAvailable: Boolean,
    val backgroundGranted: Boolean,
    val backgroundFeatureAvailable: Boolean,
    val skinTemperatureSupported: Boolean,
) {
    val isReadable: Boolean get() = sdk == HcSdkStatus.AVAILABLE && grantedRecordPermissions.isNotEmpty()
    val isFullyPermitted: Boolean get() = sdk == HcSdkStatus.AVAILABLE && missingRecordPermissions.isEmpty()

    /** The permissions to hand to the request contract: what is still missing, nothing already granted. */
    fun toRequest(): Set<String> = buildSet {
        addAll(missingRecordPermissions)
        if (historyFeatureAvailable && !historyGranted) add(HealthConnectPermissions.history)
        if (backgroundFeatureAvailable && !backgroundGranted) add(HealthConnectPermissions.background)
    }
}

class HealthConnectAvailability(private val data: HealthConnectDataSource) {

    /** Never throws for an absent or outdated Health Connect; those are reported in [HealthConnectStatus.sdk]. */
    suspend fun status(): HealthConnectStatus {
        val sdk = data.sdkStatus()
        if (sdk != HcSdkStatus.AVAILABLE) {
            return HealthConnectStatus(sdk, emptySet(), HealthConnectPermissions.recordPermissions, false, false, false, false, false)
        }
        val granted = try {
            data.grantedPermissions()
        } catch (_: SecurityException) {
            emptySet()
        }
        val skin = data.isFeatureAvailable(HcFeature.SKIN_TEMPERATURE)
        val wanted = HealthConnectPermissions.recordPermissions.let { if (skin) it else it - HealthConnectPermissions.skinTemperature }
        return HealthConnectStatus(
            sdk = sdk,
            grantedRecordPermissions = granted.intersect(HealthConnectPermissions.recordPermissions),
            missingRecordPermissions = wanted - granted,
            historyGranted = HealthConnectPermissions.history in granted,
            historyFeatureAvailable = data.isFeatureAvailable(HcFeature.READ_HEALTH_DATA_HISTORY),
            backgroundGranted = HealthConnectPermissions.background in granted,
            backgroundFeatureAvailable = data.isFeatureAvailable(HcFeature.READ_HEALTH_DATA_IN_BACKGROUND),
            skinTemperatureSupported = skin,
        )
    }
}
