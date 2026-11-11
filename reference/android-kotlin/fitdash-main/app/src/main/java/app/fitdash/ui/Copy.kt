package app.fitdash.ui

import app.fitdash.health.SourceStatus
import app.fitdash.health.Workout
import app.fitdash.metrics.ExerciseType
import app.fitdash.metrics.Band
import app.fitdash.metrics.BmiBand
import app.fitdash.metrics.Component
import app.fitdash.metrics.FitnessCard
import app.fitdash.metrics.LoadBand
import app.fitdash.metrics.MissingInput
import app.fitdash.metrics.RegularityBand
import app.fitdash.metrics.Good
import app.fitdash.metrics.HeartSummary
import app.fitdash.metrics.MIN_TAGGED_DAYS
import app.fitdash.metrics.MIN_TAG_DAYS
import app.fitdash.metrics.MetricKind
import app.fitdash.metrics.RangeStatus
import app.fitdash.metrics.ReadinessResult
import app.fitdash.metrics.Regularity
import app.fitdash.metrics.SleepSummary
import app.fitdash.metrics.Status
import app.fitdash.metrics.Suggestion
import app.fitdash.metrics.SuggestionKind
import app.fitdash.metrics.Tuning
import app.fitdash.metrics.rangeStatus
import app.fitdash.ui.components.ScoreChip
import java.text.BreakIterator
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlin.math.roundToLong

fun bandWord(band: Band) = when (band) {
    Band.RECOVER -> "Recover"
    Band.STEADY -> "Steady"
    Band.PRIMED -> "Primed"
}

fun bandAdvice(band: Band) = when (band) {
    Band.RECOVER -> "Your body's asking for rest. Keep it light today."
    Band.STEADY -> "A normal day. Moderate effort is fine."
    Band.PRIMED -> "Slept well and recovered. Good day to push."
}

private val COMPONENT_NAMES = mapOf(Component.HRV to "HRV", Component.RESTING_HR to "resting HR", Component.SLEEP to "sleep")

fun basedOn(used: Set<Component>): String? =
    if (used.size == Component.entries.size) null
    else "Based on " + Component.entries.filter { it in used }.joinToString(" + ") { COMPONENT_NAMES.getValue(it) }

fun formatDuration(d: Duration): String {
    val h = d.toHours()
    val m = d.toMinutes() % 60
    return if (h == 0L) "${m}m" else "${h}h ${m}m"
}

fun formatSteps(n: Long): String = String.format(Locale.ENGLISH, "%,d", n)

fun formatLiters(v: Double): String = String.format(Locale.ENGLISH, "%.2f", v).trimEnd('0').trimEnd('.')

fun formatBmi(v: Double): String = String.format(Locale.ENGLISH, "%.1f", v)

fun bmiWord(band: BmiBand) = when (band) {
    BmiBand.UNDER -> "UNDERWEIGHT"
    BmiBand.HEALTHY -> "HEALTHY"
    BmiBand.OVER -> "OVERWEIGHT"
    BmiBand.OBESE -> "OBESE"
}

fun formatHeight(cm: Int, miles: Boolean): String {
    if (!miles) return "$cm cm"
    val inches = (cm / 2.54).roundToInt()
    return "${inches / 12} ft ${inches % 12} in"
}

fun formatNumber(v: Double): String =
    if (abs(v - v.roundToLong()) < 0.05) v.roundToLong().toString() else String.format(Locale.ENGLISH, "%.1f", v)

private val DATE = DateTimeFormatter.ofPattern("EEE '·' d MMM", Locale.ENGLISH)

fun formatDate(d: LocalDate): String = DATE.format(d)

fun daysOfData(n: Int): String = if (n == 1) "1 day of data" else "$n days of data"

private val APP_NAMES = mapOf(
    "com.fitbit.FitbitMobile" to "Fitbit",
    "com.google.android.apps.fitness" to "Google Fit",
    "com.google.android.apps.healthdata" to "Health Connect",
    "com.sec.android.app.shealth" to "Samsung Health",
    "com.garmin.android.apps.connectmobile" to "Garmin Connect",
    "com.xiaomi.wearable" to "Mi Fitness",
    "com.huawei.health" to "Huawei Health",
    "com.mc.miband1" to "Notify for Mi Band",
)

