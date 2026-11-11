package app.fitdash.metrics

import app.fitdash.health.HealthSnapshot
import java.time.LocalDate
import java.time.ZoneId
import java.util.Locale
import kotlin.math.roundToInt

data class Source(val title: String, val citation: String)

// What the info sheet shows: the equation, the inputs with the numbers used, where it comes from, and an optional caveat.
data class Explanation(val formula: String, val inputs: List<Pair<String, String>>, val source: Source, val note: String? = null)

data class FitnessValue<T>(val value: T, val explanation: Explanation)

data class FitnessAge(val years: Int, val realAge: Int, val vo2: Double) {
    val delta: Int get() = years - realAge
}

val JACKSON = Source("Jackson et al. 1990", "Prediction of functional aerobic capacity without exercise testing. Med Sci Sports Exerc 22(6):863–870.")

private const val REF_BMI = 25.0
private const val REF_PAR = 3

// NASA/Jackson physical activity rating 0–7, from mean weekly workout minutes over 28 days and mean steps per day.
fun paRating(weeklyWorkoutMinutes: Double, stepsPerDay: Double): Int = when {
    weeklyWorkoutMinutes >= 420 -> 7
    weeklyWorkoutMinutes >= 240 -> 6
    weeklyWorkoutMinutes >= 150 -> 5
    weeklyWorkoutMinutes >= 90 -> 4
    weeklyWorkoutMinutes > 0 && stepsPerDay >= 10_000 -> 4
    weeklyWorkoutMinutes >= 60 -> 3
    weeklyWorkoutMinutes > 0 -> 2
    stepsPerDay >= 7_000 -> 2
    stepsPerDay >= 3_000 -> 1
    else -> 0
}

fun paRatingRule(paR: Int): String = when (paR) {
    0 -> "under 3 000 steps a day, no workouts"
    1 -> "3 000–7 000 steps a day, no workouts"
    2 -> "workouts under 60 min a week, or over 7 000 steps a day"
    3 -> "workouts 60–90 min a week"
    4 -> "workouts 90–150 min a week, or 10 000+ steps with any workout"
    5 -> "workouts 150–240 min a week"
    6 -> "workouts 240–420 min a week"
    else -> "workouts over 420 min a week"
}

private fun genderTerm(g: Gender) = if (g == Gender.MALE) 1 else 0

fun jacksonVo2(age: Int, gender: Gender, bmi: Double, paR: Int): Double =
    56.363 + 1.921 * paR - 0.381 * age - 0.754 * bmi + 10.987 * genderTerm(gender)

fun fitnessAge(age: Int, gender: Gender, bmi: Double, paR: Int): FitnessValue<FitnessAge> {
    val vo2 = jacksonVo2(age, gender, bmi, paR)
    val raw = (56.363 + 1.921 * REF_PAR - 0.754 * REF_BMI + 10.987 * genderTerm(gender) - vo2) / 0.381
    val years = raw.roundToInt().coerceIn(18, 90)
    return FitnessValue(
        FitnessAge(years, age, vo2),
        Explanation(
            formula = "VO₂max = 56.363 + 1.921 × PA-R − 0.381 × age − 0.754 × BMI + 10.987 × G, G is 1 for men and 0 for women. Fitness age is the age at which someone of your gender with BMI 25 and PA-R 3 would have your VO₂max.",
            inputs = listOf(
                "Age" to age.toString(),
                "Gender" to genderLabel(gender),
                "BMI" to String.format(Locale.ENGLISH, "%.1f", bmi),
                "Activity rating" to "$paR of 7",
            ),
            source = JACKSON,
            note = "Activity rating $paR: ${paRatingRule(paR)}. Estimated VO₂max ${String.format(Locale.ENGLISH, "%.1f", vo2)} ml/kg/min.",
        ),
    )
}

val UTH = Source("Uth et al. 2004", "Estimation of VO2max from the ratio between HRmax and HRrest. Eur J Appl Physiol 91:111–115. Max HR from Tanaka et al. 2001.")
val MIFFLIN = Source("Mifflin et al. 1990", "A new predictive equation for resting energy expenditure in healthy individuals. Am J Clin Nutr 51:241–247. Activity factors are the standard Harris-Benedict multipliers.")

fun vo2Estimate(age: Int, restingHr: Double): FitnessValue<Double> {
    val maxHr = maxHrForAge(age)
    val vo2 = 15.3 * maxHr / restingHr
    return FitnessValue(
        vo2,
        Explanation(
            formula = "VO₂max = 15.3 × (max HR ÷ resting HR)",
            inputs = listOf(
                "Age" to age.toString(),
                "Max HR" to "$maxHr bpm (208 − 0.7 × age)",
                "Resting HR" to "${restingHr.roundToInt()} bpm",
            ),
            source = UTH,
            note = "Resting HR is your 28-day mean. A watch-measured VO₂max replaces this estimate when available.",
        ),
    )
}

