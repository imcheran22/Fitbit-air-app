package com.apex.athlete.core.analytics.strain

import kotlin.math.exp

/**
 * Banister's training impulse (TRIMP) on the heart-rate reserve.
 *
 *   ΔHR      = (HR − HRrest) / (HRmax − HRrest), limited to 0..1
 *   TRIMP/min = ΔHR · a · e^(b·ΔHR)
 *
 * with a = 0.64, b = 1.92 for men and a = 0.86, b = 1.67 for women (Banister 1991; Morton,
 * Fitz-Clarke & Banister 1990).
 * When sex is not specified the two weightings are averaged. The exponential mirrors the rise of
 * blood lactate with intensity, so a minute near maximum counts several times a minute of easy
 * effort.
 *
 * Minutes below [DEFAULT_RESERVE_FLOOR] of the reserve are ignored: sitting, standing and slow
 * walking are not training load, and counting sixteen waking hours of them would swamp the signal.
 * The floor is an Apex calibration choice (Banister's TRIMP was defined for exercise sessions, not
 * for a whole day of wrist data). At the floor per-minute TRIMP jumps from 0 to 0.34 (men) or
 * 0.43 (women), so daily TRIMP stays non-decreasing in heart rate but is not continuous.
 */
object Trimp {

    const val DEFAULT_RESERVE_FLOOR = 0.30

    private const val MALE_A = 0.64
    private const val MALE_B = 1.92
    private const val FEMALE_A = 0.86
    private const val FEMALE_B = 1.67

    /** Fraction of heart-rate reserve in use at [bpm], limited to 0..1. */
    fun reserveFraction(bpm: Double, profile: CardioProfile): Double =
        ((bpm - profile.restingHeartRate) / profile.heartRateReserve).coerceIn(0.0, 1.0)

    /** The intensity weighting a · e^(b·ΔHR). */
    fun intensityWeight(reserveFraction: Double, sex: Sex): Double {
        val male = MALE_A * exp(MALE_B * reserveFraction)
        val female = FEMALE_A * exp(FEMALE_B * reserveFraction)
        return when (sex) {
            Sex.MALE -> male
            Sex.FEMALE -> female
            Sex.UNSPECIFIED -> (male + female) / 2
        }
    }

    /** TRIMP earned per minute at a steady [bpm]; zero below the reserve floor. */
    fun perMinute(bpm: Double, profile: CardioProfile, reserveFloor: Double = DEFAULT_RESERVE_FLOOR): Double {
        val x = reserveFraction(bpm, profile)
        if (x < reserveFloor) return 0.0
        return x * intensityWeight(x, profile.sex)
    }

    fun total(
        samples: Iterable<HeartRateSample>,
        profile: CardioProfile,
        reserveFloor: Double = DEFAULT_RESERVE_FLOOR,
    ): Double {
        var sum = 0.0
        for (s in samples) {
            if (s.durationMinutes.isFinite() && s.durationMinutes > 0 && s.bpm.isFinite()) {
                sum += s.durationMinutes * perMinute(s.bpm, profile, reserveFloor)
            }
        }
        return sum
    }
}
