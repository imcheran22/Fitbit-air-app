package com.apex.athlete.core.data.takeout.parsers

import com.apex.athlete.core.data.model.WorkoutObservation
import com.apex.athlete.core.data.takeout.TakeoutClock
import com.apex.athlete.core.data.takeout.TakeoutTimestamps
import java.io.Reader
import kotlin.math.roundToInt
import kotlin.math.roundToLong

/**
 * Classic layout `exercise-N.json`: an array of activity logs with `logId`, `activityName`,
 * `startTime` (`MM/dd/yy HH:mm:ss`), `duration` and `activeDuration` (ms), `averageHeartRate`,
 * `calories`, `steps`, `distance` with `distanceUnit`, and `activeZoneMinutes.totalMinutes`
 * (UNVERIFIED).
 *
 * A log without a start or a positive duration is quarantined. Distance is stored only when its
 * unit is stated and understood. Elevation gain is not stored: the export does not say whether it
 * is in metres or feet, and a guessed unit would be a fabricated number.
 */
class ExerciseJsonParser(reader: Reader, private val clock: TakeoutClock) : TakeoutEntryParser {
    override val stats = TakeoutParseStats()
    private val json = JsonTokenReader(reader)
    private var started = false
    private var done = false

    override fun readInto(out: TakeoutRowBuffer, maxRows: Int): Boolean {
        if (done) return false
        try {
            if (!started) {
                started = true
                if (json.peek() != JsonTokenReader.Token.BEGIN_ARRAY) {
                    stats.schemaMismatch = true
                    done = true
                    return false
                }
                json.beginArray()
            }
            while (out.size < maxRows) {
                if (!json.hasNext()) {
                    done = true
                    return false
                }
                stats.rowsRead++
                val observation = json.readTree().asObject()?.let(::toObservation)
                if (observation == null) {
                    stats.quarantined++
                } else {
                    out.workouts += observation
                    stats.rowsEmitted++
                    stats.span(observation.startEpochMillis)
                    stats.span(observation.endEpochMillis)
                }
            }
            return true
        } catch (e: MalformedJsonException) {
            stats.abortedMidStream = true
            done = true
            return false
        }
    }

    private fun toObservation(log: Map<String, Any?>): WorkoutObservation? {
        val stamp = TakeoutTimestamps.parse(log.text("startTime") ?: log.text("originalStartTime")) ?: return null
        val duration = (log.number("duration") ?: log.number("originalDuration"))?.takeIf { it > 0 }?.roundToLong() ?: return null
        val start = clock.candidates(stamp)[0]
        val name = log.text("activityName")?.trim()?.take(80)?.takeIf { it.isNotEmpty() } ?: "Workout"
        val logId = log.text("logId")?.trim()?.takeIf { it.isNotEmpty() && it.length <= 40 }
        return WorkoutObservation(
            id = "takeout:exercise:" + (logId ?: start.toString()),
            startEpochMillis = start,
            endEpochMillis = start + duration,
            zoneOffsetSeconds = clock.offsetSecondsAt(start),
            exerciseType = exerciseType(name),
            displayName = name,
            activeDurationMillis = log.number("activeDuration")?.takeIf { it > 0 }?.roundToLong() ?: duration,
            averageHeartRate = log.number("averageHeartRate")?.takeIf { it > 0 }?.roundToInt(),
            caloriesKcal = log.number("calories")?.takeIf { it > 0 },
            distanceMeters = distanceMeters(log.number("distance"), log.text("distanceUnit")),
            steps = log.number("steps")?.takeIf { it > 0 }?.roundToLong(),
            activeZoneMinutes = log["activeZoneMinutes"].asObject()?.number("totalMinutes")?.takeIf { it >= 0 }?.roundToInt(),
        )
    }

    private fun distanceMeters(distance: Double?, unit: String?): Double? {
        if (distance == null || distance <= 0) return null
        return when (unit?.trim()?.lowercase()) {
            "kilometer", "kilometers", "km" -> distance * 1000.0
            "mile", "miles", "mi" -> distance * 1609.344
            "meter", "meters", "m" -> distance
            else -> null
        }
    }

    /** The app-wide type constant for the common activities, otherwise the name in upper snake case. */
    private fun exerciseType(name: String): String {
        val key = name.lowercase().replace(Regex("[^a-z0-9]+"), " ").trim()
        KNOWN_TYPES[key]?.let { return it }
        return key.replace(' ', '_').uppercase().ifEmpty { "WORKOUT" }
    }

    private companion object {
        val KNOWN_TYPES = mapOf(
            "run" to "RUNNING",
            "running" to "RUNNING",
            "treadmill" to "RUNNING_TREADMILL",
            "walk" to "WALKING",
            "walking" to "WALKING",
            "hike" to "HIKING",
            "hiking" to "HIKING",
            "bike" to "BIKING",
            "biking" to "BIKING",
            "outdoor bike" to "BIKING",
            "cycling" to "BIKING",
            "spinning" to "BIKING_STATIONARY",
            "indoor bike" to "BIKING_STATIONARY",
            "weights" to "WEIGHTLIFTING",
            "strength training" to "STRENGTH_TRAINING",
            "hiit" to "HIGH_INTENSITY_INTERVAL_TRAINING",
            "interval workout" to "HIGH_INTENSITY_INTERVAL_TRAINING",
            "yoga" to "YOGA",
            "pilates" to "PILATES",
            "elliptical" to "ELLIPTICAL",
            "rowing" to "ROWING",
            "rowing machine" to "ROWING_MACHINE",
            "stair climber" to "STAIR_CLIMBING_MACHINE",
            "stretching" to "STRETCHING",
            "dancing" to "DANCING",
        )
    }
}