fun sourceAppName(pkg: String): String = APP_NAMES[pkg] ?: if (pkg.startsWith("com.android.healthconnect.phone")) "Phone" else pkg

fun sourceLine(s: SourceStatus): String = when {
    !s.granted -> "no access"
    !s.hasData -> "no data"
    else -> "✓ " + s.apps.map(::sourceAppName).distinct().joinToString(", ")
}

private fun joinNames(names: List<String>): String = when (names.size) {
    0 -> ""
    1 -> names[0]
    else -> names.dropLast(1).joinToString(", ") + " and " + names.last()
}

// Packages that write to Health Connect but are not a watch or a tracker app: the system, and fitdash's own water and height.
private fun notAWearable(pkg: String) = pkg == "android" || pkg.startsWith("app.fitdash")

// The apps writing anything to Health Connect, by display name. Phone and Health Connect itself are not watches, so they are left out.
fun writerNames(sources: List<SourceStatus>): List<String> =
    sources.filter { it.hasData }.flatMap { it.apps }.filterNot(::notAWearable).map(::sourceAppName).distinct()
        .filter { it != "Phone" && it != "Health Connect" }.sorted()

// "Heart rate" → "heart rate", but "SpO₂" and "VO₂ max" keep their capitals.
private fun inSentence(label: String): String =
    if (label.drop(1).none { it.isUpperCase() }) label.replaceFirstChar { it.lowercase() } else label

// Why a type shows nothing: either access is off, or nothing has written it. Null when it has data.
fun missingReason(s: SourceStatus, writers: List<String>): String? = when {
    !s.granted -> "Access is off. Turn it on in Health Connect › App permissions › fitdash."
    s.hasData -> null
    writers.isEmpty() -> "No app has written this to Health Connect yet."
    else -> "${joinNames(writers)} ${if (writers.size == 1) "hasn't" else "haven't"} written any ${inSentence(s.label)} to Health Connect."
}

// Recovery leans on HRV and resting heart rate; when either never arrives, say which and from whom instead of only counting nights.
fun missingRecoveryLine(sources: List<SourceStatus>): String? {
    fun find(label: String) = sources.firstOrNull { it.label == label }
    val hrv = find("Heart rate variability")
    val rhr = find("Resting heart rate")
    val noHrv = hrv != null && !hrv.hasData
    val noRhr = rhr != null && !rhr.hasData
    if (!noHrv && !noRhr) return null
    if ((noHrv && hrv?.granted == false) || (noRhr && rhr?.granted == false)) {
        val off = listOfNotNull("HRV".takeIf { noHrv && hrv?.granted == false }, "resting heart rate".takeIf { noRhr && rhr?.granted == false })
        return "Allow ${joinNames(off)} in Health Connect so recovery can use ${if (off.size == 1) "it" else "them"}."
    }
    val who = joinNames(writerNames(sources)).ifEmpty { "Your watch" }
    val be = if (writerNames(sources).size > 1) "aren't" else "isn't"
    return when {
        noHrv && noRhr -> "$who $be sharing HRV or resting heart rate with Health Connect, so recovery uses sleep only."
        noHrv -> "$who $be sharing HRV with Health Connect, so recovery uses resting heart rate and sleep."
        else -> "$who $be sharing resting heart rate with Health Connect, so recovery uses HRV and sleep."
    }
}

fun suggestionText(s: Suggestion): String = when (s.kind) {
    SuggestionKind.HARD_WORKOUT -> "Good day for a hard workout."
    SuggestionKind.MODERATE -> "Moderate effort today. Keep workouts under an hour."
    SuggestionKind.REST -> "Rest or an easy walk today."
    SuggestionKind.EARLIER_BED -> "Get to bed 30 minutes earlier tonight."
    SuggestionKind.EASY_ON_STIMULANTS -> "Go easy on caffeine and alcohol today."
    SuggestionKind.WALK ->
        if (s.stepsLeft <= Tuning.WALK_15_MIN_STEPS) "${formatSteps(s.stepsLeft)} steps to go. A 15-minute walk does it."
        else "${formatSteps(s.stepsLeft)} steps to go before bed."
}

