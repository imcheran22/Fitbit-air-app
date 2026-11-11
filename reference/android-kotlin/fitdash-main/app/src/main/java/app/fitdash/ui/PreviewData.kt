package app.fitdash.ui

import app.fitdash.health.DayActivity
import app.fitdash.health.GenericSeries
import app.fitdash.health.HealthSnapshot
import app.fitdash.health.HourBucket
import app.fitdash.health.Workout
import app.fitdash.metrics.ExerciseType
import app.fitdash.health.Sample
import app.fitdash.health.SleepSession
import app.fitdash.health.SleepStage
import app.fitdash.health.SourceStatus
import app.fitdash.health.StageType
import app.fitdash.metrics.TodayData
import app.fitdash.metrics.Gender
import app.fitdash.metrics.Goals
import app.fitdash.metrics.buildToday
import app.fitdash.ui.today.TodayUiState
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

object PreviewData {
    private val zone = ZoneId.of("Asia/Kolkata")
    private val today = LocalDate.of(2026, 10, 11)
    private fun at(d: LocalDate, h: Int, m: Int = 0) = d.atTime(h, m).atZone(zone).toInstant()

    private val hourly = listOf(0, 0, 0, 0, 0, 0, 200, 800, 1200, 400, 300, 600, 900, 300, 200, 1100, 800, 400, 300, 0, 0, 0, 0, 0)

    private fun stagedNight(start: Instant): SleepSession {
        val plan = listOf(
            StageType.LIGHT to 20, StageType.DEEP to 40, StageType.LIGHT to 30, StageType.REM to 25, StageType.AWAKE to 10,
            StageType.LIGHT to 45, StageType.DEEP to 40, StageType.REM to 35, StageType.LIGHT to 50, StageType.REM to 37,
        )
        var t = start
        val stages = plan.map { (type, min) -> val e = t.plusSeconds(min * 60L); SleepStage(t, e, type).also { t = e } }
        return SleepSession(start, t, stages)
    }

    private val snapshot by lazy {
        val days = (0..13).map { today.minusDays(it.toLong()) }
        HealthSnapshot(
            sleep = days.map { stagedNight(at(it.minusDays(1), 23, 10)) },
            hrv = days.mapIndexed { i, d -> Sample(at(d, 5), if (i == 0) 48.0 else 40.0 + i % 5) },
            restingHr = days.mapIndexed { i, d -> Sample(at(d, 7), if (i == 0) 58.0 else 60.0 + i % 3) },
            spo2 = days.map { Sample(at(it, 4), 96.0) },
            respiratoryRate = days.map { Sample(at(it, 4), 14.5) },
            hourlySteps = hourly.mapIndexed { h, s -> HourBucket(at(today, h), s.toLong()) },
            dailyActivity = listOf(DayActivity(today, 8240, 6100.0, 2140.0)) +
                (1..27).map { DayActivity(today.minusDays(it.toLong()), if (it == 1) 5760 else 7000L + (it % 5) * 600, 4300.0 + it * 40, 1820.0 + it * 10) },
            workouts = listOf(Workout(at(today, 18), at(today, 18, 46), ExerciseType.RUNNING, distanceMeters = 5100.0, kcal = 312.0, avgHr = 148.0, maxHr = 171.0, app = "com.fitbit.FitbitMobile")) +
                (1..3).map { w -> val d = today.minusDays(w * 7L); Workout(at(d, 18), at(d, 18, 50), ExerciseType.RUNNING, distanceMeters = 5400.0, kcal = 330.0, avgHr = 150.0, maxHr = 172.0, app = "com.fitbit.FitbitMobile") },
            heightMeters = 1.75,
            weightKg = 72.4,
            heartRate = (0 until 24 * 12).map { i -> Sample(at(today, 0).plusSeconds(i * 300L), if (i < 108) 56.0 + (i % 7) else if (i in 216..225) 140.0 + (i % 9) * 3 else 72.0 + (i % 11)) }.filter { it.time.isBefore(at(today, 21, 30)) },
            generic = listOf(GenericSeries("Weight", "kg", days.reversed().mapIndexed { i, d -> Sample(at(d, 8), 72.4 - i * 0.05) })),
            sources = listOf(
                SourceStatus("Sleep", true, true, setOf("com.fitbit.FitbitMobile")),
                SourceStatus("Blood glucose", true, false, emptySet()),
                SourceStatus("Weight", false, false, emptySet()),
            ),
        )
    }

    private val goals = Goals(birthYear = today.year - 36, gender = Gender.MALE)

    fun today(hour: Int, minute: Int = 0): TodayData = buildToday(snapshot, today.atTime(hour, minute).atZone(zone), goals = goals)

    fun ready(hour: Int, minute: Int = 0): TodayUiState.Ready {
        val now = today.atTime(hour, minute).atZone(zone)
        val data = buildToday(snapshot, now, goals = goals)
        return TodayUiState.Ready(data, aiSummary(snapshot, data, now))
    }
}
