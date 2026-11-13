package com.apex.athlete.navigation

import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.navigation.navigation
import com.apex.athlete.BuildConfig
import com.apex.athlete.R
import com.apex.athlete.core.data.settings.AppSettings
import com.apex.athlete.core.data.store.StoreStatus
import com.apex.athlete.core.ui.components.BannerKind
import com.apex.athlete.core.ui.components.ConnectionBanner
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.shell.ApexScaffold
import com.apex.athlete.core.ui.shell.ApexTab
import com.apex.athlete.core.ui.shell.floatingBarClearance
import com.apex.athlete.core.ui.state.rememberReducedMotion
import com.apex.athlete.di.AppContainer
import com.apex.athlete.ui.common.PreparingDemoScreen
import com.apex.athlete.ui.common.StoreFailedScreen
import com.apex.athlete.ble.BleStrapConnection
import com.apex.athlete.ble.StrapState
import com.apex.athlete.ui.activity.ActivityDetailRoute
import com.apex.athlete.ui.behaviours.BehavioursRoute
import com.apex.athlete.ui.bloodpressure.BloodPressureRoute
import com.apex.athlete.ui.breathe.BreatheRoute
import com.apex.athlete.ui.food.FoodRoute
import com.apex.athlete.ui.goals.GoalsRoute
import com.apex.athlete.ui.plan.PlanRoute
import com.apex.athlete.ui.quicklog.QuickLogRoute
import com.apex.athlete.ui.recorder.RecorderRoute
import com.apex.athlete.ui.reports.ReportsRoute
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.flow.runningFold
import com.apex.athlete.ui.body.BodyRoute
import com.apex.athlete.ui.coach.CoachRoute
import com.apex.athlete.ui.datasources.DataSourcesRoute
import com.apex.athlete.ui.debug.GalleryScreen
import com.apex.athlete.ui.energy.EnergyRoute
import com.apex.athlete.ui.exportdelete.ExportDeleteRoute
import com.apex.athlete.ui.fitness.FitnessRoute
import com.apex.athlete.ui.health.HealthRoute
import com.apex.athlete.ui.healthage.HealthAgeRoute
import com.apex.athlete.ui.health.HeartRateDayRoute
import com.apex.athlete.ui.health.TrendDetailRoute
import com.apex.athlete.ui.howitworks.HowItWorksRoute
import com.apex.athlete.ui.journal.JournalRoute
import com.apex.athlete.ui.licences.LicencesRoute
import com.apex.athlete.ui.monitor.MonitorRoute
import com.apex.athlete.ui.more.MoreRoute
import com.apex.athlete.ui.nap.NapDetailRoute
import com.apex.athlete.ui.onboarding.OnboardingRoute
import com.apex.athlete.ui.overview.OverviewRoute
import com.apex.athlete.ui.privacy.PrivacyRoute
import com.apex.athlete.ui.profile.ProfileRoute
import com.apex.athlete.ui.recovery.RecoveryRoute
import com.apex.athlete.ui.settings.SettingsRoute
import com.apex.athlete.ui.sleep.SleepRoute
import com.apex.athlete.ui.strain.StrainRoute
import com.apex.athlete.ui.stress.StressRoute
import com.apex.athlete.ui.takeout.TakeoutImportRoute
import com.apex.athlete.ui.trends.TrendsBrowserRoute
import com.apex.athlete.ui.workout.AddWorkoutRoute
import com.apex.athlete.ui.workout.WorkoutDetailRoute
import kotlinx.coroutines.launch
import java.time.LocalDate

private const val PUSH_MILLIS = 300
private const val FADE_MILLIS = 180

private val dayArguments = listOf(
    navArgument(ApexRoutes.ARG_DAY) {
        type = NavType.StringType
        nullable = true
        defaultValue = null
    },
)

/**
 * The whole app below the theme: the floating tab bar shell, the navigation graph and the
 * store-status overlays.
 *
 * Structure
 *  - `onboarding` is shown first while `!settings.onboardingDone`; finishing it (the Onboarding
 *    screen sets the flag) replaces it with `main`.
 *  - `main` holds the four tab roots (Overview, Health, Journal, More) and every detail screen.
 *    Tabs switch with saveState/restoreState, so each tab keeps its own back stack; details push
 *    over the tab and hide the bar; back is predictive (manifest opt-in, NavHost seekable transitions).
 *  - A persistent Demo banner is pinned above everything while Demo mode is on.
 *  - Store `PreparingDemo` and `Failed` cover the app with their own screens. They are overlays,
 *    not replacements, so the back stack survives them.
 */