fun rangeNote(value: Double, range: ClosedFloatingPointRange<Double>?, good: Good): String {
    if (range == null) return "building your range"
    val above = value > range.endInclusive
    return when (rangeStatus(value, range, good)) {
        RangeStatus.IN -> "in your normal range"
        RangeStatus.GOOD_SIDE -> if (above) "above your range · good" else "below your range · good"
        RangeStatus.BAD_SIDE -> if (above) "above your normal range" else "below your normal range"
    }
}

fun sleepWord(score: Int) = when {
    score >= 85 -> "Restful"
    score >= 70 -> "Good"
    score >= 50 -> "Fair"
    else -> "Short night"
}

fun recoveryChips(r: ReadinessResult.Ready, heart: HeartSummary?, sleep: SleepSummary?): List<ScoreChip> {
    val chips = mutableListOf<ScoreChip>()
    for (c in Component.entries) {
        val part = r.parts[c] ?: continue
        val (value, base, kind) = when (c) {
            Component.HRV -> Triple(heart?.hrv, heart?.hrvBaseline, MetricKind.HRV)
            Component.RESTING_HR -> Triple(heart?.restingHr, heart?.restingHrBaseline, MetricKind.RESTING_HR)
            Component.SLEEP -> Triple(sleep?.score?.toDouble(), null, MetricKind.SLEEP_SCORE)
        }
        if (value == null) continue
        val n = value.roundToInt()
        val word = when {
            c == Component.SLEEP -> sleepWord(n).lowercase()
            base == null || abs(value / base - 1) <= 0.05 -> "usual"
            value > base -> "above usual"
            else -> "below usual"
        }
        val name = when (c) {
            Component.HRV -> "HRV $n ms"
            Component.RESTING_HR -> "Resting HR $n"
            Component.SLEEP -> "Sleep $n"
        }
        val status = when {
            part < 50 -> Status.ATTENTION
            part < 65 -> Status.BELOW_USUAL
            else -> Status.GOOD
        }
        chips += ScoreChip("$name · $word", status, kind)
    }
    return chips
}

fun sleepChips(night: SleepSummary, goalHours: Double): List<ScoreChip> {
    val parts = night.parts
    val rows = if (parts == null) {
        listOf(Triple("Duration only", minOf(night.asleep.seconds / 3600.0 / goalHours, 1.0), MetricKind.SLEEP_HOURS))
    } else {
        listOf(
            Triple("Duration", parts.duration to Tuning.SLEEP_W_DURATION.toInt(), MetricKind.SLEEP_HOURS),
            Triple("Efficiency", parts.efficiency to Tuning.SLEEP_W_EFFICIENCY.toInt(), MetricKind.EFFICIENCY),
            Triple("Restoration", parts.restoration to Tuning.SLEEP_W_RESTORATION.toInt(), MetricKind.DEEP),
            Triple("Restfulness", parts.restfulness to Tuning.SLEEP_W_RESTFULNESS.toInt(), MetricKind.AWAKENINGS),
        ).map { (name, score, kind) -> Triple("$name ${score.first} of ${score.second}", score.first.toDouble() / score.second, kind) }
    }
    return rows.map { (label, share, kind) ->
        ScoreChip(label, if (share >= 0.8) Status.GOOD else if (share >= 0.5) Status.BELOW_USUAL else Status.ATTENTION, kind)
    }
}

fun regularityChips(r: Regularity): List<ScoreChip> {
    val chips = mutableListOf<ScoreChip>()
    for ((name, spread) in listOf("Bedtime" to r.bedtimeSpreadMin, "Wake" to r.wakeSpreadMin)) {
        if (spread == null) continue
        val status = if (spread > 60) Status.ATTENTION else if (spread > 30) Status.BELOW_USUAL else Status.GOOD
        chips += ScoreChip("$name ± $spread min", status)
    }
    return chips
}

fun greeting(hour: Int, name: String? = null): String {
    val hello = when (hour) {
        in 4..11 -> "Good morning"
        in 12..16 -> "Good afternoon"
        else -> "Good evening"
    }
    return if (name.isNullOrBlank()) hello else "$hello, ${name.trim()}!"
}

