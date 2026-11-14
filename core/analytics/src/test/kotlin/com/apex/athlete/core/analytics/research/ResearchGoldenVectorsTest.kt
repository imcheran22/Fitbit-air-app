package com.apex.athlete.core.analytics.research

import com.apex.athlete.core.analytics.load.DailyLoad
import com.apex.athlete.core.analytics.load.TrainingLoadEngine
import com.apex.athlete.core.analytics.stats.Ewma
import com.apex.athlete.core.analytics.stats.MissingValuePolicy
import com.apex.athlete.core.analytics.strain.CardioProfile
import com.apex.athlete.core.analytics.strain.Sex
import com.apex.athlete.core.analytics.strain.Trimp
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Golden vectors of the research (Part 3 section 8.1) that belong to engines outside the
 * `research` package: T-EX02-a/b (Banister TRIMP) and T-EX04-a (descriptive ACWR).
 */
class ResearchGoldenVectorsTest {

    @Test
    fun `T-EX02-a Banister TRIMP for a man`() {
        val profile = CardioProfile(restingHeartRate = 60.0, maxHeartRate = 185.0, sex = Sex.MALE)
        assertEquals(63.0, 45 * Trimp.perMinute(140.0, profile), 0.05)
    }

    @Test
    fun `T-EX02-b Banister TRIMP for a woman`() {
        val profile = CardioProfile(restingHeartRate = 60.0, maxHeartRate = 185.0, sex = Sex.FEMALE)
        assertEquals(72.1, 45 * Trimp.perMinute(140.0, profile), 0.05)
    }

    /** Four weeks of daily load, oldest first: three identical weeks and a heavier fourth (research T-EX04-a). */
    private val exampleLoads = List(3) { listOf(200.0, 0.0, 300.0, 250.0, 0.0, 400.0, 100.0) }.flatten() +
        listOf(300.0, 0.0, 450.0, 500.0, 0.0, 600.0, 350.0)

    @Test
    fun `T-EX04-a descriptive EWMA ACWR with the research's seeding convention`() {
        // The research computes the ratio with the recursive EWMA of Williams et al. 2017, lambda = 2 / (N + 1)
        // (N = 7 and 28) and the recursion SEEDED WITH THE FIRST DAY. That convention gives 1.363, hand-checked.
        // Ewma.last with seed = null is exactly that recursion, so the vector is tested there, at its own tolerance.
        val acute = Ewma.last(exampleLoads, 7)!!
        val chronic = Ewma.last(exampleLoads, 28)!!
        assertEquals(1.363, acute / chronic, 1e-3)
        // The research's "rolling" ratio: mean of the last 7 days over the mean of the last 28.
        assertEquals(1.479, exampleLoads.takeLast(7).average() / exampleLoads.average(), 1e-3)
    }

    @Test
    fun `T-EX04-a the training load engine deliberately differs - normalised weights, same lambda`() {
        // TrainingLoadEngine uses the same lambdas but normalised weights instead of a first-day seed (formula version
        // 2, docs/FORMULAS.md section 5: a seeded 28-day EWMA still puts 39 % weight on day one after 14 days, and the
        // paper does not specify the initialisation). With only 28 days of history the two conventions have not yet
        // converged, so the engine's coupled ratio is 1.3287, not 1.363; both values are hand-checked
        // (S = x + d*S_prev, W = 1 + d*W_prev, y = S / W with d = 0.75 and 1 - 2/29).
        val r = TrainingLoadEngine().analyze(exampleLoads.mapIndexed { i, v -> DailyLoad(100L + i, v) }, 100L + exampleLoads.size - 1)
        assertEquals(1.3287, r.acwrCoupled!!, 1e-4)
        val normalisedAcute = Ewma.normalizedSeries(exampleLoads, 7, MissingValuePolicy.CARRY_FORWARD).last()!!
        val normalisedChronic = Ewma.normalizedSeries(exampleLoads, 28, MissingValuePolicy.CARRY_FORWARD).last()!!
        assertEquals(normalisedAcute / normalisedChronic, r.acwrCoupled!!, 1e-12)
    }
}