data class Calories(val resting: Int, val daily: Int, val factor: Double)

fun activityFactor(stepsPerDay: Double): Double = when {
    stepsPerDay >= 12_500 -> 1.9
    stepsPerDay >= 10_000 -> 1.725
    stepsPerDay >= 7_500 -> 1.55
    stepsPerDay >= 5_000 -> 1.375
    else -> 1.2
}

fun calories(age: Int, gender: Gender, weightKg: Double, heightCm: Double, stepsPerDay: Double): FitnessValue<Calories> {
    val bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + if (gender == Gender.MALE) 5 else -161
    val factor = activityFactor(stepsPerDay)
    return FitnessValue(
        Calories(bmr.roundToInt(), (bmr * factor).roundToInt(), factor),
        Explanation(
            formula = "At rest = 10 × weight + 6.25 × height − 5 × age + 5 (men) or − 161 (women). Daily need = at rest × activity factor from your 7-day steps.",
            inputs = listOf(
                "Weight" to "${String.format(Locale.ENGLISH, "%.1f", weightKg)} kg",
                "Height" to "${heightCm.roundToInt()} cm",
                "Age" to age.toString(),
                "Gender" to genderLabel(gender),
                "Steps a day" to "${stepsPerDay.roundToInt()}",
                "Activity factor" to String.format(Locale.ENGLISH, "%.3f", factor).trimEnd('0'),
            ),
            source = MIFFLIN,
        ),
    )
}

val SLEEP_DEBT_SOURCE = Source("Your sleep goal", "Sum over the last 7 nights of the hours short of the goal set in Settings. A night without a recording adds nothing.")
val GABBETT = Source("Gabbett 2016", "The training–injury prevention paradox: should athletes be training smarter and harder? Br J Sports Med 50:273–280 (acute:chronic workload ratio).")

data class SleepDebt(val hours: Double, val nights: List<Double>)

fun debtLevel(hours: Double) = when {
    hours < 2 -> Status.GOOD
    hours <= 5 -> Status.BELOW_USUAL
    else -> Status.ATTENTION
}

fun sleepDebt(nightHours: List<Double?>, goalHours: Double): FitnessValue<SleepDebt> {
    val nights = nightHours.map { h -> if (h == null) 0.0 else (goalHours - h).coerceAtLeast(0.0) }
    val total = nights.sum()
    return FitnessValue(
        SleepDebt(total, nights),
        Explanation(
            formula = "Debt = Σ over 7 nights of max(0, goal − hours asleep)",
            inputs = listOf("Sleep goal" to "${String.format(Locale.ENGLISH, "%.1f", goalHours)} h") +
                nightHours.mapIndexed { i, h -> "Night ${i + 1}" to (h?.let { String.format(Locale.ENGLISH, "%.1f h", it) } ?: "no recording") },
            source = SLEEP_DEBT_SOURCE,
        ),
    )
}

enum class LoadBand { EASING, STEADY, RAMPING }

data class TrainingLoad(val ratio: Double, val acuteMinutes: Long, val chronicWeeklyMinutes: Double, val band: LoadBand)

private const val MIN_LOAD_WORKOUT_DAYS = 4

fun trainingLoad(minutesPerDay: List<Long>): FitnessValue<TrainingLoad>? {
    require(minutesPerDay.size == 28) { "28 days expected" }
    if (minutesPerDay.count { it > 0 } < MIN_LOAD_WORKOUT_DAYS) return null
    val acute = minutesPerDay.takeLast(7).sum()
    val chronicWeekly = minutesPerDay.sum() / 4.0
    if (chronicWeekly == 0.0) return null
    val ratio = acute / chronicWeekly
    val band = when {
        ratio < 0.8 -> LoadBand.EASING
        ratio <= 1.3 -> LoadBand.STEADY
        else -> LoadBand.RAMPING
    }
    return FitnessValue(
        TrainingLoad(ratio, acute, chronicWeekly, band),
        Explanation(
            formula = "Ratio = workout minutes in the last 7 days ÷ (minutes in the last 28 days ÷ 4)",
            inputs = listOf(
                "Last 7 days" to "$acute min",
                "28-day weekly mean" to "${chronicWeekly.roundToInt()} min",
            ),
            source = GABBETT,
            note = "Under 0.8 is easing off, 0.8–1.3 steady, over 1.3 ramping fast. Shown once there are four workout days in 28.",
        ),
    )
}

enum class FitnessCard { FITNESS_AGE, VO2, SLEEP_DEBT, TRAINING_LOAD, CALORIES, REGULARITY }

enum class MissingInput { GENDER, BIRTH_YEAR, HEIGHT, WEIGHT, RESTING_HR }

