package com.apex.athlete.ui.settings

import java.util.Locale
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class SettingsLogicTest {
    @Test fun stepsWrapAroundMidnight() {
        assertEquals(23 * 60 + 30, stepMinuteOfDay(30, -60))
        assertEquals(30, stepMinuteOfDay(23 * 60 + 30, 60))
    }

    @Test fun hourStepKeepsMinutes() {
        assertEquals(23 * 60 + 15, stepHour(15, -1))
        assertEquals(8 * 60 + 15, stepHour(7 * 60 + 15, 1))
    }

    @Test fun minuteStepDoesNotCarryIntoHour() {
        assertEquals(7 * 60 + 55, stepMinutePart(7 * 60, -1))
        assertEquals(7 * 60, stepMinutePart(7 * 60 + 55, 1))
        assertEquals(7 * 60 + 15, stepMinutePart(7 * 60 + 13, 1)) // snaps to 10, then 15
    }

    @Test fun takeoutChoicesKeepUnusualStoredValue() {
        assertEquals(listOf(0, 14, 30, 60, 90), takeoutChoices(30))
        assertEquals(listOf(0, 7, 14, 30, 60, 90), takeoutChoices(7))
    }

    @Test fun clientIdBlankClears() {
        assertNull(normalizeClientId("   "))
        assertEquals("abc.apps", normalizeClientId("  abc.apps "))
    }

    @Test fun clientIdChangeDetectionIgnoresSpaces() {
        assertEquals(false, clientIdChanged(" abc ", "abc"))
        assertEquals(false, clientIdChanged("", null))
        assertEquals(true, clientIdChanged("abd", "abc"))
    }

    @Test fun clockFollowsSetting() {
        assertEquals("17:30", formatMinuteOfDay(17 * 60 + 30, true, Locale.US))
        assertEquals("5:30 PM", formatMinuteOfDay(17 * 60 + 30, false, Locale.US))
    }
}
