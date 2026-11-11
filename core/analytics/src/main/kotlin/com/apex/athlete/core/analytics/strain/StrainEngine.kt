package com.apex.athlete.core.analytics.strain

import com.apex.athlete.core.domain.DataProvenance
import kotlin.math.exp
import kotlin.math.ln

/**
 * Cardiovascular strain for a day or a workout.
 *
 * @property strain 0.0–21.0, logarithmic in TRIMP.
 * @property trimp accumulated Banister TRIMP behind the score.
 * @property minutesByZone minutes in each heart-rate zone (all recorded minutes, including rest).
 * @property loadMinutes minutes that counted towards TRIMP (at or above the reserve floor).
 * @property recordedMinutes minutes of heart-rate data the calculation saw. A low value on a
 *   full day means the tracker was off the wrist or not yet synced, and the score is a lower bound.
 */
data class StrainResult(
    val strain: Double,
    val trimp: Double,
    val minutesByZone: Map<HeartRateZone, Double>,
    val loadMinutes: Double,
    val recordedMinutes: Double,
    val provenance: DataProvenance = DataProvenance.MATHEMATICALLY_DERIVED,
) {
    /** Share of training-zone time (zones 1–5) spent in each zone, as fractions summing to 1. */
    val intensityDistribution: Map<HeartRateZone, Double>
        get() {
            val zones = minutesByZone.filterKeys { it != HeartRateZone.BELOW_ZONES }
            val total = zones.values.sum()
            return if (total <= 0.0) zones.mapValues { 0.0 } else zones.mapValues { it.value / total }
        }

    companion object {
        /** Label shown wherever the number appears: it is this app's metric, not another vendor's. */
        const val LABEL = "DERIVED CARDIO STRAIN (0–21 SCALE)"
    }
}

/**
 * Maps accumulated TRIMP onto a 0–21 scale:
 *
 *   strain = 21 · ln(1 + TRIMP / k) / ln(1 + TRIMP_ceiling / k),  capped at 21
 *
 * The logarithm makes each additional point harder to earn than the last, the way perceived
 * exertion behaves: with the defaults an easy 30-minute jog lands near 6, a hard hour near 14,
 * and a marathon-sized day near 20. k and the ceiling are calibration constants, not physiology;
 * they only set where on the scale typical days fall.
 */
class StrainEngine(private val config: Config = Config()) {

    data class Config(
        val reserveFloor: Double = Trimp.DEFAULT_RESERVE_FLOOR,
        /** k: TRIMP at which the curve starts to bend. */
        val trimpScale: Double = 20.0,
        /** TRIMP that maps to the top of the scale. */
        val trimpCeiling: Double = 600.0,
        val maxStrain: Double = 21.0,
        val zoneMethod: ZoneMethod = ZoneMethod.PERCENT_OF_MAX_HEART_RATE,
    ) {
        init {
            require(trimpScale > 0 && trimpCeiling > 0 && maxStrain > 0) { "scale constants must be > 0" }
        }
    }

    fun evaluate(samples: List<HeartRateSample>, profile: CardioProfile): StrainResult {
        val zones = HeartRateZoneModel.of(profile, config.zoneMethod)
        val minutesByZone = HeartRateZone.entries.associateWith { 0.0 }.toMutableMap()
        var trimp = 0.0
        var loadMinutes = 0.0
        var recorded = 0.0

        for (s in samples) {
            if (s.durationMinutes <= 0 || !s.bpm.isFinite() || s.bpm <= 0) continue
            recorded += s.durationMinutes
            val zone = zones.zoneFor(s.bpm)
            minutesByZone[zone] = minutesByZone.getValue(zone) + s.durationMinutes
            val perMinute = Trimp.perMinute(s.bpm, profile, config.reserveFloor)
            if (perMinute > 0) {
                trimp += perMinute * s.durationMinutes
                loadMinutes += s.durationMinutes
            }
        }

        return StrainResult(
            strain = strainFromTrimp(trimp),
            trimp = trimp,
            minutesByZone = minutesByZone,
            loadMinutes = loadMinutes,
            recordedMinutes = recorded,
        )
    }

    fun strainFromTrimp(trimp: Double): Double {
        if (trimp <= 0) return 0.0
        val s = config.maxStrain * ln(1 + trimp / config.trimpScale) / ln(1 + config.trimpCeiling / config.trimpScale)
        return s.coerceIn(0.0, config.maxStrain)
    }

    /** Inverse of [strainFromTrimp]: the TRIMP needed to reach a given strain. */
    fun trimpFromStrain(strain: Double): Double {
        val s = strain.coerceIn(0.0, config.maxStrain)
        return config.trimpScale * (exp(s / config.maxStrain * ln(1 + config.trimpCeiling / config.trimpScale)) - 1)
    }
}