data class FitnessData(
    val fitnessAge: FitnessValue<FitnessAge>?,
    val fitnessAgeSeries: List<DayValue>,
    val vo2Estimate: FitnessValue<Double>?,
    val vo2Series: List<DayValue>,
    val watchVo2: Boolean,
    val calories: FitnessValue<Calories>?,
    val sleepDebt: FitnessValue<SleepDebt>,
    val trainingLoad: FitnessValue<TrainingLoad>?,
    val missing: Map<FitnessCard, MissingInput>,
)

private const val LOAD_DAYS = 28L

// Mean over the 28 days ending on `date`, of whatever `pick` returns per day; null when nothing was recorded.
private fun mean28(date: LocalDate, pick: (LocalDate) -> Double?): Double? =
    window(date, LOAD_DAYS).mapNotNull(pick).takeIf { it.isNotEmpty() }?.average()

fun fitness(snapshot: HealthSnapshot, date: LocalDate, zone: ZoneId, goals: Goals): FitnessData {
    val age = goals.age(date.year)
    val gender = goals.gender
    val bmi = snapshot.weightKg?.let { w -> snapshot.heightMeters?.let { h -> bmi(w, h) } }
    val rhrDaily = dailyLast(snapshot.restingHr, zone)
    val workoutMinutes = snapshot.workouts.groupBy { it.start.atZone(zone).toLocalDate() }.mapValues { (_, ws) -> ws.sumOf { it.duration.toMinutes() } }
    // Steps per day once, over the window plus the 28 days before it, so the per-day series does not rescan the snapshot.
    val stepsByDay: Map<LocalDate, Double?> = window(date, snapshot.windowDays + LOAD_DAYS).associateWith { stepsOn(snapshot, it, zone)?.toDouble() }
    fun stepsMean(d: LocalDate, days: Long) = window(d, days).mapNotNull { stepsByDay[it] }.takeIf { it.isNotEmpty() }?.average() ?: 0.0
    fun weeklyMinutes(d: LocalDate) = window(d, LOAD_DAYS).sumOf { workoutMinutes[it] ?: 0L } / 4.0
    fun paOn(d: LocalDate) = paRating(weeklyMinutes(d), stepsMean(d, LOAD_DAYS))
    fun rhrOn(d: LocalDate) = mean28(d) { rhrDaily[it] }

    val missing = mutableMapOf<FitnessCard, MissingInput>()
    fun need(card: FitnessCard, vararg checks: Pair<Boolean, MissingInput>): Boolean {
        val first = checks.firstOrNull { it.first }?.second ?: return true
        missing[card] = first
        return false
    }

    val ageResult = if (need(FitnessCard.FITNESS_AGE, (age == null) to MissingInput.BIRTH_YEAR, (gender == null) to MissingInput.GENDER, (snapshot.heightMeters == null) to MissingInput.HEIGHT, (snapshot.weightKg == null) to MissingInput.WEIGHT))
        fitnessAge(age!!, gender!!, bmi!!, paOn(date)) else null
    val fitnessAgeSeries = if (ageResult != null) window(date, snapshot.windowDays).map { d ->
        DayValue(d, fitnessAge(age!!, gender!!, bmi!!, paOn(d)).value.years.toDouble())
    } else emptyList()

    val watchVo2 = snapshot.generic.any { it.label == "VO₂ max" && it.points.isNotEmpty() }
    val rhr = rhrOn(date)
    val vo2 = if (!watchVo2 && need(FitnessCard.VO2, (age == null) to MissingInput.BIRTH_YEAR, (rhr == null) to MissingInput.RESTING_HR))
        vo2Estimate(age!!, rhr!!) else null
    val vo2Series = if (vo2 != null) window(date, snapshot.windowDays).mapNotNull { d -> rhrOn(d)?.let { DayValue(d, vo2Estimate(age!!, it).value) } } else emptyList()

    val calResult = if (need(FitnessCard.CALORIES, (age == null) to MissingInput.BIRTH_YEAR, (gender == null) to MissingInput.GENDER, (snapshot.heightMeters == null) to MissingInput.HEIGHT, (snapshot.weightKg == null) to MissingInput.WEIGHT))
        calories(age!!, gender!!, snapshot.weightKg!!, snapshot.heightMeters!! * 100, stepsMean(date, Tuning.WEEK_DAYS)) else null

    val nights = window(date, Tuning.WEEK_DAYS).map { d -> nightEnding(d, snapshot.sleep, zone)?.let { asleepDuration(it).seconds / 3600.0 } }
    val debt = sleepDebt(nights, goals.sleepHours)

    val load = trainingLoad(window(date, LOAD_DAYS).map { workoutMinutes[it] ?: 0L })

    return FitnessData(ageResult, fitnessAgeSeries, vo2, vo2Series, watchVo2, calResult, debt, load, missing)
}
