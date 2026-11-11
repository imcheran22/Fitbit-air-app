package app.fitdash.health

import java.time.Instant
import java.time.ZonedDateTime

// A fresh read that started at `cutoff` is laid over a cached snapshot: everything before the cutoff comes from the cache,
// everything from the cutoff on comes from the fresh read. Aggregated series (hourly steps, daily activity, water) are
// always whole-window in the fresh read, so they replace the cache outright.
fun HealthSnapshot.mergedWith(fresh: HealthSnapshot, cutoff: Instant, now: ZonedDateTime): HealthSnapshot {
    val windowStart = now.toLocalDate().minusDays(fresh.windowDays).atStartOfDay(now.zone).toInstant()
    fun <T> keep(old: List<T>, time: (T) -> Instant) = old.filter { val t = time(it); t < cutoff && !t.isBefore(windowStart) }
    fun samples(old: List<Sample>, new: List<Sample>) = keep(old) { it.time } + new.filter { !it.time.isBefore(cutoff) }
    val genericLabels = (generic.map { it.label } + fresh.generic.map { it.label }).distinct()
    val mergedGeneric = genericLabels.mapNotNull { label ->
        val old = generic.firstOrNull { it.label == label }
        val new = fresh.generic.firstOrNull { it.label == label }
        when {
            old == null -> new
            new == null -> old.copy(points = keep(old.points) { it.time }, second = keep(old.second) { it.time }).takeIf { it.points.isNotEmpty() }
            else -> GenericSeries(label, new.unit, samples(old.points, new.points), samples(old.second, new.second))
        }
    }
    val sourceByLabel = sources.associateBy { it.label }
    return fresh.copy(
        sleep = keep(sleep) { it.end } + fresh.sleep.filter { !it.end.isBefore(cutoff) },
        hrv = samples(hrv, fresh.hrv),
        restingHr = samples(restingHr, fresh.restingHr),
        heartRate = samples(heartRate, fresh.heartRate),
        spo2 = samples(spo2, fresh.spo2),
        respiratoryRate = samples(respiratoryRate, fresh.respiratoryRate),
        skinTempDelta = samples(skinTempDelta, fresh.skinTempDelta),
        workouts = keep(workouts) { it.end } + fresh.workouts.filter { !it.end.isBefore(cutoff) },
        generic = mergedGeneric,
        sources = fresh.sources.map { s ->
            val old = sourceByLabel[s.label]
            if (old == null) s else s.copy(hasData = s.hasData || old.hasData, apps = s.apps + old.apps)
        },
        estimatedRestingHrDates = emptySet(),
        heightMeters = fresh.heightMeters ?: heightMeters,
        weightKg = fresh.weightKg ?: weightKg,
    )
}

// The newest moment any wearable data reaches: tells the user whether their watch has synced.
fun HealthSnapshot.latestDataTime(): Instant? = listOfNotNull(
    heartRate.maxOfOrNull { it.time },
    hourlySteps.filter { it.steps > 0 }.maxOfOrNull { it.start },
    sleep.maxOfOrNull { it.end },
    workouts.maxOfOrNull { it.end },
    hrv.maxOfOrNull { it.time },
).maxOrNull()

// Which app to open so the wearable syncs: the one that wrote the most types, preferring wearable companions over the phone.
val SYNC_APPS = listOf("com.fitbit.FitbitMobile", "com.google.android.apps.fitness", "com.sec.android.app.shealth", "com.garmin.android.apps.connectmobile", "com.xiaomi.wearable", "com.huawei.health", "com.mc.miband1")

fun HealthSnapshot.syncApp(): String? {
    val counts = sources.flatMap { it.apps }.filter { it in SYNC_APPS }.groupingBy { it }.eachCount()
    return counts.entries.sortedWith(compareByDescending<Map.Entry<String, Int>> { it.value }.thenBy { SYNC_APPS.indexOf(it.key) }).firstOrNull()?.key
}