fun initial(name: String): String {
    val trimmed = name.trim()
    val breaks = BreakIterator.getCharacterInstance()
    breaks.setText(trimmed)
    return trimmed.substring(0, breaks.next().coerceAtLeast(0)).uppercase()
}

fun streakLine(days: Int): String? = if (days >= 3) "$days days in a row" else null

private val CLOCK = DateTimeFormatter.ofPattern("HH:mm", Locale.ENGLISH)
private val CLOCK_12 = DateTimeFormatter.ofPattern("h:mm a", Locale.ENGLISH)

fun formatTime12(t: Instant, zone: ZoneId): String = CLOCK_12.format(t.atZone(zone))

fun bedtimeLine(debtHours: Double, target: LocalTime?, clock24: Boolean): String? {
    if (target == null) return null
    val time = formatTime(target, clock24)
    return if (debtHours > 1) "Aim for bed by $time tonight" else "Bedtime target $time"
}

fun formatTime(t: Instant, zone: ZoneId, clock24: Boolean): String = formatTime(t.atZone(zone).toLocalTime(), clock24)

fun formatTime(t: LocalTime, clock24: Boolean): String = (if (clock24) CLOCK else CLOCK_12).format(t)

// A whole number with its sign, using a true minus.
fun formatSigned(n: Int): String = "${if (n < 0) "−" else "+"}${abs(n)}"

// The user's settings, for composables that format times, units or decide what to show.
val LocalPrefs = androidx.compose.runtime.staticCompositionLocalOf { app.fitdash.settings.Settings() }

@androidx.compose.runtime.Composable
@androidx.compose.runtime.ReadOnlyComposable
fun clock(t: Instant, zone: ZoneId): String = formatTime(t, zone, LocalPrefs.current.clock24)

fun formatWeight(kg: Double, lb: Boolean): String = if (lb) "${formatNumber(kg * 2.20462)} lb" else "${formatNumber(kg)} kg"

// Delta temperatures scale only; absolute ones also shift.
fun formatTempDelta(c: Double, f: Boolean): String = formatNumber(if (f) c * 1.8 else c)
fun formatTemp(c: Double, f: Boolean): String = formatNumber(if (f) c * 1.8 + 32 else c)

fun formatClock(t: Instant, zone: ZoneId): String = CLOCK.format(t.atZone(zone))

fun dayLetter(d: LocalDate): String = d.dayOfWeek.getDisplayName(TextStyle.NARROW, Locale.ENGLISH)

fun metricName(kind: MetricKind) = when (kind) {
    MetricKind.RECOVERY -> "Recovery"
    MetricKind.SLEEP_SCORE -> "Sleep score"
    MetricKind.SLEEP_HOURS -> "Sleep"
    MetricKind.DEEP -> "Deep sleep"
    MetricKind.REM -> "REM sleep"
    MetricKind.LIGHT -> "Light sleep"
    MetricKind.AWAKE -> "Awake"
    MetricKind.EFFICIENCY -> "Sleep efficiency"
    MetricKind.AWAKENINGS -> "Awakenings"
    MetricKind.RESTING_HR -> "Resting heart rate"
    MetricKind.HRV -> "HRV"
    MetricKind.HEART_RATE -> "Heart rate"
    MetricKind.SPO2 -> "SpO₂"
    MetricKind.RESPIRATORY -> "Respiratory rate"
    MetricKind.SKIN_TEMP -> "Skin temperature"
    MetricKind.STEPS -> "Steps"
    MetricKind.DISTANCE -> "Distance"
    MetricKind.CALORIES -> "Calories"
    MetricKind.ACTIVE_MINUTES -> "Active minutes"
    MetricKind.WATER -> "Water"
    MetricKind.BMI -> "BMI"
}

