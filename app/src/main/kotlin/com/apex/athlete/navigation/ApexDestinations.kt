package com.apex.athlete.navigation

import android.net.Uri
import androidx.navigation.NavBackStackEntry
import com.apex.athlete.core.domain.MetricType
import java.time.LocalDate

/**
 * Route patterns, in one place. The day argument is `d=yyyy-MM-dd` (DESIGN_SYSTEM.md section 4);
 * when it is absent or unreadable the screen shows today. Strings rather than serialisable route
 * classes keep the saved back stack readable and the dependency set small.
 */
object ApexRoutes {
    const val ARG_DAY = "d"
    const val ARG_ID = "id"
    const val ARG_METRIC = "metric"

    /** The first metric preselected on the trends browser (a metric storage key). */
    const val ARG_FIRST = "a"

    /** Nested graph that holds the tabs and every detail screen. */
    const val MAIN = "main"
    const val ONBOARDING = "onboarding"

    // Tab roots
    const val OVERVIEW = "overview"
    const val HEALTH = "health"
    const val JOURNAL = "journal"
    const val MORE = "more"

    // Details opened from the Overview dials and the Health tab
    const val RECOVERY = "recovery?d={d}"
    const val STRAIN = "strain?d={d}"
    const val SLEEP = "sleep?d={d}"
    const val HEART_RATE_DAY = "heartrate?d={d}"
    const val WORKOUT = "workout?id={id}"
    const val ADD_WORKOUT = "workout/add?d={d}"
    const val TREND = "trend/{metric}"

    // Health detail routes (docs/APP_CONTRACT.md section 7)
    const val ACTIVITY = "activity?d={d}"
    const val BODY = "body?d={d}"
    const val STRESS = "health/stress?d={d}"
    const val ENERGY = "health/energy?d={d}"
    const val FITNESS = "health/fitness?d={d}"
    const val MONITOR = "health/monitor?d={d}"
    const val TRENDS = "trends?a={a}"
    const val NAP = "sleep/nap?id={id}"

    // More
    const val DATA_SOURCES = "more/data"
    const val TAKEOUT_IMPORT = "more/takeout"
    const val SETTINGS = "more/settings"
    const val PROFILE = "more/profile"
    const val HOW_IT_WORKS = "more/how-it-works"
    const val EXPORT_DELETE = "more/export-delete"
    const val LICENCES = "more/licences"
    const val PRIVACY = "more/privacy"

    const val COACH = "coach"

    /** Debug builds only. */
    const val GALLERY = "debug/gallery"

    /** The four tab roots, in tab-bar order. */
    val TABS: List<String> = listOf(OVERVIEW, HEALTH, JOURNAL, MORE)
}

/** A concrete place to go to. [route] is what `NavController.navigate` takes. */
sealed interface ApexDestination {
    val route: String

    data object Overview : ApexDestination { override val route = ApexRoutes.OVERVIEW }
    data object Health : ApexDestination { override val route = ApexRoutes.HEALTH }
    data object Journal : ApexDestination { override val route = ApexRoutes.JOURNAL }
    data object More : ApexDestination { override val route = ApexRoutes.MORE }

    data class Recovery(val day: LocalDate) : ApexDestination { override val route get() = "recovery?d=$day" }
    data class Strain(val day: LocalDate) : ApexDestination { override val route get() = "strain?d=$day" }
    data class Sleep(val day: LocalDate) : ApexDestination { override val route get() = "sleep?d=$day" }
    data class HeartRateDay(val day: LocalDate) : ApexDestination { override val route get() = "heartrate?d=$day" }
    data class AddWorkout(val day: LocalDate) : ApexDestination { override val route get() = "workout/add?d=$day" }

    /** [id] is any workout id (it may contain ':' or '/'), so it travels URL-encoded as a query argument. */
    data class Workout(val id: String) : ApexDestination { override val route get() = "workout?id=${Uri.encode(id)}" }

    data class Trend(val metric: MetricType) : ApexDestination { override val route get() = "trend/${metric.storageKey}" }

    data class Activity(val day: LocalDate) : ApexDestination { override val route get() = "activity?d=$day" }
    data class Body(val day: LocalDate) : ApexDestination { override val route get() = "body?d=$day" }
    data class Stress(val day: LocalDate) : ApexDestination { override val route get() = "health/stress?d=$day" }
    data class Energy(val day: LocalDate) : ApexDestination { override val route get() = "health/energy?d=$day" }
    data class Fitness(val day: LocalDate) : ApexDestination { override val route get() = "health/fitness?d=$day" }
    data class Monitor(val day: LocalDate) : ApexDestination { override val route get() = "health/monitor?d=$day" }

    /** The trends browser and overlay; [first] preselects the first overlay metric. */
    data class Trends(val first: MetricType? = null) : ApexDestination {
        override val route get() = if (first == null) "trends" else "trends?a=${first.storageKey}"
    }

    /** [id] is a sleep session id (it may contain ':' or '/'), so it travels URL-encoded as a query argument. */
    data class Nap(val id: String) : ApexDestination { override val route get() = "sleep/nap?id=${Uri.encode(id)}" }

    data object DataSources : ApexDestination { override val route = ApexRoutes.DATA_SOURCES }
    data object TakeoutImport : ApexDestination { override val route = ApexRoutes.TAKEOUT_IMPORT }
    data object Settings : ApexDestination { override val route = ApexRoutes.SETTINGS }
    data object Profile : ApexDestination { override val route = ApexRoutes.PROFILE }
    data object HowItWorks : ApexDestination { override val route = ApexRoutes.HOW_IT_WORKS }
    data object ExportDelete : ApexDestination { override val route = ApexRoutes.EXPORT_DELETE }
    data object Licences : ApexDestination { override val route = ApexRoutes.LICENCES }
    data object Privacy : ApexDestination { override val route = ApexRoutes.PRIVACY }
    data object Coach : ApexDestination { override val route = ApexRoutes.COACH }
    data object Gallery : ApexDestination { override val route = ApexRoutes.GALLERY }
}

/** The `d` argument as a date, or [fallback] when absent or malformed. */
fun NavBackStackEntry.dayArgument(fallback: LocalDate): LocalDate =
    arguments?.getString(ApexRoutes.ARG_DAY)?.let { text -> runCatching { LocalDate.parse(text) }.getOrNull() } ?: fallback

/** The metric named by the `metric` argument, or null when the key is unknown. */
fun NavBackStackEntry.metricArgument(): MetricType? =
    arguments?.getString(ApexRoutes.ARG_METRIC)?.let { key -> MetricType.entries.firstOrNull { it.storageKey == key } }

/** The metric named by the `a` argument of the trends browser, or null when absent or unknown. */
fun NavBackStackEntry.firstMetricArgument(): MetricType? =
    arguments?.getString(ApexRoutes.ARG_FIRST)?.let { key -> MetricType.entries.firstOrNull { it.storageKey == key } }

/** The workout id argument (already URL-decoded by Navigation), or null. */
fun NavBackStackEntry.idArgument(): String? = arguments?.getString(ApexRoutes.ARG_ID)?.takeIf { it.isNotEmpty() }
