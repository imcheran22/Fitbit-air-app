package app.fitdash.metrics

import org.junit.Assert.assertEquals
import org.junit.Test

class BmiTest {
    @Test fun `bmi is weight over height squared`() {
        assertEquals(22.86, bmi(70.0, 1.75), 0.005)
        assertEquals(BmiBand.HEALTHY, bmiBand(bmi(70.0, 1.75)))
    }

    @Test fun `band cutoffs belong to the upper band`() {
        assertEquals(BmiBand.UNDER, bmiBand(18.49))
        assertEquals(BmiBand.HEALTHY, bmiBand(18.5))
        assertEquals(BmiBand.HEALTHY, bmiBand(24.99))
        assertEquals(BmiBand.OVER, bmiBand(25.0))
        assertEquals(BmiBand.OVER, bmiBand(29.99))
        assertEquals(BmiBand.OBESE, bmiBand(30.0))
    }
}
