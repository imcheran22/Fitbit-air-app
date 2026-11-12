package com.apex.athlete.ui.profile

import com.apex.athlete.core.analytics.strain.Sex
import com.apex.athlete.core.data.settings.UnitSystem
import com.apex.athlete.core.data.settings.UserProfile
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.roundToInt

/** Plausible ranges, in the unit the person types. Outside these a value is far more likely a typo than real. */
data class IntRange2(val min: Int, val max: Int) {
    operator fun contains(v: Double): Boolean = v >= min && v <= max
}

object ProfileLimits {
    const val MIN_AGE = 5
    const val MAX_AGE = 110 // matches UserProfile.ageOn
    val HEIGHT_CM = IntRange2(100, 250)
    val HEIGHT_IN = IntRange2(ceil(100 / CM_PER_INCH).toInt(), floor(250 / CM_PER_INCH).toInt())
    val WEIGHT_KG = IntRange2(25, 300)
    val WEIGHT_LB = IntRange2(ceil(25 * LB_PER_KG).toInt(), floor(300 * LB_PER_KG).toInt())
    val MAX_HR = IntRange2(100, 230)

    fun birthYear(currentYear: Int) = IntRange2(currentYear - MAX_AGE, currentYear - MIN_AGE)
    fun height(units: UnitSystem) = if (units == UnitSystem.IMPERIAL) HEIGHT_IN else HEIGHT_CM
    fun weight(units: UnitSystem) = if (units == UnitSystem.IMPERIAL) WEIGHT_LB else WEIGHT_KG
}

const val CM_PER_INCH = 2.54
const val LB_PER_KG = 2.2046226218

enum class BadKind { NOT_NUMBER, NOT_WHOLE, RANGE }

sealed interface Parsed<out T> {
    /** Empty input: the field is optional, so the stored value is cleared. */
    data object Blank : Parsed<Nothing>
    data class Ok<T>(val value: T) : Parsed<T>
    data class Bad(val kind: BadKind, val range: IntRange2? = null) : Parsed<Nothing>
}

private fun number(text: String): Double? =
    text.trim().replace(',', '.').toDoubleOrNull()?.takeIf { it.isFinite() }

private fun wholeNumber(text: String, range: IntRange2): Parsed<Int> {
    val t = text.trim()
    if (t.isEmpty()) return Parsed.Blank
    val d = number(t) ?: return Parsed.Bad(BadKind.NOT_NUMBER)
    if (d != floor(d)) return Parsed.Bad(BadKind.NOT_WHOLE)
    if (d !in range) return Parsed.Bad(BadKind.RANGE, range)
    return Parsed.Ok(d.toInt())
}

fun parseBirthYear(text: String, currentYear: Int): Parsed<Int> = wholeNumber(text, ProfileLimits.birthYear(currentYear))

fun parseMaxHeartRate(text: String): Parsed<Int> = wholeNumber(text, ProfileLimits.MAX_HR)

/** [text] is in the display unit (cm or inches); the result is centimetres. */
fun parseHeightCm(text: String, units: UnitSystem): Parsed<Double> {
    val t = text.trim()
    if (t.isEmpty()) return Parsed.Blank
    val range = ProfileLimits.height(units)
    val d = number(t) ?: return Parsed.Bad(BadKind.NOT_NUMBER)
    if (d !in range) return Parsed.Bad(BadKind.RANGE, range)
    return Parsed.Ok(if (units == UnitSystem.IMPERIAL) d * CM_PER_INCH else d)
}

/** [text] is in the display unit (kg or lb); the result is kilograms. */
fun parseWeightKg(text: String, units: UnitSystem): Parsed<Double> {
    val t = text.trim()
    if (t.isEmpty()) return Parsed.Blank
    val range = ProfileLimits.weight(units)
    val d = number(t) ?: return Parsed.Bad(BadKind.NOT_NUMBER)
    if (d !in range) return Parsed.Bad(BadKind.RANGE, range)
    return Parsed.Ok(if (units == UnitSystem.IMPERIAL) d / LB_PER_KG else d)
}

/** The text the person sees and edits, one string per field. */
data class ProfileInput(
    val birthYear: String = "",
    val sex: Sex = Sex.UNSPECIFIED,
    val height: String = "",
    val weight: String = "",
    val maxHeartRate: String = "",
) {
    companion object {
        fun from(profile: UserProfile, units: UnitSystem) = ProfileInput(
            birthYear = profile.birthYear?.toString().orEmpty(),
            sex = profile.sex,
            height = heightText(profile.heightCm, units),
            weight = weightText(profile.weightKg, units),
            maxHeartRate = profile.maxHeartRateOverride?.toString().orEmpty(),
        )
    }
}

