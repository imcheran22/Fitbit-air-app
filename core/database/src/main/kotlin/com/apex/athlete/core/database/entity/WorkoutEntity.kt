package com.apex.athlete.core.database.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import com.apex.athlete.core.domain.DataProvenance

/** One recorded exercise session. */
@Entity(
    tableName = "workout",
    indices = [Index("epochDay"), Index("startEpochMillis")],
)
data class WorkoutEntity(
    /** Source-scoped identifier, e.g. "ghealth:<data point name>" or "hc:<record id>". */
    @PrimaryKey val id: String,
    val startEpochMillis: Long,
    val endEpochMillis: Long,
    val zoneOffsetSeconds: Int,
    /** Local calendar day on which the workout started. */
    val epochDay: Long,
    /** Source's exercise type constant, e.g. "RUNNING". */
    val exerciseType: String,
    val displayName: String,
    /** Duration excluding pauses. */
    val activeDurationMillis: Long,
    val averageHeartRate: Int? = null,
    val maxHeartRate: Int? = null,
    val caloriesKcal: Double? = null,
    val distanceMeters: Double? = null,
    val steps: Long? = null,
    val elevationGainMeters: Double? = null,
    val activeZoneMinutes: Int? = null,
    /** Minutes in the source's own heart-rate zones, kept as reported. */
    val sourceLightZoneMinutes: Double? = null,
    val sourceModerateZoneMinutes: Double? = null,
    val sourceVigorousZoneMinutes: Double? = null,
    val sourcePeakZoneMinutes: Double? = null,
    val hasGps: Boolean = false,
    /** Banister TRIMP computed by this app from the minute heart rate during the workout. */
    val derivedTrimp: Double? = null,
    /** 0–21 strain computed by this app for the workout alone. */
    val derivedStrain: Double? = null,
    /** Session rating of perceived exertion (Borg CR10, 1-10) typed in by the user; schema v2. */
    val perceivedExertion: Int? = null,
    /** Provenance of the session record itself; the two derived columns are always computed here. */
    val provenance: DataProvenance,
    val updatedAtEpochMillis: Long,
)
