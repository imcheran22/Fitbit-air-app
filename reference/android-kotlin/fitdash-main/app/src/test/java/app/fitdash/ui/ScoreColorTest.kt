package app.fitdash.ui

import androidx.compose.ui.graphics.Color
import app.fitdash.ui.theme.breathMillis
import app.fitdash.ui.theme.scoreColor
import org.junit.Assert.assertEquals
import org.junit.Test

class ScoreColorTest {
    private val bad = Color(229, 72, 77)
    private val warn = Color(245, 176, 65)
    private val good = Color(61, 220, 151)

    @Test fun `traffic light stops`() {
        assertEquals(Color(229, 72, 77), scoreColor(0, bad, warn, good))
        assertEquals(Color(245, 176, 65), scoreColor(50, bad, warn, good))
        assertEquals(Color(61, 220, 151), scoreColor(100, bad, warn, good))
    }

    @Test fun `interpolates and clamps`() {
        assertEquals(Color(237, 124, 71), scoreColor(25, bad, warn, good))
        assertEquals(scoreColor(0, bad, warn, good), scoreColor(-5, bad, warn, good))
        assertEquals(scoreColor(100, bad, warn, good), scoreColor(130, bad, warn, good))
    }

    @Test fun `breathing slows when the score is low`() {
        assertEquals(7000, breathMillis(15))
        assertEquals(7000, breathMillis(5))
        assertEquals(4000, breathMillis(98))
    }
}