@Composable
fun ApexNavHost(
    container: AppContainer,
    settings: AppSettings,
    selectedDay: LocalDate,
    onSelectedDayChange: (LocalDate) -> Unit,
    openPrivacyRequest: Boolean,
    onOpenPrivacyHandled: () -> Unit,
    modifier: Modifier = Modifier,
    openRoute: String? = null,
    onOpenRouteHandled: () -> Unit = {},
) {
    val navController = rememberNavController()
    val navigator = remember(navController) { NavControllerNavigator(navController) }
    val scope = rememberCoroutineScope()
    val status by container.stores.status.collectAsStateWithLifecycle()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route
    val onTabRoot = currentRoute in ApexRoutes.TABS
    val reducedMotion = rememberReducedMotion()
    // The graph builder below must not capture values that change (a new builder instance would
    // rebuild the graph), so changing inputs travel as State and are read inside the screens.
    val latestDay = rememberUpdatedState(selectedDay)
    val latestSetDay = rememberUpdatedState(onSelectedDayChange)
    val latestClearance = rememberUpdatedState(floatingBarClearance())

    // Decided once, after settings loaded (MainActivity only composes this when they have).
    val startDestination = remember { if (settings.onboardingDone) ApexRoutes.MAIN else ApexRoutes.ONBOARDING }

    // Onboarding finished -> main. "Delete all my data" resets the flag -> back to onboarding with a clean stack.
    LaunchedEffect(settings.onboardingDone) {
        val route = navController.currentDestination?.route ?: return@LaunchedEffect
        if (settings.onboardingDone && route == ApexRoutes.ONBOARDING) {
            navController.navigate(ApexRoutes.MAIN) { popUpTo(ApexRoutes.ONBOARDING) { inclusive = true } }
        } else if (!settings.onboardingDone && route != ApexRoutes.ONBOARDING) {
            navController.navigate(ApexRoutes.ONBOARDING) { popUpTo(navController.graph.id) { inclusive = true } }
        }
    }

    // Health Connect rationale / permission-usage intents land on "How Apex uses your data".
    LaunchedEffect(openPrivacyRequest) {
        if (openPrivacyRequest) {
            navigator.openPrivacy()
            onOpenPrivacyHandled()
        }
    }

    // Widget taps: open the named route once onboarding is done, then tell the host it was handled.
    LaunchedEffect(openRoute, settings.onboardingDone) {
        val r = openRoute ?: return@LaunchedEffect
        if (!settings.onboardingDone) return@LaunchedEffect
        if (r == ApexRoutes.OVERVIEW) {
            navController.switchTab(ApexRoutes.OVERVIEW)
        } else {
            navController.navigate(r) { launchSingleTop = true }
        }
        onOpenRouteHandled()
    }

    val tabs = listOf(
        ApexTab(stringResource(R.string.tab_overview), ApexIcons.Overview),
        ApexTab(stringResource(R.string.tab_health), ApexIcons.Health),
        ApexTab(stringResource(R.string.tab_journal), ApexIcons.Journal),
        ApexTab(stringResource(R.string.tab_more), ApexIcons.More),
    )

    val demoTitle = stringResource(R.string.banner_demo_title)
    val demoBody = stringResource(R.string.banner_demo_body)
    val demoAction = stringResource(R.string.banner_demo_action)
    val demoBanner: @Composable () -> Unit = {
        ConnectionBanner(
            kind = BannerKind.Demo,
            title = demoTitle,
            description = demoBody,
            actionLabel = if (currentRoute == ApexRoutes.ONBOARDING) null else demoAction,
            onAction = if (currentRoute == ApexRoutes.ONBOARDING) null else ({ navigator.openSettings() }),
        )
    }

    Box(modifier.fillMaxSize()) {
        ApexScaffold(
            tabs = tabs,
            selectedTab = ApexRoutes.TABS.indexOf(currentRoute).coerceAtLeast(0),
            onTabSelected = { index -> navController.switchTab(ApexRoutes.TABS[index]) },
            coachContentDescription = stringResource(R.string.coach_action_description),
            onCoachClick = { navigator.openCoach() },
            banner = if (settings.demoMode) demoBanner else null,
            showBars = onTabRoot,
        ) { _ ->
            NavHost(
                navController = navController,
                startDestination = startDestination,
                modifier = Modifier.fillMaxSize(),
                enterTransition = { enterFor(reducedMotion) },
                exitTransition = { exitFor(reducedMotion) },
                popEnterTransition = { popEnterFor(reducedMotion) },
                popExitTransition = { popExitFor(reducedMotion) },
            ) {
                composable(ApexRoutes.ONBOARDING) { OnboardingRoute(navigator) }

                navigation(route = ApexRoutes.MAIN, startDestination = ApexRoutes.OVERVIEW) {
                    // --- Tab roots (padding clears the floating bar) ---
                    composable(ApexRoutes.OVERVIEW) {
                        OverviewRoute(navigator, latestDay.value, { latestSetDay.value(it) }, PaddingValues(bottom = latestClearance.value))
                    }
                    composable(ApexRoutes.HEALTH) {
                        HealthRoute(navigator, latestDay.value, { latestSetDay.value(it) }, PaddingValues(bottom = latestClearance.value))
                    }
                    composable(ApexRoutes.JOURNAL) {
                        JournalRoute(navigator, latestDay.value, { latestSetDay.value(it) }, PaddingValues(bottom = latestClearance.value))
                    }
                    composable(ApexRoutes.MORE) { MoreRoute(navigator, PaddingValues(bottom = latestClearance.value)) }

                    // --- Day details ---
                    composable(ApexRoutes.RECOVERY, arguments = dayArguments) { entry ->
                        DayDetail(entry, latestDay, latestSetDay) { day, change -> RecoveryRoute(navigator, day, change) }
                    }
                    composable(ApexRoutes.STRAIN, arguments = dayArguments) { entry ->
                        DayDetail(entry, latestDay, latestSetDay) { day, change -> StrainRoute(navigator, day, change) }
                    }
                    composable(ApexRoutes.SLEEP, arguments = dayArguments) { entry ->
                        DayDetail(entry, latestDay, latestSetDay) { day, change -> SleepRoute(navigator, day, change) }
                    }
                    composable(ApexRoutes.HEART_RATE_DAY, arguments = dayArguments) { entry ->
                        DayDetail(entry, latestDay, latestSetDay) { day, change -> HeartRateDayRoute(navigator, day, change) }
                    }
                    composable(ApexRoutes.ADD_WORKOUT, arguments = dayArguments) { entry ->
                        DayDetail(entry, latestDay, latestSetDay) { day, _ -> AddWorkoutRoute(navigator, day) }
                    }
                    composable(ApexRoutes.ACTIVITY, arguments = dayArguments) { entry ->
                        DayDetail(entry, latestDay, latestSetDay) { day, change -> ActivityDetailRoute(navigator, day, change) }
                    }
                    composable(ApexRoutes.BODY, arguments = dayArguments) { entry ->
                        DayDetail(entry, latestDay, latestSetDay) { day, change -> BodyRoute(navigator, day, change) }
                    }
                    composable(ApexRoutes.STRESS, arguments = dayArguments) { entry ->
                        DayDetail(entry, latestDay, latestSetDay) { day, change -> StressRoute(navigator, day, change) }
                    }
                    composable(ApexRoutes.ENERGY, arguments = dayArguments) { entry ->
                        DayDetail(entry, latestDay, latestSetDay) { day, change -> EnergyRoute(navigator, day, change) }
                    }
                    composable(ApexRoutes.FITNESS, arguments = dayArguments) { entry ->
                        DayDetail(entry, latestDay, latestSetDay) { day, change -> FitnessRoute(navigator, day, change) }
                    }
                    composable(ApexRoutes.MONITOR, arguments = dayArguments) { entry ->
                        DayDetail(entry, latestDay, latestSetDay) { day, change -> MonitorRoute(navigator, day, change) }
                    }

                    // --- Other details ---
                    composable(
                        ApexRoutes.WORKOUT,
                        arguments = listOf(
                            navArgument(ApexRoutes.ARG_ID) {
                                type = NavType.StringType
                                nullable = true
                                defaultValue = null
                            },
                        ),
                    ) { entry ->
                        val id = entry.idArgument()
                        if (id == null) {
                            LaunchedEffect(Unit) { navigator.back() }
                        } else {
                            Detail { WorkoutDetailRoute(navigator, id) }
                        }
                    }
                    composable(
                        ApexRoutes.TREND,
                        arguments = listOf(navArgument(ApexRoutes.ARG_METRIC) { type = NavType.StringType }),
                    ) { entry ->
                        val metric = entry.metricArgument()
                        if (metric == null) {
                            LaunchedEffect(Unit) { navigator.back() }
                        } else {
                            Detail { TrendDetailRoute(navigator, metric) }
                        }
                    }
                    composable(
                        ApexRoutes.TRENDS,
                        arguments = listOf(
                            navArgument(ApexRoutes.ARG_FIRST) {
                                type = NavType.StringType
                                nullable = true
                                defaultValue = null
                            },
                        ),
                    ) { entry ->
                        val first = entry.firstMetricArgument()
                        Detail { TrendsBrowserRoute(navigator, first) }
                    }
                    composable(
                        ApexRoutes.NAP,
                        arguments = listOf(
                            navArgument(ApexRoutes.ARG_ID) {
                                type = NavType.StringType
                                nullable = true
                                defaultValue = null
                            },
                        ),
                    ) { entry ->
                        val id = entry.idArgument()
                        if (id == null) {
                            LaunchedEffect(Unit) { navigator.back() }
                        } else {
                            Detail { NapDetailRoute(navigator, id) }
                        }
                    }
                    composable(ApexRoutes.HEALTH_AGE) { Detail { HealthAgeRoute(navigator) } }
                    composable(ApexRoutes.DATA_SOURCES) { Detail { DataSourcesRoute(navigator) } }
                    composable(ApexRoutes.TAKEOUT_IMPORT) { Detail { TakeoutImportRoute(navigator) } }
                    composable(ApexRoutes.SETTINGS) { Detail { SettingsRoute(navigator) } }
                    composable(ApexRoutes.PROFILE) { Detail { ProfileRoute(navigator) } }
                    composable(ApexRoutes.HOW_IT_WORKS) { Detail { HowItWorksRoute(navigator) } }
                    composable(ApexRoutes.EXPORT_DELETE) { Detail { ExportDeleteRoute(navigator) } }
                    composable(ApexRoutes.LICENCES) { Detail { LicencesRoute(navigator) } }
                    composable(ApexRoutes.PRIVACY) { Detail { PrivacyRoute(navigator) } }
                    composable(ApexRoutes.GOALS) { Detail { GoalsRoute(navigator::back) } }
                    composable(ApexRoutes.REPORTS) { Detail { ReportsRoute(navigator::back) } }
                    composable(ApexRoutes.PLAN) { Detail { PlanRoute(navigator::back) } }
                    composable(ApexRoutes.BEHAVIOURS) { Detail { BehavioursRoute(navigator::back) } }
                    composable(ApexRoutes.FOOD) { Detail { FoodRoute(navigator::back) } }
                    composable(ApexRoutes.BLOOD_PRESSURE) { Detail { BloodPressureRoute(navigator::back) } }
                    composable(ApexRoutes.QUICK_LOG) { Detail { QuickLogRoute(navigator::back) } }
                    composable(ApexRoutes.RECORDER) { Detail { RecorderRoute(navigator::back) } }
                    composable(ApexRoutes.BREATHE) { Detail { BreatheWithStrap(navigator::back) } }
                    composable(ApexRoutes.COACH) { Detail { CoachRoute(navigator) } }

                    if (BuildConfig.DEBUG) {
                        composable(ApexRoutes.GALLERY) { Detail { GalleryScreen(navigator) } }
                    }
                }
            }
        }

        val current = status
        when (current) {
            is StoreStatus.PreparingDemo -> PreparingDemoScreen(done = current.done, total = current.total)
            is StoreStatus.Failed -> StoreFailedScreen(
                isDemo = settings.demoMode,
                causeName = current.cause.javaClass.simpleName,
                onCleanStart = { scope.launch { container.stores.resetRealStore() } },
                onLeaveDemo = {
                    // Same order as Settings: leave the demo store first, then throw it away.
                    scope.launch {
                        container.settings.update { it.copy(demoMode = false) }
                        container.stores.discardDemo()
                    }
                },
            )
            else -> Unit
        }
    }
}

