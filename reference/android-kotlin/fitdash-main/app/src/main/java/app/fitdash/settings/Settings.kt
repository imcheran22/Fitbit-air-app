package app.fitdash.settings

import android.content.Context
import app.fitdash.metrics.Gender
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.time.LocalDate
import java.time.LocalTime
import kotlin.math.roundToInt

enum class ThemeChoice { SYSTEM, LIGHT, DARK }

data class Settings(
    val stepGoal: Int = 9000,
    val sleepHours: Double = 8.0,
    val miles: Boolean = false,
    val waterGoalMl: Int = 2500,
    val heightCm: Int? = null,
    val activeGoal: Int = 30,
    val clock24: Boolean = false,
    val weightLb: Boolean = false,
    val fahrenheit: Boolean = false,
    val reduceMotion: Boolean = false,
    val haptics: Boolean = true,
    val showWorkouts: Boolean = true,
    val showHeartRate: Boolean = true,
    val showSuggestions: Boolean = true,
    val showBody: Boolean = true,
    val showSleepScore: Boolean = true,
    // Stored as a year so the age (and the zones from it) move on by themselves.
    val birthYear: Int? = null,
    val gender: Gender? = null,
    // Read Health Connect every few hours while closed, for the widget and a fresh cold open.
    val backgroundRefresh: Boolean = false,
    val waterReminders: Boolean = false,
    // Needs background access: it reads the last hour's steps while fitdash is closed.
    val moveNudge: Boolean = false,
    val name: String? = null,
    val nameAsked: Boolean = false,
    val theme: ThemeChoice = ThemeChoice.SYSTEM,
    val proteinGoalG: Int = 100,
    val bedtimeTarget: LocalTime? = null,
    val morningAlert: Boolean = false,
    val weekReviewSeen: LocalDate? = null,
    // No watch or ring: the phone counts steps and sleep is typed in.
    val phoneOnly: Boolean = false,
)

class SettingsStore(context: Context) {
    private val prefs = context.getSharedPreferences("fitdash", Context.MODE_PRIVATE)
    private val _flow = MutableStateFlow(read())
    val flow: StateFlow<Settings> = _flow

    private fun read() = Settings(
        stepGoal = prefs.getInt("stepGoal", 9000),
        sleepHours = prefs.getInt("sleepTenths", 80) / 10.0,
        miles = prefs.getBoolean("miles", false),
        waterGoalMl = prefs.getInt("waterGoalMl", 2500),
        heightCm = prefs.getInt("heightCm", 0).takeIf { it > 0 },
        activeGoal = prefs.getInt("activeGoal", 30),
        clock24 = prefs.getBoolean("clock24", false),
        weightLb = prefs.getBoolean("weightLb", false),
        fahrenheit = prefs.getBoolean("fahrenheit", false),
        reduceMotion = prefs.getBoolean("reduceMotion", false),
        haptics = prefs.getBoolean("haptics", true),
        showWorkouts = prefs.getBoolean("showWorkouts", true),
        showHeartRate = prefs.getBoolean("showHeartRate", true),
        showSuggestions = prefs.getBoolean("showSuggestions", true),
        showBody = prefs.getBoolean("showBody", true),
        showSleepScore = prefs.getBoolean("showSleepScore", true),
        birthYear = prefs.getInt("birthYear", 0).takeIf { it > 0 },
        gender = prefs.getString("gender", null)?.let { runCatching { Gender.valueOf(it) }.getOrNull() },
        backgroundRefresh = prefs.getBoolean("backgroundRefresh", false),
        waterReminders = prefs.getBoolean("waterReminders", false),
        moveNudge = prefs.getBoolean("moveNudge", false),
        name = prefs.getString("name", null)?.takeIf { it.isNotBlank() },
        nameAsked = prefs.getBoolean("nameAsked", false),
        theme = prefs.getString("theme", null)?.let { runCatching { ThemeChoice.valueOf(it) }.getOrNull() } ?: ThemeChoice.SYSTEM,
        proteinGoalG = prefs.getInt("proteinGoalG", 100),
        bedtimeTarget = prefs.getInt("bedtimeMinutes", -1).takeIf { it >= 0 }?.let { LocalTime.of(it / 60, it % 60) },
        morningAlert = prefs.getBoolean("morningAlert", false),
        weekReviewSeen = prefs.getLong("weekReviewSeen", 0L).takeIf { it > 0 }?.let { LocalDate.ofEpochDay(it) },
        phoneOnly = prefs.getBoolean("phoneOnly", false),
    )

    fun update(change: (Settings) -> Settings) {
        val s = change(_flow.value)
        prefs.edit().putInt("stepGoal", s.stepGoal)
            .putInt("sleepTenths", (s.sleepHours * 10).roundToInt()).putBoolean("miles", s.miles)
            .putInt("waterGoalMl", s.waterGoalMl).putInt("heightCm", s.heightCm ?: 0).putInt("activeGoal", s.activeGoal)
            .putBoolean("clock24", s.clock24).putBoolean("weightLb", s.weightLb).putBoolean("fahrenheit", s.fahrenheit)
            .putBoolean("reduceMotion", s.reduceMotion).putBoolean("haptics", s.haptics)
            .putBoolean("showWorkouts", s.showWorkouts).putBoolean("showHeartRate", s.showHeartRate)
            .putBoolean("showSuggestions", s.showSuggestions).putBoolean("showBody", s.showBody).putBoolean("showSleepScore", s.showSleepScore)
            .putInt("birthYear", s.birthYear ?: 0).putString("gender", s.gender?.name).putBoolean("backgroundRefresh", s.backgroundRefresh)
            .putBoolean("waterReminders", s.waterReminders).putBoolean("moveNudge", s.moveNudge)
            .putString("name", s.name).putBoolean("nameAsked", s.nameAsked)
            .putString("theme", s.theme.name)
            .putInt("proteinGoalG", s.proteinGoalG).putInt("bedtimeMinutes", s.bedtimeTarget?.let { it.hour * 60 + it.minute } ?: -1)
            .putBoolean("morningAlert", s.morningAlert).putLong("weekReviewSeen", s.weekReviewSeen?.toEpochDay() ?: 0L)
            .putBoolean("phoneOnly", s.phoneOnly).apply()
        _flow.value = s
    }

    companion object {
        @Volatile private var instance: SettingsStore? = null

        fun get(context: Context): SettingsStore =
            instance ?: synchronized(this) { instance ?: SettingsStore(context.applicationContext).also { instance = it } }
    }
}
