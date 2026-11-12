package com.apex.athlete.ui.onboarding

import com.apex.athlete.core.analytics.baseline.BaselineSpec
import com.apex.athlete.core.analytics.load.TrainingLoadEngine
import com.apex.athlete.core.analytics.sleep.SleepNeedCalculator
import com.apex.athlete.core.analytics.strain.Sex
import com.apex.athlete.core.analytics.strain.ZoneMethod

/** The screens of first-run setup, in order. The route owns these; the host only sees the route. */
enum class OnboardingStep { WELCOME, PROFILE, SOURCES, NOTIFICATIONS, CALIBRATION }

/** Which data sources the owner has connected or chosen. At least one is needed to leave [OnboardingStep.SOURCES]. */
data class SourceStatus(
    val googleConnected: Boolean = false,
    val healthConnectReadable: Boolean = false,
    val takeoutChosen: Boolean = false,
) {
    val anyChosen: Boolean get() = googleConnected || healthConnectReadable || takeoutChosen
}

/** Pure step state machine: no Android types, so it is unit tested on the JVM. */
object OnboardingSteps {
    val first: OnboardingStep = OnboardingStep.WELCOME
    val last: OnboardingStep = OnboardingStep.CALIBRATION

    /** Steps that show a progress header (the welcome screen does not). */
    val counted: List<OnboardingStep> = OnboardingStep.entries.filter { it != OnboardingStep.WELCOME }

    /** Restores a saved step name; anything unknown starts again at the welcome screen. */
    fun parse(name: String?): OnboardingStep = OnboardingStep.entries.firstOrNull { it.name == name } ?: first

    /** True when "Continue" may be used on [step]. */
    fun canAdvance(step: OnboardingStep, profileValid: Boolean, sources: SourceStatus): Boolean = when (step) {
        OnboardingStep.WELCOME -> true
        OnboardingStep.PROFILE -> profileValid
        OnboardingStep.SOURCES -> sources.anyChosen
        OnboardingStep.NOTIFICATIONS -> true
        OnboardingStep.CALIBRATION -> false
    }

    /** The step after [step], or null when blocked or already at the end. */
    fun next(step: OnboardingStep, profileValid: Boolean, sources: SourceStatus): OnboardingStep? {
        if (!canAdvance(step, profileValid, sources)) return null
        return OnboardingStep.entries.getOrNull(step.ordinal + 1)
    }

    /** Only the profile and notifications steps can be skipped. Sources need at least one choice. */
    fun canSkip(step: OnboardingStep): Boolean =
        step == OnboardingStep.PROFILE || step == OnboardingStep.NOTIFICATIONS

    fun skip(step: OnboardingStep): OnboardingStep? =
        if (canSkip(step)) OnboardingStep.entries.getOrNull(step.ordinal + 1) else null

    fun back(step: OnboardingStep): OnboardingStep? = OnboardingStep.entries.getOrNull(step.ordinal - 1)

    /** Setup is finished only from the last step. */
    fun canFinish(step: OnboardingStep): Boolean = step == last

    /** 1-based position among [counted] steps, or null for the welcome screen. */
    fun position(step: OnboardingStep): Int? = counted.indexOf(step).takeIf { it >= 0 }?.plus(1)
}

/** Text as typed. Blank means "not given": missing stays missing. */
data class ProfileDraft(
    val birthYear: String = "",
    val sex: Sex = Sex.UNSPECIFIED,
    val heightCm: String = "",
    val weightKg: String = "",
    val maxHeartRate: String = "",
    val zoneMethod: ZoneMethod = ZoneMethod.PERCENT_OF_MAX_HEART_RATE,
)

enum class ProfileField { BIRTH_YEAR, HEIGHT, WEIGHT, MAX_HEART_RATE }

/** Parsed values. Every field is null when left blank. */
data class ProfileValues(
    val birthYear: Int?,
    val sex: Sex,
    val heightCm: Double?,
    val weightKg: Double?,
    val maxHeartRate: Int?,
    val zoneMethod: ZoneMethod,
)

data class ProfileValidation(val values: ProfileValues?, val errors: Set<ProfileField>) {
    val isValid: Boolean get() = errors.isEmpty()
}

object ProfileRules {
    /** Age range the analytics accept (see MaxHeartRate.agePredicted and UserProfile.ageOn). */
    const val MIN_AGE = 5
    const val MAX_AGE = 110
    const val MIN_HEIGHT_CM = 100.0
    const val MAX_HEIGHT_CM = 250.0
    const val MIN_WEIGHT_KG = 30.0
    const val MAX_WEIGHT_KG = 300.0

    /** Same bounds MaxHeartRate.resolve accepts for a user-set value. */
    const val MIN_MAX_HR = 100
    const val MAX_MAX_HR = 240

    fun minBirthYear(currentYear: Int) = currentYear - MAX_AGE
    fun maxBirthYear(currentYear: Int) = currentYear - MIN_AGE

    private fun number(text: String): Double? =
        text.trim().replace(',', '.').toDoubleOrNull()?.takeIf { it.isFinite() }

    private fun whole(text: String): Int? = text.trim().toIntOrNull()

    fun validate(draft: ProfileDraft, currentYear: Int): ProfileValidation {
        val errors = linkedSetOf<ProfileField>()

        val birthYear = draft.birthYear.takeIf { it.isNotBlank() }?.let { text ->
            whole(text)?.takeIf { it in minBirthYear(currentYear)..maxBirthYear(currentYear) }
                ?: run { errors += ProfileField.BIRTH_YEAR; null }
        }
        val height = draft.heightCm.takeIf { it.isNotBlank() }?.let { text ->
            number(text)?.takeIf { it in MIN_HEIGHT_CM..MAX_HEIGHT_CM }
                ?: run { errors += ProfileField.HEIGHT; null }
        }
        val weight = draft.weightKg.takeIf { it.isNotBlank() }?.let { text ->
            number(text)?.takeIf { it in MIN_WEIGHT_KG..MAX_WEIGHT_KG }
                ?: run { errors += ProfileField.WEIGHT; null }
        }
        val maxHr = draft.maxHeartRate.takeIf { it.isNotBlank() }?.let { text ->
            whole(text)?.takeIf { it in MIN_MAX_HR..MAX_MAX_HR }
                ?: run { errors += ProfileField.MAX_HEART_RATE; null }
        }
        val values = if (errors.isEmpty()) {
            ProfileValues(birthYear, draft.sex, height, weight, maxHr, draft.zoneMethod)
        } else {
            null
        }
        return ProfileValidation(values, errors)
    }
}

/** Calibration lengths, read from the engines' own defaults so this copy cannot drift from the maths. */
data class CalibrationWindows(
    /** Valid days of a personal baseline before recovery signals are scored. */
    val baselineMinDays: Int,
    /** Length of the trailing baseline window. */
    val baselineWindowDays: Int,
    /** Nights before sleep need uses the personal base. */
    val sleepNeedNights: Int,
    /** Days of history before the workload ratio is shown. */
    val workloadDays: Int,
) {
    companion object {
        fun fromEngines(): CalibrationWindows {
            val baseline = BaselineSpec()
            return CalibrationWindows(
                baselineMinDays = baseline.minValidDays,
                baselineWindowDays = baseline.windowDays,
                sleepNeedNights = SleepNeedCalculator.Config().minNightsForPersonalBase,
                workloadDays = TrainingLoadEngine.Config().minDaysForRatio,
            )
        }
    }
}