/**
 * Breathe, with live R-R intervals (a rolling window of the last 120) only while the strap is connected
 * when the screen opens; otherwise null and the screen offers no spot HRV.
 */
@Composable
private fun BreatheWithStrap(onBack: () -> Unit) {
    val context = LocalContext.current.applicationContext
    val strap = remember { BleStrapConnection.shared(context) }
    val connected = strap.state.collectAsStateWithLifecycle().value is StrapState.Connected
    val rr = remember(strap, connected) {
        if (connected) strap.rrIntervalsMs.runningFold(emptyList<Int>()) { acc, v -> (acc + v).takeLast(RR_WINDOW) } else null
    }
    BreatheRoute(onBack, rr)
}

private const val RR_WINDOW = 120

/** Full-screen detail content: applies the navigation-bar inset once (the tab bar is hidden here). */
@Composable
private fun Detail(content: @Composable () -> Unit) {
    Box(Modifier.fillMaxSize().navigationBarsPadding()) { content() }
}

/**
 * A detail screen with a date pill. The day starts from the `d` argument (else the selected day) and is
 * then owned here, so stepping the pill neither pushes entries nor loses the day on process death
 * (it is saved with the entry). Every step also becomes the app-wide selected day.
 */
@Composable
private fun DayDetail(
    entry: NavBackStackEntry,
    selectedDay: State<LocalDate>,
    onSelectedDayChange: State<(LocalDate) -> Unit>,
    content: @Composable (day: LocalDate, onDayChange: (LocalDate) -> Unit) -> Unit,
) {
    var epochDay by rememberSaveable { mutableStateOf(entry.dayArgument(selectedDay.value).toEpochDay()) }
    Detail {
        content(LocalDate.ofEpochDay(epochDay)) { next ->
            epochDay = next.toEpochDay()
            onSelectedDayChange.value(next)
        }
    }
}

