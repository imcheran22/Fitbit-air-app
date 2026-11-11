package app.fitdash.metrics

import app.fitdash.health.HealthSnapshot
import app.fitdash.health.Workout
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

// Exercise types from ExerciseSessionRecord.EXERCISE_TYPE_*, kept here so the metrics layer stays free of Health Connect classes.
object ExerciseType {
    const val OTHER = 0
    const val BADMINTON = 2
    const val BASEBALL = 4
    const val BASKETBALL = 5
    const val BIKING = 8
    const val BIKING_STATIONARY = 9
    const val BOOT_CAMP = 10
    const val BOXING = 11
    const val CALISTHENICS = 13
    const val CRICKET = 14
    const val DANCING = 16
    const val ELLIPTICAL = 25
    const val EXERCISE_CLASS = 26
    const val FENCING = 27
    const val FOOTBALL_AMERICAN = 28
    const val FOOTBALL_AUSTRALIAN = 29
    const val FRISBEE_DISC = 31
    const val GOLF = 32
    const val GUIDED_BREATHING = 33
    const val GYMNASTICS = 34
    const val HANDBALL = 35
    const val HIIT = 36
    const val HIKING = 37
    const val ICE_HOCKEY = 38
    const val ICE_SKATING = 39
    const val MARTIAL_ARTS = 44
    const val PADDLING = 46
    const val PARAGLIDING = 47
    const val PILATES = 48
    const val RACQUETBALL = 50
    const val ROCK_CLIMBING = 51
    const val ROLLER_HOCKEY = 52
    const val ROWING = 53
    const val ROWING_MACHINE = 54
    const val RUGBY = 55
    const val RUNNING = 56
    const val RUNNING_TREADMILL = 57
    const val SAILING = 58
    const val SCUBA_DIVING = 59
    const val SKATING = 60
    const val SKIING = 61
    const val SNOWBOARDING = 62
    const val SNOWSHOEING = 63
    const val SOCCER = 64
    const val SOFTBALL = 65
    const val SQUASH = 66
    const val STAIR_CLIMBING = 68
    const val STAIR_CLIMBING_MACHINE = 69
    const val STRENGTH_TRAINING = 70
    const val STRETCHING = 71
    const val SURFING = 72
    const val SWIMMING_OPEN_WATER = 73
    const val SWIMMING_POOL = 74
    const val TABLE_TENNIS = 75
    const val TENNIS = 76
    const val VOLLEYBALL = 78
    const val WALKING = 79
    const val WATER_POLO = 80
    const val WEIGHTLIFTING = 81
    const val WHEELCHAIR = 82
    const val YOGA = 83
}

enum class WorkoutIcon { RUN, BIKE, SWIM, STRENGTH, YOGA, WALK, GENERIC }

val FOOT_SPORTS = setOf(ExerciseType.RUNNING, ExerciseType.RUNNING_TREADMILL, ExerciseType.WALKING, ExerciseType.HIKING)

fun workoutIcon(type: Int): WorkoutIcon = when (type) {
    ExerciseType.RUNNING, ExerciseType.RUNNING_TREADMILL -> WorkoutIcon.RUN
    ExerciseType.WALKING, ExerciseType.HIKING, ExerciseType.SNOWSHOEING -> WorkoutIcon.WALK
    ExerciseType.BIKING, ExerciseType.BIKING_STATIONARY -> WorkoutIcon.BIKE
    ExerciseType.SWIMMING_OPEN_WATER, ExerciseType.SWIMMING_POOL, ExerciseType.WATER_POLO, ExerciseType.SCUBA_DIVING -> WorkoutIcon.SWIM
    ExerciseType.STRENGTH_TRAINING, ExerciseType.WEIGHTLIFTING, ExerciseType.CALISTHENICS, ExerciseType.HIIT, ExerciseType.BOOT_CAMP -> WorkoutIcon.STRENGTH
    ExerciseType.YOGA, ExerciseType.PILATES, ExerciseType.STRETCHING, ExerciseType.GUIDED_BREATHING -> WorkoutIcon.YOGA
    else -> WorkoutIcon.GENERIC
}

// Share of [aStart, aEnd) that lies inside [bStart, bEnd), 0..1. Instant records (aStart == aEnd) count fully when inside.
fun overlapFraction(aStart: Instant, aEnd: Instant, bStart: Instant, bEnd: Instant): Double {
    if (aEnd < aStart) return 0.0
    if (aStart == aEnd) return if (!aStart.isBefore(bStart) && !aStart.isAfter(bEnd)) 1.0 else 0.0
    val s = maxOf(aStart, bStart)
    val e = minOf(aEnd, bEnd)
    if (!e.isAfter(s)) return 0.0
    return Duration.between(s, e).toMillis().toDouble() / Duration.between(aStart, aEnd).toMillis()
}

fun workoutsOn(snapshot: HealthSnapshot, date: LocalDate, zone: ZoneId): List<Workout> =
    snapshot.workouts.filter { it.start.atZone(zone).toLocalDate() == date }.sortedBy { it.start }

// Minutes covered by the union of the sessions, so two overlapping records do not count twice.
fun activeMinutes(workouts: List<Workout>): Long {
    var total = 0L
    var curStart: Instant? = null
    var curEnd: Instant? = null
    for (w in workouts.sortedBy { it.start }) {
        if (curEnd == null || w.start.isAfter(curEnd)) {
            if (curStart != null && curEnd != null) total += Duration.between(curStart, curEnd).toMinutes()
            curStart = w.start
            curEnd = w.end
        } else if (w.end.isAfter(curEnd)) {
            curEnd = w.end
        }
    }
    if (curStart != null && curEnd != null) total += Duration.between(curStart, curEnd).toMinutes()
    return total
}

data class WeekWorkouts(val count: Int, val minutes: Long)

fun weekWorkouts(snapshot: HealthSnapshot, date: LocalDate, zone: ZoneId): WeekWorkouts {
    val from = date.minusDays(Tuning.WEEK_DAYS - 1)
    val list = snapshot.workouts.filter { it.start.atZone(zone).toLocalDate() in from..date }
    return WeekWorkouts(list.size, list.sumOf { it.duration.toMinutes() })
}

// Seconds per kilometre, only for foot sports with a distance.
fun paceSecondsPerKm(workout: Workout): Double? {
    val d = workout.distanceMeters ?: return null
    if (workout.type !in FOOT_SPORTS || d < 100) return null
    return workout.duration.seconds / (d / 1000.0)
}
