package com.apex.athlete.core.data.settings

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.MutablePreferences
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.doublePreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.apex.athlete.core.analytics.strain.Sex
import com.apex.athlete.core.analytics.strain.ZoneMethod
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

/** What the load and zone calculations need to know about the owner. All optional: missing stays missing. */
data class UserProfile(
    val birthYear: Int? = null,
    val sex: Sex = Sex.UNSPECIFIED,
    val heightCm: Double? = null,
    val weightKg: Double? = null,
    /** A maximum heart rate the owner measured (lab or field test); overrides every estimate. */
    val maxHeartRateOverride: Int? = null,
    val zoneMethod: ZoneMethod = ZoneMethod.PERCENT_OF_MAX_HEART_RATE,
) {
    fun ageOn(year: Int): Int? = birthYear?.let { year - it }?.takeIf { it in 5..110 }
}

enum class ThemeChoice { SYSTEM, DARK, LIGHT }
enum class UnitSystem { METRIC, IMPERIAL }

data class AppSettings(
    val onboardingDone: Boolean = false,
    val demoMode: Boolean = false,
    val theme: ThemeChoice = ThemeChoice.SYSTEM,
    val units: UnitSystem = UnitSystem.METRIC,
    val clock24h: Boolean = true,
    val notificationsEnabled: Boolean = false,
    val notifyRecovery: Boolean = true,
    val notifyFatigue: Boolean = true,
    val notifyStale: Boolean = true,
    /** Minutes after midnight; alerts are held back between start and end. */
    val quietStartMinute: Int = 22 * 60,
    val quietEndMinute: Int = 7 * 60,
    val backgroundSync: Boolean = true,
    val aiCoachEnabled: Boolean = false,
    /** 0 = no reminder; otherwise remind when the last archive import is older than this many days. */
    val takeoutNudgeDays: Int = 0,
    val lastTakeoutImportMillis: Long? = null,
    val lastSyncMillis: Long? = null,
    val lastAlertDay: Long? = null,
    val googleClientId: String? = null,
    /** Experimental "Health age" (DECISIONS D13): off until the owner switches it on in Settings. */
    val healthAgeEnabled: Boolean = false,
)

private val Context.apexDataStore: DataStore<Preferences> by preferencesDataStore(name = "apex_settings")

/**
 * Preferences and the profile. Stored in a private DataStore file; it holds no health readings,
 * tokens or keys (those live in the encrypted database and the Keystore-backed stores).
 */
class SettingsStore(context: Context) {
    private val store = context.applicationContext.apexDataStore

    val profile: Flow<UserProfile> = store.data.map { p ->
        UserProfile(
            birthYear = p[BIRTH_YEAR],
            sex = enumOr(p[SEX], Sex.UNSPECIFIED),
            heightCm = p[HEIGHT_CM],
            weightKg = p[WEIGHT_KG],
            maxHeartRateOverride = p[MAX_HR],
            zoneMethod = enumOr(p[ZONE_METHOD], ZoneMethod.PERCENT_OF_MAX_HEART_RATE),
        )
    }

    val settings: Flow<AppSettings> = store.data.map(::read)

    suspend fun currentProfile(): UserProfile = profile.first()
    suspend fun currentSettings(): AppSettings = settings.first()

    suspend fun updateProfile(profile: UserProfile) {
        store.edit { p ->
            p.setOrRemove(BIRTH_YEAR, profile.birthYear)
            p[SEX] = profile.sex.name
            p.setOrRemove(HEIGHT_CM, profile.heightCm)
            p.setOrRemove(WEIGHT_KG, profile.weightKg)
            p.setOrRemove(MAX_HR, profile.maxHeartRateOverride)
            p[ZONE_METHOD] = profile.zoneMethod.name
        }
    }