fun metricExplain(kind: MetricKind) = when (kind) {
    MetricKind.RECOVERY -> "A 0 to 100 blend of your HRV, resting heart rate and sleep compared with your own recent normal."
    MetricKind.SLEEP_SCORE -> "Half from time asleep against your goal. The rest from efficiency, deep and REM share, and how restless the night was. Without sleep stages it is duration alone."
    MetricKind.SLEEP_HOURS -> "Time actually asleep, not counting time spent awake in bed."
    MetricKind.DEEP -> "The slowest, heaviest stage of sleep, in minutes per night."
    MetricKind.REM -> "The stage where most dreaming happens, in minutes per night."
    MetricKind.LIGHT -> "The lighter stage that makes up most of a typical night, in minutes."
    MetricKind.AWAKE -> "Minutes you were awake during the night after first falling asleep."
    MetricKind.EFFICIENCY -> "The share of your time in bed that you were actually asleep. Above 85% is typical for a good night."
    MetricKind.AWAKENINGS -> "How many times you woke after first falling asleep. A couple a night is normal."
    MetricKind.HEART_RATE -> "Your heart rate through the day. The line is 5-minute averages from your wearable."
    MetricKind.RESTING_HR -> "Your heart rate at full rest, usually lowest during sleep. Lower than your normal is generally a good sign."
    MetricKind.HRV -> "The small variation in time between heartbeats. Higher than your normal is generally a good sign."
    MetricKind.SPO2 -> "The share of oxygen your blood is carrying, as measured by your wearable overnight."
    MetricKind.RESPIRATORY -> "How many breaths you take per minute while you sleep."
    MetricKind.SKIN_TEMP -> "How far your skin temperature sat from your own usual level overnight."
    MetricKind.STEPS -> "Steps counted across the day, compared with your daily goal."
    MetricKind.DISTANCE -> "How far you covered on foot during the day."
    MetricKind.CALORIES -> "Energy burned across the day, as reported by your tracker."
    MetricKind.ACTIVE_MINUTES -> "Minutes spent in recorded workouts, compared with your daily goal."
    MetricKind.WATER -> "Water you have logged for the day, compared with your daily goal."
    MetricKind.BMI -> "Your weight divided by your height squared. A general guide only, and it does not describe your health."
}

const val GENERIC_EXPLAIN = "The daily average of this reading from Health Connect."

fun workoutName(type: Int): String = when (type) {
    ExerciseType.RUNNING -> "Running"
    ExerciseType.RUNNING_TREADMILL -> "Treadmill"
    ExerciseType.WALKING -> "Walking"
    ExerciseType.HIKING -> "Hiking"
    ExerciseType.BIKING -> "Cycling"
    ExerciseType.BIKING_STATIONARY -> "Indoor cycling"
    ExerciseType.SWIMMING_POOL -> "Swimming"
    ExerciseType.SWIMMING_OPEN_WATER -> "Open water swim"
    ExerciseType.STRENGTH_TRAINING -> "Strength"
    ExerciseType.WEIGHTLIFTING -> "Weightlifting"
    ExerciseType.HIIT -> "HIIT"
    ExerciseType.BOOT_CAMP -> "Boot camp"
    ExerciseType.YOGA -> "Yoga"
    ExerciseType.PILATES -> "Pilates"
    ExerciseType.STRETCHING -> "Stretching"
    ExerciseType.GUIDED_BREATHING -> "Breathing"
    ExerciseType.ELLIPTICAL -> "Elliptical"
    ExerciseType.ROWING -> "Rowing"
    ExerciseType.ROWING_MACHINE -> "Rowing machine"
    ExerciseType.STAIR_CLIMBING, ExerciseType.STAIR_CLIMBING_MACHINE -> "Stair climbing"
    ExerciseType.DANCING -> "Dancing"
    ExerciseType.SOCCER -> "Football"
    ExerciseType.FOOTBALL_AMERICAN -> "American football"
    ExerciseType.FOOTBALL_AUSTRALIAN -> "Australian football"
    ExerciseType.BASKETBALL -> "Basketball"
    ExerciseType.TENNIS -> "Tennis"
    ExerciseType.TABLE_TENNIS -> "Table tennis"
    ExerciseType.BADMINTON -> "Badminton"
    ExerciseType.SQUASH -> "Squash"
    ExerciseType.RACQUETBALL -> "Racquetball"
    ExerciseType.VOLLEYBALL -> "Volleyball"
    ExerciseType.CRICKET -> "Cricket"
    ExerciseType.BASEBALL -> "Baseball"
    ExerciseType.SOFTBALL -> "Softball"
    ExerciseType.RUGBY -> "Rugby"
    ExerciseType.HANDBALL -> "Handball"
    ExerciseType.ICE_HOCKEY -> "Ice hockey"
    ExerciseType.ROLLER_HOCKEY -> "Roller hockey"
    ExerciseType.BOXING -> "Boxing"
    ExerciseType.MARTIAL_ARTS -> "Martial arts"
    ExerciseType.FENCING -> "Fencing"
    ExerciseType.GYMNASTICS -> "Gymnastics"
    ExerciseType.CALISTHENICS -> "Calisthenics"
    ExerciseType.EXERCISE_CLASS -> "Exercise class"
    ExerciseType.SKIING -> "Skiing"
    ExerciseType.SNOWBOARDING -> "Snowboarding"
    ExerciseType.SNOWSHOEING -> "Snowshoeing"
    ExerciseType.SKATING, ExerciseType.ICE_SKATING -> "Skating"
    ExerciseType.ROCK_CLIMBING -> "Climbing"
    ExerciseType.GOLF -> "Golf"
    ExerciseType.PADDLING -> "Paddling"
    ExerciseType.SAILING -> "Sailing"
    ExerciseType.SURFING -> "Surfing"
    ExerciseType.SCUBA_DIVING -> "Scuba diving"
    ExerciseType.WATER_POLO -> "Water polo"
    ExerciseType.PARAGLIDING -> "Paragliding"
    ExerciseType.FRISBEE_DISC -> "Frisbee"
    ExerciseType.WHEELCHAIR -> "Wheelchair"
    else -> "Workout"
}

