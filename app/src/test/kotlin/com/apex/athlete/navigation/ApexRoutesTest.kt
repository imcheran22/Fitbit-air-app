package com.apex.athlete.navigation

import androidx.test.ext.junit.runners.AndroidJUnit4
import com.apex.athlete.core.domain.MetricType
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import java.time.LocalDate
import kotlin.test.assertEquals
import kotlin.test.assertTrue

@RunWith(AndroidJUnit4::class)
@Config(sdk = [35], application = android.app.Application::class)
class ApexRoutesTest {
    private val day = LocalDate.of(2027, 1, 10)

    @Test fun theHealthDetailRoutesFillTheirDayArgument() {
        assertEquals("activity?d=2027-01-10", ApexDestination.Activity(day).route)
        assertEquals("body?d=2027-01-10", ApexDestination.Body(day).route)
        assertEquals("health/stress?d=2027-01-10", ApexDestination.Stress(day).route)
        assertEquals("health/energy?d=2027-01-10", ApexDestination.Energy(day).route)
        assertEquals("health/fitness?d=2027-01-10", ApexDestination.Fitness(day).route)
        assertEquals("health/monitor?d=2027-01-10", ApexDestination.Monitor(day).route)
    }

    @Test fun thePatternsAndTheDestinationsAgreeOnTheirPrefix() {
        val pairs = listOf(
            ApexRoutes.ACTIVITY to ApexDestination.Activity(day).route,
            ApexRoutes.BODY to ApexDestination.Body(day).route,
            ApexRoutes.STRESS to ApexDestination.Stress(day).route,
            ApexRoutes.ENERGY to ApexDestination.Energy(day).route,
            ApexRoutes.FITNESS to ApexDestination.Fitness(day).route,
            ApexRoutes.MONITOR to ApexDestination.Monitor(day).route,
        )
        for ((pattern, route) in pairs) {
            assertEquals(pattern.substringBefore("{d}"), route.substringBefore("2027"), pattern)
        }
    }

    @Test fun theTrendsBrowserTakesAnOptionalFirstMetric() {
        assertEquals("trends", ApexDestination.Trends().route)
        assertEquals("trends?a=hrv_rmssd", ApexDestination.Trends(MetricType.HRV_RMSSD).route)
        assertEquals("trends?a={a}", ApexRoutes.TRENDS)
    }

    @Test fun aNapIdWithColonsAndSlashesTravelsEncodedAsAQueryArgument() {
        val route = ApexDestination.Nap("ghealth:users/me/sleep/1").route
        assertEquals("sleep/nap?id=ghealth%3Ausers%2Fme%2Fsleep%2F1", route)
        assertTrue(route.startsWith(ApexRoutes.NAP.substringBefore("{id}")))
    }

    @Test fun noNewRouteCollidesWithAnExistingOne() {
        val routes = listOf(
            ApexRoutes.RECOVERY, ApexRoutes.STRAIN, ApexRoutes.SLEEP, ApexRoutes.HEART_RATE_DAY, ApexRoutes.WORKOUT, ApexRoutes.ADD_WORKOUT,
            ApexRoutes.TREND, ApexRoutes.ACTIVITY, ApexRoutes.BODY, ApexRoutes.STRESS, ApexRoutes.ENERGY, ApexRoutes.FITNESS,
            ApexRoutes.MONITOR, ApexRoutes.TRENDS, ApexRoutes.NAP, ApexRoutes.DATA_SOURCES, ApexRoutes.TAKEOUT_IMPORT, ApexRoutes.SETTINGS,
            ApexRoutes.PROFILE, ApexRoutes.HOW_IT_WORKS, ApexRoutes.EXPORT_DELETE, ApexRoutes.LICENCES, ApexRoutes.PRIVACY, ApexRoutes.COACH,
            ApexRoutes.GOALS, ApexRoutes.REPORTS, ApexRoutes.PLAN, ApexRoutes.BEHAVIOURS, ApexRoutes.FOOD, ApexRoutes.BLOOD_PRESSURE,
            ApexRoutes.BREATHE, ApexRoutes.QUICK_LOG, ApexRoutes.RECORDER,
        ) + ApexRoutes.TABS
        assertEquals(routes.size, routes.toSet().size)
    }

    @Test fun theNewMoreDestinationsMatchTheirRouteConstants() {
        val pairs = listOf(
            ApexRoutes.GOALS to ApexDestination.Goals.route,
            ApexRoutes.REPORTS to ApexDestination.Reports.route,
            ApexRoutes.PLAN to ApexDestination.Plan.route,
            ApexRoutes.BEHAVIOURS to ApexDestination.Behaviours.route,
            ApexRoutes.FOOD to ApexDestination.Food.route,
            ApexRoutes.BLOOD_PRESSURE to ApexDestination.BloodPressure.route,
            ApexRoutes.BREATHE to ApexDestination.Breathe.route,
            ApexRoutes.QUICK_LOG to ApexDestination.QuickLog.route,
            ApexRoutes.RECORDER to ApexDestination.Recorder.route,
        )
        for ((constant, route) in pairs) assertEquals(constant, route)
        assertEquals("more/goals", ApexRoutes.GOALS)
        assertEquals("recorder", ApexRoutes.RECORDER)
    }
}
