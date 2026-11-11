package com.apex.athlete.core.data.source

import com.apex.athlete.core.data.model.DailyObservation
import com.apex.athlete.core.data.model.HealthBatch
import com.apex.athlete.core.data.model.HeartRatePoint
import com.apex.athlete.core.data.model.SampleObservation
import com.apex.athlete.core.data.model.SleepObservation
import com.apex.athlete.core.data.model.SleepStageObservation
import com.apex.athlete.core.data.model.WorkoutObservation
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.domain.SleepStage
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.roundToInt
import kotlin.math.sqrt
import kotlin.random.Random

/**
 * Deterministic physiological simulator for Demo mode and end-to-end tests.
 *
 * It produces [days] days ending "now": minute heart rate with a circadian shape, staged sleep in
 * ninety-minute cycles, HRV and resting heart rate that respond to training load and short sleep,
 * a hard training block, an illness-like episode, a day with the band off, a night without sleep
 * data and a few travel days in another UTC offset. Same seed and same clock give the same data.
 *
 * Everything it emits carries [DataProvenance.SYNTHETIC_DEMO] and is only ever written to the
 * separate demo store.
 */
class DemoSource(
    private val days: Int = 60,
    private val seed: Long = 20260511L,
    private val zone: ZoneId = ZoneId.systemDefault(),
    private val nowMillis: () -> Long = System::currentTimeMillis,
) {
    private class Day(
        val index: Int,
        val date: LocalDate,
        val bandOff: Boolean,
        val noSleepData: Boolean,
        val ill: Boolean,
        val travelOffsetSeconds: Int,
        val workoutMinutes: Int,
        val workoutIntensity: Double,
        val workoutType: String,
        val workoutStartMinute: Int,
    )

    /** One batch per simulated day, oldest first. */
    fun batches(): Sequence<HealthBatch> = sequence {
        val now = nowMillis()
        val today = Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
        val rnd = Random(seed)
        val plan = plan(today, rnd)

        var fatigue = 0.0
        var previousSleepMinutes = 440
        for (d in plan) {
            val dayStart = d.date.atStartOfDay(zone).toInstant().toEpochMilli()
            val offset = zone.rules.getOffset(Instant.ofEpochMilli(dayStart)).totalSeconds + d.travelOffsetSeconds

            // Autonomic state: yesterday's load and short sleep push HRV down and resting HR up.
            val sleepPenalty = ((420 - previousSleepMinutes) / 60.0).coerceAtLeast(0.0)
            val illness = if (d.ill) 1.0 else 0.0
            val hrv = 62.0 * exp(-0.0045 * fatigue - 0.06 * sleepPenalty - 0.30 * illness + gaussian(rnd) * 0.07)
            val rhr = 52.0 + 0.045 * fatigue + 1.2 * sleepPenalty + 7.0 * illness + gaussian(rnd) * 1.0
            val resp = 14.6 + 0.004 * fatigue + 2.1 * illness + gaussian(rnd) * 0.3
            val spo2 = (96.6 - 1.2 * illness + gaussian(rnd) * 0.5).coerceAtMost(99.5)
            val skin = 0.9 * illness + gaussian(rnd) * 0.14

            // Last night's sleep (ends this morning).
            val onsetMinutesBeforeMidnight = 55 + (gaussian(rnd) * 24).roundToInt() - if (d.index % 7 == 5) 50 else 0
            val inBedMinutes = (455 + (gaussian(rnd) * 38).roundToInt() + (fatigue * 0.25).roundToInt().coerceAtMost(40))
                .coerceIn(300, 560)
            val sleepStart = dayStart - onsetMinutesBeforeMidnight * MIN
            val sleepEnd = sleepStart + inBedMinutes * MIN
            val stages = if (d.noSleepData || d.bandOff) emptyList() else hypnogram(sleepStart, inBedMinutes, rnd, d.ill)
            val sleep = if (stages.isEmpty() || sleepEnd > now) null else SleepObservation(
                id = "demo:sleep:${d.date}",
                startEpochMillis = sleepStart,
                endEpochMillis = sleepEnd,
                startZoneOffsetSeconds = offset,
                endZoneOffsetSeconds = offset,
                isMainSleep = true,
                isNap = false,
                stages = stages,
            )
            val asleepMinutes = stages.filter { it.stage.isAsleep }.sumOf { it.endEpochMillis - it.startEpochMillis } / MIN
            previousSleepMinutes = if (sleep == null) 430 else asleepMinutes.toInt()

            // Minute heart rate for the civil day, up to "now".
            val hr = ArrayList<HeartRatePoint>(1440)
            var workout: WorkoutObservation? = null
            var load = 0.0
            if (!d.bandOff) {
                val wStart = d.workoutStartMinute
                val wEnd = wStart + d.workoutMinutes
                var walkLeft = 0
                var sum = 0L
                var peak = 0
                var counted = 0
                for (m in 0 until 1440) {
                    val t = dayStart + m * MIN
                    if (t > now) break
                    val asleep = t < sleepEnd && stages.isNotEmpty()
                    val bpm: Double = when {
                        asleep -> rhr - 1.5 + 2.5 * cos(2 * PI * (t - sleepStart) / (90.0 * MIN)) + gaussian(rnd) * 1.2
                        d.workoutMinutes > 0 && m in wStart until wEnd -> {
                            val p = (m - wStart).toDouble() / d.workoutMinutes
                            val ramp = when {
                                p < 0.12 -> p / 0.12
                                p > 0.9 -> (1 - p) / 0.1
                                else -> 1.0
                            }
                            val target = rhr + (HR_MAX - rhr) * d.workoutIntensity
                            rhr + 25 + (target - rhr - 25) * ramp + gaussian(rnd) * 3.0 + 5 * cos(p * 9 * PI)
                        }
                        else -> {
                            if (walkLeft == 0 && rnd.nextDouble() < 0.012) walkLeft = rnd.nextInt(6, 22)
                            val circadian = 4.0 * cos(2 * PI * (m - 15 * 60) / 1440.0)
                            val base = rhr + 14 + circadian + if (d.ill) 6 else 0
                            if (walkLeft > 0) {
                                walkLeft--
                                base + 22 + gaussian(rnd) * 4
                            } else base + gaussian(rnd) * 2.5
                        }
                    }
                    val v = bpm.roundToInt().coerceIn(38, 198)
                    hr += HeartRatePoint(t, v)
                    if (d.workoutMinutes > 0 && m in wStart until wEnd) {
                        sum += v
                        counted++
                        if (v > peak) peak = v
                        val x = ((v - rhr) / (HR_MAX - rhr)).coerceIn(0.0, 1.0)
                        load += x * 0.75 * exp(1.8 * x)
                    }
                }
                if (d.workoutMinutes > 0 && counted == d.workoutMinutes) {
                    val start = dayStart + wStart * MIN
                    val distance = if (d.workoutType == "RUNNING") d.workoutMinutes * (150.0 + 60 * d.workoutIntensity) else null
                    workout = WorkoutObservation(
                        id = "demo:workout:${d.date}",
                        startEpochMillis = start,
                        endEpochMillis = start + d.workoutMinutes * MIN,
                        zoneOffsetSeconds = offset,
                        exerciseType = d.workoutType,
                        displayName = displayName(d.workoutType),
                        activeDurationMillis = d.workoutMinutes * MIN,
                        averageHeartRate = (sum / counted).toInt(),
                        maxHeartRate = peak,
                        caloriesKcal = d.workoutMinutes * (6.0 + 8.0 * d.workoutIntensity),
                        distanceMeters = distance,
                    )
                }
            }
            fatigue = fatigue * 0.72 + load * 0.55

            val day = d.date.toEpochDay()
            val daily = ArrayList<DailyObservation>()
            val samples = ArrayList<SampleObservation>()
            if (sleep != null) {
                daily += DailyObservation(MetricType.HRV_RMSSD, day, round1(hrv), resolutionSeconds = 300)
                daily += DailyObservation(MetricType.RESTING_HEART_RATE, day, rhr.roundToInt().toDouble())
                daily += DailyObservation(MetricType.RESPIRATORY_RATE, day, round1(resp))
                daily += DailyObservation(MetricType.SPO2_AVG, day, round1(spo2))
                daily += DailyObservation(MetricType.SKIN_TEMP_DEVIATION, day, round1(skin))
                // Five-minute HRV readings across the night around the nightly value.
                var t = sleepStart + 20 * MIN
                while (t < sleepEnd - 10 * MIN) {
                    samples += SampleObservation(MetricType.HRV_RMSSD, t, round1(hrv * exp(gaussian(rnd) * 0.18)))
                    t += 5 * MIN
                }
            }
            if (!d.bandOff && dayStart + 1439 * MIN <= now) {
                val steps = 5200 + rnd.nextInt(0, 4200) + d.workoutMinutes * 95
                daily += DailyObservation(MetricType.STEPS, day, steps.toDouble())
                daily += DailyObservation(MetricType.CALORIES_TOTAL, day, 2050.0 + steps * 0.045 + d.workoutMinutes * 7.5)
            }
            if (d.index % 3 == 0 && !d.bandOff) {
                daily += DailyObservation(MetricType.VO2_MAX, day, round1(46.2 + d.index * 0.02))
            }

            yield(
                HealthBatch(
                    provenance = DataProvenance.SYNTHETIC_DEMO,
                    heartRate = hr,
                    daily = daily,
                    samples = samples,
                    sleeps = listOfNotNull(sleep),
                    workouts = listOfNotNull(workout),
                ),
            )
        }
    }

    private fun plan(today: LocalDate, rnd: Random): List<Day> = (0 until days).map { i ->
        val date = today.minusDays((days - 1 - i).toLong())
        val fromEnd = days - 1 - i
        val weekday = date.dayOfWeek.value // 1 = Monday
        val inHardBlock = fromEnd in 26..33
        val ill = fromEnd in 11..13
        val bandOff = fromEnd == 19
        val rest = weekday == 5 || (weekday == 1 && !inHardBlock) || ill || fromEnd in 10..10
        val long = weekday == 7
        val minutes = when {
            rest || bandOff -> 0
            long -> 78 + rnd.nextInt(0, 20)
            inHardBlock -> 58 + rnd.nextInt(0, 18)
            else -> 36 + rnd.nextInt(0, 22)
        }
        val intensity = when {
            minutes == 0 -> 0.0
            inHardBlock -> 0.74 + rnd.nextDouble() * 0.10
            long -> 0.60 + rnd.nextDouble() * 0.06
            weekday == 3 -> 0.78 + rnd.nextDouble() * 0.08
            else -> 0.58 + rnd.nextDouble() * 0.12
        }
        Day(
            index = i,
            date = date,
            bandOff = bandOff,
            noSleepData = fromEnd == 34,
            ill = ill,
            travelOffsetSeconds = if (fromEnd in 40..43) -3 * 3600 else 0,
            workoutMinutes = minutes,
            workoutIntensity = intensity,
            workoutType = when (weekday) {
                2, 4 -> "STRENGTH_TRAINING"
                6 -> "BIKING"
                else -> "RUNNING"
            },
            // Evening sessions on weekdays, morning at weekends; today's is early so it has happened.
            workoutStartMinute = if (fromEnd == 0) 6 * 60 + 40 else if (weekday >= 6) 9 * 60 + 15 else 18 * 60 + 10,
        )
    }

    /** Ninety-minute cycles: light, deep (more early), light, REM (more late), with brief awakenings. */
    private fun hypnogram(start: Long, inBedMinutes: Int, rnd: Random, restless: Boolean): List<SleepStageObservation> {
        val out = ArrayList<SleepStageObservation>()
        var t = start
        val end = start + inBedMinutes * MIN
        fun add(stage: SleepStage, minutes: Int) {
            if (minutes <= 0 || t >= end) return
            val e = minOf(end, t + minutes * MIN)
            out += SleepStageObservation(t, e, stage)
            t = e
        }
        add(SleepStage.AWAKE, 6 + rnd.nextInt(0, 12))
        var cycle = 0
        while (t < end - 12 * MIN) {
            val deep = (34 - cycle * 8 + rnd.nextInt(-4, 5)).coerceAtLeast(if (cycle < 3) 8 else 0)
            val rem = (12 + cycle * 7 + rnd.nextInt(-3, 4)).coerceAtMost(38)
            add(SleepStage.LIGHT, 18 + rnd.nextInt(0, 10))
            add(SleepStage.DEEP, deep)
            add(SleepStage.LIGHT, 14 + rnd.nextInt(0, 12))
            add(SleepStage.REM, rem)
            if (rnd.nextDouble() < (if (restless) 0.8 else 0.45)) add(SleepStage.AWAKE, 2 + rnd.nextInt(0, if (restless) 12 else 6))
            cycle++
        }
        add(SleepStage.LIGHT, ((end - t) / MIN).toInt() - 4)
        add(SleepStage.AWAKE, ((end - t) / MIN).toInt())
        return out
    }

    private fun displayName(type: String) = when (type) {
        "RUNNING" -> "Run"
        "BIKING" -> "Ride"
        "STRENGTH_TRAINING" -> "Strength training"
        else -> "Workout"
    }

    /** Standard normal via Box-Muller on the seeded generator. */
    private fun gaussian(rnd: Random): Double {
        val u = rnd.nextDouble().coerceAtLeast(1e-12)
        return sqrt(-2.0 * ln(u)) * cos(2 * PI * rnd.nextDouble())
    }

    private fun round1(v: Double) = (v * 10).roundToInt() / 10.0

    private companion object {
        const val MIN = 60_000L
        const val HR_MAX = 186.0
    }
}