// The session's own title when it says more than the type, else the type name.
fun workoutTitle(w: Workout): String {
    val name = workoutName(w.type)
    val t = w.title ?: return name
    return if (t.equals(name, ignoreCase = true) || t.equals("Workout", ignoreCase = true)) name else t
}

fun formatKm(km: Double, miles: Boolean): String =
    if (miles) "${formatNumber(km * 0.621371)} mi" else "${formatNumber(km)} km"

// "5:12 /km" or "8:22 /mi".
fun formatPace(secondsPerKm: Double, miles: Boolean): String {
    val perUnit = if (miles) secondsPerKm / 0.621371 else secondsPerKm
    val total = perUnit.roundToInt()
    return String.format(Locale.ENGLISH, "%d:%02d /%s", total / 60, total % 60, if (miles) "mi" else "km")
}

// "32m · 5.1 km · 7:12 AM": distance when present, else calories, else just the time.
fun workoutLine(w: Workout, zone: ZoneId, miles: Boolean, clock24: Boolean = false): String {
    val extra = w.distanceMeters?.let { formatKm(it / 1000, miles) } ?: w.kcal?.let { "${formatSteps(it.roundToLong())} kcal" }
    return listOfNotNull(formatDuration(w.duration), extra, formatTime(w.start, zone, clock24)).joinToString(" · ")
}

fun formatBloodPressure(systolic: Double, diastolic: Double): String = "${systolic.roundToInt()}/${diastolic.roundToInt()}"

const val GITHUB_REPO_URL = "https://github.com/mayurrawte/fitdash"

// A GitHub "new issue" link with the title, label and a body that carries only device and version facts, never health data.
fun issueUrl(bug: Boolean, version: String, device: String, android: String): String {
    val title = if (bug) "Bug: " else "Feature request: "
    val body = buildString {
        if (bug) {
            append("**What happened**\n\n\n**What I expected**\n\n\n**Steps to reproduce**\n1. \n2. \n\n")
        } else {
            append("**What would you like fitdash to do?**\n\n\n**Why it would help**\n\n\n")
        }
        append("---\nfitdash $version · $device · Android $android\n")
    }
    fun enc(v: String) = java.net.URLEncoder.encode(v, "UTF-8").replace("+", "%20")
    return "$GITHUB_REPO_URL/issues/new?title=${enc(title)}&labels=${if (bug) "bug" else "enhancement"}&body=${enc(body)}"
}

// "DATA UP TO 9:43 PM" / "DATA UP TO YESTERDAY 11:10 PM" / "DATA UP TO 9 OCT".
fun dataUpTo(latest: Instant, now: ZonedDateTime, clock24: Boolean): String {
    val z = latest.atZone(now.zone)
    val today = now.toLocalDate()
    return when (z.toLocalDate()) {
        today -> "Data up to ${formatTime(latest, now.zone, clock24)}"
        today.minusDays(1) -> "Data up to yesterday ${formatTime(latest, now.zone, clock24)}"
        else -> "Data up to ${DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH).format(z)}"
    }
}

