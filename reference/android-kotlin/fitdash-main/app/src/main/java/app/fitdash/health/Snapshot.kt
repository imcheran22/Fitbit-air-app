package app.fitdash.health

import java.io.Serializable
import java.time.Duration
import java.time.Instant
import java.time.LocalDate

data class Sample(val time: Instant, val value: Double) : Serializable

enum class StageType { AWAKE, LIGHT, DEEP, REM, SLEEPING }

data class SleepStage(val start: Instant, val end: Instant, val type: StageType) : Serializable

data class SleepSession(val start: Instant, val end: Instant, val stages: List<SleepStage>) : Serializable

data class HourBucket(val start: Instant, val steps: Long) : Serializable

data class DayActivity(val date: LocalDate, val steps: Long, val distanceMeters: Double, val kcal: Double) : Serializable

data class Workout(
    val start: Instant,
    val end: Instant,
    val type: Int,
    val title: String? = null,
    val distanceMeters: Double? = null,
    val kcal: Double? = null,
    val steps: Long? = null,
    val avgHr: Double? = null,
    val maxHr: Double? = null,
    val app: String = "",
) : Serializable {
    val duration: Duration get() = Duration.between(start, end)
}

// `second` carries a paired reading (diastolic for blood pressure); empty for everything else.
data class GenericSeries(val label: String, val unit: String, val points: List<Sample>, val second: List<Sample> = emptyList()) : Serializable

data class SourceStatus(val label: String, val granted: Boolean, val hasData: Boolean, val apps: Set<String>) : Serializable

data class HealthSnapshot(
    val sleep: List<SleepSession> = emptyList(),
    val hrv: List<Sample> = emptyList(),
    val restingHr: List<Sample> = emptyList(),
    val heartRate: List<Sample> = emptyList(),
    val spo2: List<Sample> = emptyList(),
    val respiratoryRate: List<Sample> = emptyList(),
    val skinTempDelta: List<Sample> = emptyList(),
    val hourlySteps: List<HourBucket> = emptyList(),
    val dailyActivity: List<DayActivity> = emptyList(),
    val workouts: List<Workout> = emptyList(),
    val generic: List<GenericSeries> = emptyList(),
    val sources: List<SourceStatus> = emptyList(),
    val estimatedRestingHrDates: Set<LocalDate> = emptySet(),
    val waterDaily: Map<LocalDate, Double> = emptyMap(),
    val heightMeters: Double? = null,
    val weightKg: Double? = null,
    // How many days back the snapshot covers: 30, or 180 with the history permission.
    val windowDays: Long = 30,
) : Serializable
