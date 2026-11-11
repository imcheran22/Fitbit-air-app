package app.fitdash.metrics

import app.fitdash.health.HealthSnapshot
import app.fitdash.settings.DayJournal
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

private val COLUMNS = listOf(
    "recovery" to (MetricKind.RECOVERY to 0),
    "sleep_score" to (MetricKind.SLEEP_SCORE to 0),
    "hours_asleep" to (MetricKind.SLEEP_HOURS to 2),
    "efficiency" to (MetricKind.EFFICIENCY to 0),
    "awakenings" to (MetricKind.AWAKENINGS to 0),
    "hrv_ms" to (MetricKind.HRV to 1),
    "resting_hr" to (MetricKind.RESTING_HR to 0),
    "steps" to (MetricKind.STEPS to 0),
    "distance_km" to (MetricKind.DISTANCE to 2),
    "calories" to (MetricKind.CALORIES to 0),
    "active_minutes" to (MetricKind.ACTIVE_MINUTES to 0),
    "water_l" to (MetricKind.WATER to 2),
)

private val ISO = DateTimeFormatter.ISO_OFFSET_DATE_TIME

fun csvField(value: String): String =
    if (value.any { it == ',' || it == '"' || it == '\n' || it == '\r' }) "\"" + value.replace("\"", "\"\"") + "\"" else value

fun dailyCsv(snapshot: HealthSnapshot, now: ZonedDateTime, goals: Goals, journal: Map<LocalDate, DayJournal>): String {
    val data = buildToday(snapshot, now, goals = goals)
    val out = StringBuilder("date,${COLUMNS.joinToString(",") { it.first }},tags\n")
    val byKind = COLUMNS.map { (_, kd) -> data.series[kd.first].orEmpty().associate { it.date to it.value } }
    for (date in generateSequence(data.date.minusDays(data.daysBack)) { it.plusDays(1) }.takeWhile { it <= data.date }) {
        out.append(date)
        COLUMNS.forEachIndexed { i, (_, kd) ->
            out.append(',')
            byKind[i][date]?.let { out.append("%.${kd.second}f".format(Locale.ENGLISH, it)) }
        }
        out.append(',')
        out.append(journal[date]?.tags.orEmpty().sorted().joinToString("|") { it.name.lowercase() })
        out.append('\n')
    }
    return out.toString()
}

fun heartRateCsv(snapshot: HealthSnapshot, zone: ZoneId): String {
    val out = StringBuilder("time,bpm\n")
    for (s in snapshot.heartRate) {
        out.append(ISO.format(s.time.atZone(zone))).append(',')
            .append("%.1f".format(Locale.ENGLISH, s.value)).append('\n')
    }
    return out.toString()
}

fun sleepStagesCsv(snapshot: HealthSnapshot, zone: ZoneId): String {
    val out = StringBuilder("start,end,stage\n")
    for (session in snapshot.sleep) {
        for (st in session.stages) {
            out.append(ISO.format(st.start.atZone(zone))).append(',')
                .append(ISO.format(st.end.atZone(zone))).append(',')
                .append(st.type.name.lowercase()).append('\n')
        }
    }
    return out.toString()
}

fun workoutsCsv(snapshot: HealthSnapshot, zone: ZoneId): String {
    val out = StringBuilder("start,end,type,title,distance_km,kcal,steps,avg_hr,max_hr,app\n")
    for (w in snapshot.workouts) {
        out.append(ISO.format(w.start.atZone(zone))).append(',')
            .append(ISO.format(w.end.atZone(zone))).append(',')
            .append(w.type).append(',')
            .append(csvField(w.title.orEmpty())).append(',')
            .append(w.distanceMeters?.let { "%.2f".format(Locale.ENGLISH, it / 1000) }.orEmpty()).append(',')
            .append(w.kcal?.let { "%.0f".format(Locale.ENGLISH, it) }.orEmpty()).append(',')
            .append(w.steps ?: "").append(',')
            .append(w.avgHr?.let { "%.0f".format(Locale.ENGLISH, it) }.orEmpty()).append(',')
            .append(w.maxHr?.let { "%.0f".format(Locale.ENGLISH, it) }.orEmpty()).append(',')
            .append(csvField(w.app)).append('\n')
    }
    return out.toString()
}

fun journalCsv(journal: Map<LocalDate, DayJournal>): String {
    val out = StringBuilder("date,tag\n")
    for ((date, day) in journal.toSortedMap()) {
        for (tag in day.tags.sorted()) out.append(date).append(',').append(tag.name.lowercase()).append('\n')
    }
    return out.toString()
}