// The wearable has not written for a while: suggest a sync.
fun syncStale(latest: Instant?, now: ZonedDateTime): Boolean = latest == null || Duration.between(latest, now.toInstant()) > Duration.ofHours(Tuning.SYNC_STALE_HOURS)

const val NOT_MEDICAL = "General guide, not medical advice."

fun fitnessAgeWord(delta: Int): String = when {
    delta == 0 -> "matches your age"
    delta < 0 -> "${-delta} ${if (delta == -1) "year" else "years"} younger"
    else -> "$delta ${if (delta == 1) "year" else "years"} older"
}

fun loadWord(band: LoadBand): String = when (band) {
    LoadBand.EASING -> "easing off"
    LoadBand.STEADY -> "steady"
    LoadBand.RAMPING -> "ramping fast"
}

fun missingWord(m: MissingInput): String = when (m) {
    MissingInput.GENDER -> "Add gender in Settings"
    MissingInput.BIRTH_YEAR -> "Add age in Settings"
    MissingInput.HEIGHT -> "Add height in Settings"
    MissingInput.WEIGHT -> "Needs a weight in Health Connect"
    MissingInput.RESTING_HR -> "Needs resting heart rate"
}

fun fitnessCardName(card: FitnessCard): String = when (card) {
    FitnessCard.FITNESS_AGE -> "Fitness age"
    FitnessCard.VO2 -> "VO₂ max est."
    FitnessCard.SLEEP_DEBT -> "Sleep debt"
    FitnessCard.TRAINING_LOAD -> "Training load"
    FitnessCard.CALORIES -> "Resting kcal"
    FitnessCard.REGULARITY -> "Sleep regularity"
}

fun formatHoursShort(h: Double): String = if (h == 0.0) "0 h" else String.format(Locale.ENGLISH, "%.1f h", h)

fun regularityWord(band: RegularityBand): String = when (band) {
    RegularityBand.VERY_REGULAR -> "very regular"
    RegularityBand.REGULAR -> "regular"
    RegularityBand.VARIES -> "varies"
    RegularityBand.IRREGULAR -> "irregular"
}

const val BASELINE_LINE = "Compared with your own last 30 days, not with other people."

fun morningReadout(asleep: Duration?, heart: HeartSummary?, suggestion: Suggestion?): String? {
    val rhr = heart?.restingHr?.let { v -> heart.restingHrRange?.let { rangeStatus(v, it, Good.LOWER) } }
    val hrv = heart?.hrv?.let { v -> heart.hrvRange?.let { rangeStatus(v, it, Good.HIGHER) } }
    // Say the vital that is out of its range; when neither is, resting heart rate.
    val vital = when {
        hrv != null && hrv != RangeStatus.IN && rhr == RangeStatus.IN -> hrvLine(hrv)
        rhr != null -> when (rhr) {
            RangeStatus.IN -> "Resting heart rate in your normal range."
            RangeStatus.GOOD_SIDE -> "Resting heart rate a little lower than your usual."
            RangeStatus.BAD_SIDE -> "Resting heart rate higher than your usual."
        }
        hrv != null -> hrvLine(hrv)
        else -> null
    }
    return listOfNotNull(asleep?.let { "Slept ${formatDuration(it)}." }, vital, suggestion?.let(::suggestionText)).joinToString(" ").ifEmpty { null }
}

private fun hrvLine(status: RangeStatus) = when (status) {
    RangeStatus.IN -> "HRV in your normal range."
    RangeStatus.GOOD_SIDE -> "HRV higher than your usual."
    RangeStatus.BAD_SIDE -> "HRV lower than your usual."
}

fun insightsEmpty(taggedDays: Int): String =
    if (taggedDays < MIN_TAGGED_DAYS) "Tag $MIN_TAGGED_DAYS days to see patterns · $taggedDays so far"
    else "Keep tagging: a tag needs $MIN_TAG_DAYS days with it and $MIN_TAG_DAYS without"
