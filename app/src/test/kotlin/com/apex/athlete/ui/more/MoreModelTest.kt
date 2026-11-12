package com.apex.athlete.ui.more

import org.junit.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class MoreModelTest {
    @Test
    fun takeoutOnlyWhenDemoIsKnownToBeOff() {
        assertTrue(takeoutImportAllowed(false))
        assertFalse(takeoutImportAllowed(true))
        assertFalse(takeoutImportAllowed(null))
    }

    @Test
    fun galleryOnlyInDebug() {
        assertTrue(showGalleryRow(true))
        assertFalse(showGalleryRow(false))
    }
}
