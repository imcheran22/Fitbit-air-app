package com.apex.athlete.ui.licences

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class LicencesModelTest {
    @Test fun everyUsedLicenceHasATextSource() {
        usedLicences().forEach { assertTrue(it.rawText != null || it.inlineText != null, it.name) }
    }

    @Test fun onlyUsedLicencesAreListedOnce() {
        val used = usedLicences()
        assertEquals(used.distinct(), used)
        assertEquals(LicenceKind.entries.toSet(), used.toSet())
    }

    @Test fun fontsUseTheOfl() {
        assertTrue(fontEntries.all { it.licence == LicenceKind.SIL_OFL_1_1 && it.notice != null })
    }
}