    suspend fun update(transform: (AppSettings) -> AppSettings) {
        store.edit { p ->
            val s = transform(read(p))
            p[ONBOARDED] = s.onboardingDone
            p[DEMO] = s.demoMode
            p[THEME] = s.theme.name
            p[UNITS] = s.units.name
            p[CLOCK_24] = s.clock24h
            p[NOTIFY] = s.notificationsEnabled
            p[NOTIFY_RECOVERY] = s.notifyRecovery
            p[NOTIFY_FATIGUE] = s.notifyFatigue
            p[NOTIFY_STALE] = s.notifyStale
            p[QUIET_START] = s.quietStartMinute
            p[QUIET_END] = s.quietEndMinute
            p[BG_SYNC] = s.backgroundSync
            p[AI_COACH] = s.aiCoachEnabled
            p[TAKEOUT_NUDGE] = s.takeoutNudgeDays
            p.setOrRemove(LAST_TAKEOUT, s.lastTakeoutImportMillis)
            p.setOrRemove(LAST_SYNC, s.lastSyncMillis)
            p.setOrRemove(LAST_ALERT_DAY, s.lastAlertDay)
            p.setOrRemove(GOOGLE_CLIENT_ID, s.googleClientId)
            p[HEALTH_AGE] = s.healthAgeEnabled
        }
    }

    /** Forgets everything, including the profile. Part of "Delete all my data". */
    suspend fun clear() {
        store.edit { it.clear() }
    }

    private fun read(p: Preferences) = AppSettings(
        onboardingDone = p[ONBOARDED] ?: false,
        demoMode = p[DEMO] ?: false,
        theme = enumOr(p[THEME], ThemeChoice.SYSTEM),
        units = enumOr(p[UNITS], UnitSystem.METRIC),
        clock24h = p[CLOCK_24] ?: true,
        notificationsEnabled = p[NOTIFY] ?: false,
        notifyRecovery = p[NOTIFY_RECOVERY] ?: true,
        notifyFatigue = p[NOTIFY_FATIGUE] ?: true,
        notifyStale = p[NOTIFY_STALE] ?: true,
        quietStartMinute = p[QUIET_START] ?: (22 * 60),
        quietEndMinute = p[QUIET_END] ?: (7 * 60),
        backgroundSync = p[BG_SYNC] ?: true,
        aiCoachEnabled = p[AI_COACH] ?: false,
        takeoutNudgeDays = p[TAKEOUT_NUDGE] ?: 0,
        lastTakeoutImportMillis = p[LAST_TAKEOUT],
        lastSyncMillis = p[LAST_SYNC],
        lastAlertDay = p[LAST_ALERT_DAY],
        googleClientId = p[GOOGLE_CLIENT_ID]?.takeIf { it.isNotBlank() },
        healthAgeEnabled = p[HEALTH_AGE] ?: false,
    )

    private inline fun <reified E : Enum<E>> enumOr(name: String?, fallback: E): E =
        name?.let { n -> enumValues<E>().firstOrNull { it.name == n } } ?: fallback

    private fun <T> MutablePreferences.setOrRemove(key: Preferences.Key<T>, value: T?) {
        if (value == null) remove(key) else this[key] = value
    }

    private companion object {
        val BIRTH_YEAR = intPreferencesKey("birth_year")
        val SEX = stringPreferencesKey("sex")
        val HEIGHT_CM = doublePreferencesKey("height_cm")
        val WEIGHT_KG = doublePreferencesKey("weight_kg")
        val MAX_HR = intPreferencesKey("max_hr")
        val ZONE_METHOD = stringPreferencesKey("zone_method")
        val ONBOARDED = booleanPreferencesKey("onboarded")
        val DEMO = booleanPreferencesKey("demo")
        val THEME = stringPreferencesKey("theme")
        val UNITS = stringPreferencesKey("units")
        val CLOCK_24 = booleanPreferencesKey("clock24")
        val NOTIFY = booleanPreferencesKey("notify")
        val NOTIFY_RECOVERY = booleanPreferencesKey("notify_recovery")
        val NOTIFY_FATIGUE = booleanPreferencesKey("notify_fatigue")
        val NOTIFY_STALE = booleanPreferencesKey("notify_stale")
        val QUIET_START = intPreferencesKey("quiet_start")
        val QUIET_END = intPreferencesKey("quiet_end")
        val BG_SYNC = booleanPreferencesKey("bg_sync")
        val AI_COACH = booleanPreferencesKey("ai_coach")
        val TAKEOUT_NUDGE = intPreferencesKey("takeout_nudge_days")
        val LAST_TAKEOUT = longPreferencesKey("last_takeout")
        val LAST_SYNC = longPreferencesKey("last_sync")
        val LAST_ALERT_DAY = longPreferencesKey("last_alert_day")
        val GOOGLE_CLIENT_ID = stringPreferencesKey("google_client_id")
        val HEALTH_AGE = booleanPreferencesKey("health_age_enabled")
    }
}
