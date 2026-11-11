package app.fitdash.metrics

import org.junit.Assert.assertEquals
import org.junit.Test

class GenderTest {
    @Test fun `labels`() {
        assertEquals("Female", genderLabel(Gender.FEMALE))
        assertEquals("Male", genderLabel(Gender.MALE))
        assertEquals("Not set", genderLabel(null))
    }
}
