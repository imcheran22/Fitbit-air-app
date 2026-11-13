package com.apex.athlete.core.analytics

import com.apex.athlete.core.analytics.journal.StudentT
import com.apex.athlete.core.analytics.journal.WelchTTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class WelchTTestTest {

    // Published two-sided 95 % critical values (standard t tables).
    @Test
    fun `quantile matches the t table`() {
        mapOf(1.0 to 12.7062, 2.0 to 4.3027, 5.0 to 2.5706, 8.0 to 2.3060, 10.0 to 2.2281, 30.0 to 2.0423)
            .forEach { (df, q) -> assertEquals(q, StudentT.quantile(0.975, df), 5e-4, "df=$df") }
        assertEquals(1.96, StudentT.quantile(0.975, 1e6), 1e-3)
    }

    @Test
    fun `cdf is symmetric and consistent with the quantile`() {
        assertEquals(0.5, StudentT.cdf(0.0, 7.0), 1e-12)
        assertEquals(0.975, StudentT.cdf(StudentT.quantile(0.975, 9.3), 9.3), 1e-9)
        assertEquals(1.0 - StudentT.cdf(1.7, 6.0), StudentT.cdf(-1.7, 6.0), 1e-12)
    }

    // Hand: arms [70,72,74,76,78] and [60,62,64,66,68]: means 74 and 64, each variance 10.
    // SE = sqrt(10/5 + 10/5) = 2, t = 10/2 = 5, Welch df = 4^2 / (2^2/4 + 2^2/4) = 8,
    // t(.975, 8) = 2.306004 -> CI 10 +- 4.612008 = [5.387992, 14.612008]; two-sided p(t=5, df=8) = 0.0010528 (numeric integral of the pdf).
    @Test
    fun `welch hand example`() {
        val r = WelchTTest.test(listOf(70.0, 72.0, 74.0, 76.0, 78.0), listOf(60.0, 62.0, 64.0, 66.0, 68.0))!!
        assertEquals(10.0, r.difference, 1e-12)
        assertEquals(2.0, r.standardError, 1e-12)
        assertEquals(5.0, r.t, 1e-12)
        assertEquals(8.0, r.degreesOfFreedom, 1e-9)
        assertEquals(5.387992, r.ciLow, 1e-4)
        assertEquals(14.612008, r.ciHigh, 1e-4)
        assertEquals(0.0010528, r.pValue, 1e-6)
    }

    // Unequal sizes and variances: arm A [1,2,3] (mean 2, var 1), arm B [10,12,14,16,18] (mean 14, var 10).
    // SE^2 = 1/3 + 10/5 = 2.333333; df = 2.333333^2 / ((1/3)^2/2 + 2^2/4) = 5.444444 / (0.055556 + 1) = 5.157895.
    @Test
    fun `welch satterthwaite df for unequal arms`() {
        val r = WelchTTest.test(listOf(1.0, 2.0, 3.0), listOf(10.0, 12.0, 14.0, 16.0, 18.0))!!
        assertEquals(-12.0, r.difference, 1e-12)
        assertEquals(5.157895, r.degreesOfFreedom, 1e-5)
    }

    @Test
    fun `degenerate inputs return null`() {
        assertNull(WelchTTest.test(listOf(1.0), listOf(1.0, 2.0)))
        assertNull(WelchTTest.test(listOf(5.0, 5.0, 5.0), listOf(4.0, 4.0, 4.0)))
    }
}
