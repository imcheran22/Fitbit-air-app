package com.apex.athlete.navigation

import androidx.navigation.NavController
import com.apex.athlete.BuildConfig
import com.apex.athlete.core.domain.MetricType
import java.time.LocalDate

/**
 * What screens call to move around. Screens never see the NavController, so they stay testable
 * (pass a recording fake) and the route strings stay in [ApexRoutes].
 */
interface ApexNavigator {
    fun openRecovery(day: LocalDate)
    fun openStrain(day: LocalDate)
    fun openSleep(day: LocalDate)
    fun openTrend(metric: MetricType)
    fun openWorkout(id: String)
    fun openAddWorkout(day: LocalDate)
    fun openCoach()
    fun openDataSources()
    fun openTakeoutImport()
    fun openSettings()
    fun openProfile()
    fun openHowItWorks()
    fun openExportDelete()
    fun openLicences()
    fun openPrivacy()

    /** Heart rate for one day (opened from the Overview heart-rate card and the Health tab). */
    fun openHeartRateDay(day: LocalDate)

    /** Debug builds only; a no-op in release builds. */
    fun openGallery()

    /** Pops one entry. Does nothing at the root of a tab. */
    fun back()
}

/** [ApexNavigator] backed by a NavController. */
class NavControllerNavigator(private val navController: NavController) : ApexNavigator {

    private fun go(destination: ApexDestination) {
        navController.navigate(destination.route) { launchSingleTop = true }
    }

    override fun openRecovery(day: LocalDate) = go(ApexDestination.Recovery(day))
    override fun openStrain(day: LocalDate) = go(ApexDestination.Strain(day))
    override fun openSleep(day: LocalDate) = go(ApexDestination.Sleep(day))
    override fun openTrend(metric: MetricType) = go(ApexDestination.Trend(metric))
    override fun openWorkout(id: String) = go(ApexDestination.Workout(id))
    override fun openAddWorkout(day: LocalDate) = go(ApexDestination.AddWorkout(day))
    override fun openCoach() = go(ApexDestination.Coach)
    override fun openDataSources() = go(ApexDestination.DataSources)
    override fun openTakeoutImport() = go(ApexDestination.TakeoutImport)
    override fun openSettings() = go(ApexDestination.Settings)
    override fun openProfile() = go(ApexDestination.Profile)
    override fun openHowItWorks() = go(ApexDestination.HowItWorks)
    override fun openExportDelete() = go(ApexDestination.ExportDelete)
    override fun openLicences() = go(ApexDestination.Licences)
    override fun openPrivacy() = go(ApexDestination.Privacy)
    override fun openHeartRateDay(day: LocalDate) = go(ApexDestination.HeartRateDay(day))

    override fun openGallery() {
        if (BuildConfig.DEBUG) go(ApexDestination.Gallery)
    }

    override fun back() {
        // Never pop the last entry: that would leave an empty back stack and a blank window.
        if (navController.previousBackStackEntry != null) navController.popBackStack()
    }
}
