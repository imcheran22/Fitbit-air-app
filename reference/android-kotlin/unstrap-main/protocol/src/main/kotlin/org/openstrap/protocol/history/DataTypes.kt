package org.openstrap.protocol.history

import org.openstrap.protocol.services.DeviceFeatures

/**
 * How relevant a GDSP data type is for the Helio Strap (spec 02 §2, "Strap" column).
 */
enum class StrapRelevance {
    /** Strap-relevant and expected. */
    EXPECTED,

    /** Only fetched if the device lists the type in its GDSP `dataTypeMap`. */
    IF_ADVERTISED,

    /** Not applicable (needs a screen, GPS, ECG, scale, ...). Never fetched, even if advertised. */
    NOT_APPLICABLE,
}

/**
 * GDSP one-byte data-type codes (spec 02 §2).
 *
 * @param featureBit group-2 bit of the runtime feature bitmap (0x0028) that Zepp's job for this type checks
 *   (codemap 04 §2.2). Only applied when the strap reports group 2; otherwise [strap] alone decides.
 */
enum class HistoryDataType(val code: Int, val strap: StrapRelevance, val featureBit: Int? = null) {
    ACTIVITY(1, StrapRelevance.EXPECTED),
    HEART_RATE_MANUAL(2, StrapRelevance.IF_ADVERTISED),
    ECG(3, StrapRelevance.NOT_APPLICABLE),
    // Zepp fetches 4 only for hasFeatureTemperature devices (g9h.java:607). That is a static model list (b6l.b),
    // not a runtime feature bit, and the strap isn't on it, so the bitmap doesn't change this.
    TEMPERATURE_LEGACY(4, StrapRelevance.NOT_APPLICABLE),
    SPORT_SUMMARY(5, StrapRelevance.EXPECTED),
    SPORT_DETAIL(6, StrapRelevance.EXPECTED),
    LOG(7, StrapRelevance.NOT_APPLICABLE),
    PPG_RR(8, StrapRelevance.NOT_APPLICABLE),
    AF_PPG(11, StrapRelevance.NOT_APPLICABLE),
    PAI(13, StrapRelevance.EXPECTED),
    SPORT_SUMMARY_ALT(14, StrapRelevance.NOT_APPLICABLE),
    AF_RESULT(17, StrapRelevance.NOT_APPLICABLE),
    STRESS_SINGLE(18, StrapRelevance.EXPECTED),
    STRESS_ALL_DAY(19, StrapRelevance.EXPECTED),
    AF_ACC(30, StrapRelevance.NOT_APPLICABLE),
    SPO2_SINGLE(37, StrapRelevance.EXPECTED),
    SPO2_OSA(38, StrapRelevance.EXPECTED, DeviceFeatures.G2_SLEEP_SPO2),
    SPO2_OSA_EVENT(39, StrapRelevance.IF_ADVERTISED, DeviceFeatures.G2_SLEEP_SPO2),
    SPO2_OSA_EVENT_ALT(43, StrapRelevance.IF_ADVERTISED, DeviceFeatures.G2_SLEEP_SPO2),
    DEVICE_STATISTIC(44, StrapRelevance.NOT_APPLICABLE),

    // 46 verified on hardware (skin temperature per minute). 47/48: sync-time keys only, no job found.
    BODY_TEMPERATURE_ALL_DAY(46, StrapRelevance.EXPECTED),
    BODY_TEMPERATURE_SINGLE(47, StrapRelevance.IF_ADVERTISED),
    BODY_TEMPERATURE_80S(48, StrapRelevance.IF_ADVERTISED),

    BLOOD_PRESSURE_52(52, StrapRelevance.NOT_APPLICABLE),
    BLOOD_PRESSURE_53(53, StrapRelevance.NOT_APPLICABLE),
    BLOOD_PRESSURE_54(54, StrapRelevance.NOT_APPLICABLE),
    BLOOD_PRESSURE_55(55, StrapRelevance.NOT_APPLICABLE),
    SLEEP_BREATH_RATE(56, StrapRelevance.EXPECTED),
    SLEEP_RESPIRATORY_RATE_EVENT(57, StrapRelevance.IF_ADVERTISED),
    RESTING_HEART_RATE(58, StrapRelevance.EXPECTED),
    SPORT_EFFECT(59, StrapRelevance.IF_ADVERTISED),
    DAILY_MAX_EXERCISE_HR(61, StrapRelevance.IF_ADVERTISED, DeviceFeatures.G2_DAILY_MAX_HR),
    BLOOD_PRESSURE_62(62, StrapRelevance.NOT_APPLICABLE),
    SLEEP_PLAN(66, StrapRelevance.IF_ADVERTISED),
    // Zepp gates 70 on runtime feature bit 62 (HMDeviceConfig.java:862-871). Without the bitmap we fetch it only
    // when the strap advertises it.
    RECOVERY_HEART_RATE(70, StrapRelevance.IF_ADVERTISED, DeviceFeatures.G2_RECOVERY_HR),
    HLD(71, StrapRelevance.NOT_APPLICABLE, DeviceFeatures.G2_HLD),
    SLEEP_RESULT(72, StrapRelevance.EXPECTED, DeviceFeatures.G2_SLEEP_RESULT),
    HRV_RMSSD(73, StrapRelevance.EXPECTED, DeviceFeatures.G2_HRV),
    OSA_RESULT(74, StrapRelevance.IF_ADVERTISED, DeviceFeatures.G2_OSA),
    JS_WEIGHT_V1(75, StrapRelevance.NOT_APPLICABLE),
    SEC_HR(76, StrapRelevance.IF_ADVERTISED),
    JS_WEIGHT_V2(77, StrapRelevance.NOT_APPLICABLE),
    HRV_SDNN(78, StrapRelevance.IF_ADVERTISED),
    SPORT_VOICE_RECORD(79, StrapRelevance.NOT_APPLICABLE),
    HLD_COMPOSITION(82, StrapRelevance.NOT_APPLICABLE, DeviceFeatures.G2_HLD_COMPOSITION),
    EDA_RAW_DATA(84, StrapRelevance.IF_ADVERTISED),
    REST_HR(86, StrapRelevance.IF_ADVERTISED),
    SEC_HR_V2(87, StrapRelevance.IF_ADVERTISED),
    TODAY_ACTIVITY_EXTENDED(88, StrapRelevance.IF_ADVERTISED),
    SOLAR_INTENSITY(89, StrapRelevance.NOT_APPLICABLE),
    LIFELOAD_AUDIO(96, StrapRelevance.NOT_APPLICABLE),
    ;

    val usedByStrap: Boolean get() = strap != StrapRelevance.NOT_APPLICABLE

    companion object {
        private val byCode = entries.associateBy { it.code }
        fun fromCode(code: Int): HistoryDataType? = byCode[code]
    }
}
