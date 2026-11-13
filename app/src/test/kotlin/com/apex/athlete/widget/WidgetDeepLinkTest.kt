package com.apex.athlete.widget

import com.apex.athlete.navigation.ApexRoutes
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class WidgetDeepLinkTest {

    @Test
    fun onlyTheThreeKnownRoutesAreAccepted() {
        assertEquals("recovery", WidgetDeepLink.validate("recovery"))
        assertEquals("overview", WidgetDeepLink.validate("overview"))
        assertEquals("heartrate", WidgetDeepLink.validate("heartrate"))
        assertNull(WidgetDeepLink.validate(null))
        assertNull(WidgetDeepLink.validate(""))
        assertNull(WidgetDeepLink.validate("more/export-delete"))
        assertNull(WidgetDeepLink.validate("recovery?d=2026-01-01"))
        assertNull(WidgetDeepLink.validate("Recovery"))
    }

    @Test
    fun routesMatchTheAppsRouteTable() {
        // Guards against drift: if ApexRoutes renames one of these, the widget tap would go nowhere.
        assertTrue(ApexRoutes.RECOVERY.startsWith(WidgetDeepLink.ROUTE_RECOVERY + "?"), ApexRoutes.RECOVERY)
        assertTrue(ApexRoutes.HEART_RATE_DAY.startsWith(WidgetDeepLink.ROUTE_HEART_RATE + "?"), ApexRoutes.HEART_RATE_DAY)
        assertEquals(ApexRoutes.OVERVIEW, WidgetDeepLink.ROUTE_OVERVIEW)
        assertEquals(setOf("recovery", "overview", "heartrate"), WidgetDeepLink.routes)
    }
}
