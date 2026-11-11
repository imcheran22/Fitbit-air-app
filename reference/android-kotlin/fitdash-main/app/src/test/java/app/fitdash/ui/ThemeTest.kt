package app.fitdash.ui

import app.fitdash.settings.ThemeChoice
import app.fitdash.ui.theme.DARK
import app.fitdash.ui.theme.LOOK
import app.fitdash.ui.theme.resolveDark
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ThemeTest {
    @Test fun `system follows the phone, explicit choices do not`() {
        assertTrue(resolveDark(ThemeChoice.SYSTEM, true)); assertFalse(resolveDark(ThemeChoice.SYSTEM, false))
        assertTrue(resolveDark(ThemeChoice.DARK, false)); assertFalse(resolveDark(ThemeChoice.LIGHT, true))
    }

    @Test fun `dark tokens keep stage colours and have one ink per tint`() {
        assertEquals(LOOK.deep, DARK.deep); assertEquals(LOOK.tints.size, DARK.tintInk.size)
    }
}
