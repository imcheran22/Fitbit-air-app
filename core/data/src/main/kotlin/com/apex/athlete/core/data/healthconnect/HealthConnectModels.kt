package com.apex.athlete.core.data.healthconnect

/*
 * SDK-free intermediate shapes. The thin wrapper around the Health Connect client converts SDK
 * records into these; [HealthConnectMapper] turns them into observations. Nothing in here touches
 * the Android SDK, so everything downstream is plain JVM code that can be unit-tested.
 */

/** A kind of Health Connect record Apex reads. Read only; Apex never writes any of them. */
enum class HcFamily {
    HEART_RATE, RESTING_HEART_RATE, HRV_RMSSD, SLEEP, OXYGEN_SATURATION, RESPIRATORY_RATE,
    SKIN_TEMPERATURE, STEPS, EXERCISE, TOTAL_CALORIES, VO2_MAX, FLOORS, DISTANCE,
}

enum class HcSdkStatus { AVAILABLE, UNAVAILABLE, UPDATE_REQUIRED }

/** Optional platform features that gate records or permissions. */
enum class HcFeature { SKIN_TEMPERATURE, READ_HEALTH_DATA_HISTORY, READ_HEALTH_DATA_IN_BACKGROUND }

sealed interface HcRecord {
    /** Package name of the app that wrote the record (the data origin). */
    val origin: String
}

data class HcHrSample(val epochMillis: Long, val bpm: Long)

data class HcHeartRateRecord(override val origin: String, val samples: List<HcHrSample>) : HcRecord

/** A single reading at an instant: resting HR (bpm), HRV RMSSD (ms), SpO2 (%), breaths/min, VO2 max. */
data class HcInstantRecord(
    val family: HcFamily,
    override val origin: String,
    val epochMillis: Long,
    /** Null when the writer did not record an offset; the mapper then uses the device zone. */
    val offsetSeconds: Int?,
    val value: Double,
) : HcRecord

/** A total over an interval: steps (count), total calories (kcal), floors, distance (metres). */
data class HcIntervalRecord(
    val family: HcFamily,
    override val origin: String,
    val startEpochMillis: Long,
    val endEpochMillis: Long,
    val startOffsetSeconds: Int?,
    val endOffsetSeconds: Int?,
    val value: Double,
) : HcRecord

/** [type] is the raw platform stage constant; unknown values are tolerated by the mapper. */
data class HcSleepStage(val startEpochMillis: Long, val endEpochMillis: Long, val type: Int)

data class HcSleepRecord(
    val id: String,
    override val origin: String,
    val startEpochMillis: Long,
    val endEpochMillis: Long,
    val startOffsetSeconds: Int?,
    val endOffsetSeconds: Int?,
    val stages: List<HcSleepStage>,
) : HcRecord

data class HcExerciseRecord(
    val id: String,
    override val origin: String,
    val startEpochMillis: Long,
    val endEpochMillis: Long,
    val startOffsetSeconds: Int?,
    /** Upper-case name such as RUNNING; OTHER_WORKOUT when the platform type is not one we name. */
    val type: String,
    val title: String?,
) : HcRecord

data class HcTimedValue(val epochMillis: Long, val value: Double)

/** Skin temperature for a night: deltas in degrees Celsius against the device's baseline. */
data class HcSkinTempRecord(
    override val origin: String,
    val startEpochMillis: Long,
    val endEpochMillis: Long,
    val startOffsetSeconds: Int?,
    val endOffsetSeconds: Int?,
    val baselineCelsius: Double?,
    val deltasCelsius: List<HcTimedValue>,
) : HcRecord

data class HcPage(val records: List<HcRecord>, val nextPageToken: String?)

data class HcChangesPage(
    /** Records that were inserted or updated since the token was issued. */
    val upserted: List<HcRecord>,
    val deletedCount: Int,
    val nextToken: String,
    val hasMore: Boolean,
    val tokenExpired: Boolean,
)
