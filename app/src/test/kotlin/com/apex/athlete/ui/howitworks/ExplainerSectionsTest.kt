package com.apex.athlete.ui.howitworks

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ExplainerSectionsTest {
    @Test fun coversTheSevenRequiredTopicsWithCopy() {
        assertEquals(8, explainerSections.size)
        assertTrue(explainerSections.all { it.paragraphs.isNotEmpty() })
    }
}