private fun plain(v: Double, decimals: Int): String {
    val factor = Math.pow(10.0, decimals.toDouble())
    val r = Math.round(v * factor) / factor
    return if (r == floor(r)) r.toLong().toString() else r.toString()
}

fun heightText(cm: Double?, units: UnitSystem): String = when {
    cm == null -> ""
    units == UnitSystem.IMPERIAL -> plain(cm / CM_PER_INCH, 1)
    else -> plain(cm, 1)
}

fun weightText(kg: Double?, units: UnitSystem): String = when {
    kg == null -> ""
    units == UnitSystem.IMPERIAL -> plain(kg * LB_PER_KG, 1)
    else -> plain(kg, 1)
}

enum class ProfileField { BIRTH_YEAR, HEIGHT, WEIGHT, MAX_HEART_RATE }

/** Result of checking the form: per-field problems, and the profile to save when there are none. */
data class ProfileEvaluation(
    val errors: Map<ProfileField, Parsed.Bad>,
    val profile: UserProfile?,
    val birthYear: Parsed<Int>,
    val maxHeartRate: Parsed<Int>,
)

/**
 * Validates [input] against [original]. A field whose text still equals how [original] would be shown is kept
 * exactly as stored, so rounding for display never rewrites a value the person did not touch. The zone method
 * (not editable here) is carried over unchanged.
 */
fun evaluateProfile(original: UserProfile, input: ProfileInput, units: UnitSystem, currentYear: Int): ProfileEvaluation {
    val shown = ProfileInput.from(original, units)
    val errors = LinkedHashMap<ProfileField, Parsed.Bad>()

    val birth = parseBirthYear(input.birthYear, currentYear)
    val height = parseHeightCm(input.height, units)
    val weight = parseWeightKg(input.weight, units)
    val maxHr = parseMaxHeartRate(input.maxHeartRate)
    (birth as? Parsed.Bad)?.let { errors[ProfileField.BIRTH_YEAR] = it }
    (height as? Parsed.Bad)?.let { errors[ProfileField.HEIGHT] = it }
    (weight as? Parsed.Bad)?.let { errors[ProfileField.WEIGHT] = it }
    (maxHr as? Parsed.Bad)?.let { errors[ProfileField.MAX_HEART_RATE] = it }
    if (errors.isNotEmpty()) return ProfileEvaluation(errors, null, birth, maxHr)

    val profile = original.copy(
        birthYear = if (input.birthYear.trim() == shown.birthYear) original.birthYear else (birth as? Parsed.Ok)?.value,
        sex = input.sex,
        heightCm = if (input.height.trim() == shown.height) original.heightCm else (height as? Parsed.Ok)?.value?.roundTo1(),
        weightKg = if (input.weight.trim() == shown.weight) original.weightKg else (weight as? Parsed.Ok)?.value?.roundTo1(),
        maxHeartRateOverride = if (input.maxHeartRate.trim() == shown.maxHeartRate) original.maxHeartRateOverride else (maxHr as? Parsed.Ok)?.value,
    )
    return ProfileEvaluation(errors, profile, birth, maxHr)
}

private fun Double.roundTo1(): Double = Math.round(this * 10.0) / 10.0

/** Where the maximum heart rate shown to the person comes from. */
enum class MaxHrSource { ENTERED, AGE_ESTIMATE }

data class MaxHrInUse(val bpm: Int, val source: MaxHrSource)

/**
 * The value the strain calculation starts from, per FORMULAS.md section 3: an entered maximum wins, otherwise
 * the age prediction 208 - 0.7 x age (Tanaka 2001). The engine may use a higher recorded peak instead; this
 * shows only what the profile alone gives. Null when neither input is usable.
 */
fun maxHeartRateFromProfile(evaluation: ProfileEvaluation, currentYear: Int): MaxHrInUse? {
    (evaluation.maxHeartRate as? Parsed.Ok)?.let { return MaxHrInUse(it.value, MaxHrSource.ENTERED) }
    val birth = (evaluation.birthYear as? Parsed.Ok)?.value ?: return null
    val age = currentYear - birth
    return MaxHrInUse((208 - 0.7 * age).roundToInt(), MaxHrSource.AGE_ESTIMATE)
}

/**
 * True when the edit changes something the stored scores were computed from (age, sex, measured maximum
 * heart rate, zone method). Height and weight alone do not feed the load or recovery calculations.
 */
fun profileChangeNeedsRecompute(old: UserProfile, new: UserProfile): Boolean =
    old.birthYear != new.birthYear ||
        old.sex != new.sex ||
        old.maxHeartRateOverride != new.maxHeartRateOverride ||
        old.zoneMethod != new.zoneMethod
