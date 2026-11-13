package com.apex.athlete.ui.recorder

import com.apex.athlete.ble.StrapState
import com.apex.athlete.core.analytics.strain.CardioProfile
import com.apex.athlete.core.analytics.strain.HeartRateZone
import com.apex.athlete.core.analytics.strain.HeartRateZoneModel
import com.apex.athlete.recorder.RecorderFormat
import com.apex.athlete.recorder.RecorderMapping
import com.apex.athlete.recorder.RecorderPhase
import com.apex.athlete.recorder.RecorderSession

/** What the recorder screen draws; pure data so the mapping is tested on the JVM. */
internal data class RecorderUi(
    val phase: RecorderPhase?,
    val elapsedText: String,
    val bpm: Int?,
    /** 0 = below zone 1, 1..5 = zone, null = no heart rate or unknown maximum. */
    val zone: Int?,
    val zonesAvailable: Boolean,
    val averageBpm: Int?,
    val maxBpm: Int?,
    val strap: StrapState,
    val demo: Boolean,
    val savable: Boolean,
)

internal object RecorderUiMapper {
    fun map(
        session: RecorderSession?,
        nowMillis: Long,
        liveBpm: Int?,
        strap: StrapState,
        maxHeartRate: Double?,
        demo: Boolean,
    ): RecorderUi {
        val model = maxHeartRate?.takeIf { it > 61.0 }?.let { HeartRateZoneModel.of(CardioProfile(restingHeartRate = 60.0, maxHeartRate = it)) }
        val running = session?.phase == RecorderPhase.RUNNING || session?.phase == RecorderPhase.PAUSED
        // The live strap value is shown only while a strap is connected; a dropped strap shows no number.
        val bpm = liveBpm?.takeIf { strap is StrapState.Connected }
        val zone = if (model != null && bpm != null) {
            val z = model.zoneFor(bpm.toDouble())
            if (z == HeartRateZone.BELOW_ZONES) 0 else z.number
        } else null
        return RecorderUi(
            phase = session?.phase,
            elapsedText = RecorderFormat.clock(session?.elapsedMillis(nowMillis) ?: 0L),
            bpm = bpm,
            zone = zone,
            zonesAvailable = model != null,
            averageBpm = session?.averageBpm,
            maxBpm = session?.hrMaxBpm,
            strap = strap,
            demo = demo,
            savable = session != null && !running && RecorderMapping.isSavable(session),
        )
    }
}