/** Standard bottom-bar tab switch: one back stack per tab, state saved and restored. */
private fun NavController.switchTab(route: String) {
    navigate(route) {
        popUpTo(ApexRoutes.OVERVIEW) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}

// --- Transitions: tab <-> tab and onboarding use a plain cross-fade; details slide in. Reduced motion: none. ---

private fun AnimatedContentTransitionScope<NavBackStackEntry>.isFlat(): Boolean {
    val from = initialState.destination.route
    val to = targetState.destination.route
    return (from in ApexRoutes.TABS && to in ApexRoutes.TABS) ||
        from == ApexRoutes.ONBOARDING || to == ApexRoutes.ONBOARDING
}

private fun AnimatedContentTransitionScope<NavBackStackEntry>.enterFor(reduced: Boolean): EnterTransition =
    when {
        reduced -> EnterTransition.None
        isFlat() -> fadeIn(tween(FADE_MILLIS))
        else -> slideIntoContainer(
            AnimatedContentTransitionScope.SlideDirection.Start,
            tween(PUSH_MILLIS),
            initialOffset = { it / 5 },
        ) + fadeIn(tween(PUSH_MILLIS))
    }

private fun AnimatedContentTransitionScope<NavBackStackEntry>.exitFor(reduced: Boolean): ExitTransition =
    when {
        reduced -> ExitTransition.None
        else -> fadeOut(tween(FADE_MILLIS))
    }

private fun AnimatedContentTransitionScope<NavBackStackEntry>.popEnterFor(reduced: Boolean): EnterTransition =
    when {
        reduced -> EnterTransition.None
        else -> fadeIn(tween(FADE_MILLIS))
    }

private fun AnimatedContentTransitionScope<NavBackStackEntry>.popExitFor(reduced: Boolean): ExitTransition =
    when {
        reduced -> ExitTransition.None
        isFlat() -> fadeOut(tween(FADE_MILLIS))
        else -> slideOutOfContainer(
            AnimatedContentTransitionScope.SlideDirection.End,
            tween(PUSH_MILLIS),
            targetOffset = { it / 5 },
        ) + fadeOut(tween(PUSH_MILLIS))
    }
