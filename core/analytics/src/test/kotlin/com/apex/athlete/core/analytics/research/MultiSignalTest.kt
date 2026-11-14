package com.apex.athlete.core.analytics.research

import com.apex.athlete.core.analytics.recovery.FatigueSignalDetector
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class MultiSignalTest {

    private val high = MetricConfidence(ConfidenceLevel.HIGH, emptySet())
    private val low = MetricConfidence(ConfidenceLevel.LOW, setOf(ConfidenceReason.STALE_DATA))
    private val ok = PatternContext(confidence = high)

    private fun mv01(
        rhr: Double? = null,
        hrvWeekly: Double? = null,
        hrvTwo: Double? = null,
        rr: Double? = null,
        temp: Double? = null,
        ctx: PatternContext = ok,
    ) = MultiSignal.evaluate(
        MultiSignal.MV01,
        mapOf(
            PatternSignal.RESTING_HEART_RATE to rhr,
            PatternSignal.HRV_WEEKLY to hrvWeekly,
            PatternSignal.HRV_LAST_TWO_NIGHTS to hrvTwo,
            PatternSignal.RESPIRATORY_RATE to rr,
            PatternSignal.SLEEP_TEMPERATURE_DELTA_C to temp,
        ),
        ctx,
    )

    // ------------------------------------------------------------------------------ MV01

    @Test
    fun `two of three signals deviating is detected and lists exactly those`() {
        val m = mv01(rhr = 2.5, hrvWeekly = -0.2, hrvTwo = -0.1, rr = 2.2)
        assertEquals(PatternOutcome.DETECTED, m.outcome)
        assertEquals(2, m.metCount)
        assertEquals(setOf(PatternSignal.RESTING_HEART_RATE, PatternSignal.RESPIRATORY_RATE), m.contributing.map { it.signal }.toSet())
        assertEquals(2.5, m.contributing.first { it.signal == PatternSignal.RESTING_HEART_RATE }.value, 1e-12)
        assertTrue(m.alertAllowed)
        assertNull(m.suppressionReason)
        assertTrue(m.observation!!.startsWith("2 of 3 signals differed from your usual together"))
    }

    @Test
    fun `one deviating signal is not enough`() {
        val m = mv01(rhr = 3.0, hrvWeekly = -0.2, hrvTwo = -0.1, rr = 0.4)
        assertEquals(PatternOutcome.NOT_DETECTED, m.outcome)
        assertFalse(m.alertAllowed)
        assertNull(m.message)
        assertNull(m.observation)
    }

    @Test
    fun `thresholds are the research values and inclusive`() {
        assertTrue(mv01(rhr = 2.0, rr = 2.0).detected)
        assertFalse(mv01(rhr = 1.99, hrvWeekly = 0.0, hrvTwo = 0.0, rr = 1.99).detected)
        assertTrue(mv01(rhr = 2.0, hrvWeekly = -1.5).detected)
        assertFalse(mv01(rhr = 2.0, hrvWeekly = -1.49, hrvTwo = -1.99, rr = 0.0).detected)
        assertTrue(mv01(rhr = 2.0, hrvTwo = -2.0).detected)
    }

    @Test
    fun `HRV counts through either of its two research routes`() {
        assertTrue(mv01(hrvWeekly = -1.6, rr = 2.5).detected)
        assertTrue(mv01(hrvTwo = -2.1, rr = 2.5).detected)
        val both = mv01(rhr = 2.5, hrvWeekly = -1.6, hrvTwo = -2.1)
        assertEquals(2, both.metCount)
        assertEquals(3, both.contributing.size)
    }

    @Test
    fun `high and low are not interchangeable`() {
        assertFalse(mv01(rhr = -3.0, hrvWeekly = 3.0, hrvTwo = 3.0, rr = -3.0).detected)
    }

    @Test
    fun `missing readings are not normal and not deviating`() {
        // One signal up, the other two unknown: could still be two of three.
        assertEquals(PatternOutcome.INSUFFICIENT_DATA, mv01(rhr = 3.0).outcome)
        // One up, one known normal, one unknown: the unknown could decide it.
        assertEquals(PatternOutcome.INSUFFICIENT_DATA, mv01(rhr = 3.0, rr = 0.0).outcome)
        // One up, two known normal: cannot reach two.
        assertEquals(PatternOutcome.NOT_DETECTED, mv01(rhr = 3.0, hrvWeekly = 0.0, hrvTwo = 0.0, rr = 0.0).outcome)
        // Nothing known.
        assertEquals(PatternOutcome.INSUFFICIENT_DATA, mv01().outcome)
        // Two known normal, one unknown: at most one could deviate.
        assertEquals(PatternOutcome.NOT_DETECTED, mv01(rhr = 0.0, rr = 0.0).outcome)
    }

    @Test
    fun `one HRV route known and normal while the other is missing is still unknown`() {
        val m = mv01(rhr = 3.0, hrvWeekly = 0.0, hrvTwo = null, rr = 0.0)
        assertEquals(PatternOutcome.INSUFFICIENT_DATA, m.outcome)
        assertEquals(1, m.unknownCount)
    }

    @Test
    fun `non-finite readings are missing`() {
        assertEquals(PatternOutcome.INSUFFICIENT_DATA, mv01(rhr = Double.NaN, rr = 3.0).outcome)
        assertEquals(PatternOutcome.INSUFFICIENT_DATA, mv01(rhr = Double.POSITIVE_INFINITY).outcome)
    }

    @Test
    fun `temperature is listed but never counted`() {
        val withTemp = mv01(rhr = 2.5, rr = 2.5, temp = 0.4)
        assertEquals(listOf(PatternSignal.SLEEP_TEMPERATURE_DELTA_C), withTemp.supporting.map { it.signal })
        assertEquals(2, withTemp.metCount)
        assertTrue(withTemp.observation!!.contains("Sleeping skin temperature (higher than usual)"))
        assertTrue(mv01(rhr = 2.5, rr = 2.5, temp = 0.29).supporting.isEmpty())
        // Temperature plus one deviating signal is not a pattern.
        assertFalse(mv01(rhr = 2.5, hrvWeekly = 0.0, hrvTwo = 0.0, rr = 0.0, temp = 0.5).detected)
    }

    @Test
    fun `an active illness tag suppresses MV01 and an alcohol tag quietens it`() {
        val illness = mv01(rhr = 2.5, rr = 2.5, ctx = PatternContext(high, setOf(ContextTag.ILLNESS)))
        assertTrue(illness.detected)
        assertFalse(illness.alertAllowed)
        assertTrue(illness.suppressionReason!!.contains("illness"))

        val alcohol = mv01(rhr = 2.5, rr = 2.5, ctx = PatternContext(high, setOf(ContextTag.ALCOHOL)))
        assertTrue(alcohol.alertAllowed)
        assertTrue(alcohol.lowProminence)
        assertEquals(setOf(ContextTag.ALCOHOL), alcohol.likelyExplanations)
        assertFalse(ok.tags.isNotEmpty())
        assertFalse(mv01(rhr = 2.5, rr = 2.5).lowProminence)
    }

    @Test
    fun `no alert without adequate data quality`() {
        val lowQ = mv01(rhr = 2.5, rr = 2.5, ctx = PatternContext(low))
        assertTrue(lowQ.detected)
        assertFalse(lowQ.alertAllowed)
        assertEquals("data confidence is low", lowQ.suppressionReason)
        val unassessed = mv01(rhr = 2.5, rr = 2.5, ctx = PatternContext())
        assertFalse(unassessed.alertAllowed)
        assertEquals("data quality was not assessed", unassessed.suppressionReason)
        val moderate = MetricConfidence(ConfidenceLevel.MODERATE, setOf(ConfidenceReason.BASELINE_PROVISIONAL))
        assertTrue(mv01(rhr = 2.5, rr = 2.5, ctx = PatternContext(moderate)).alertAllowed)
    }

    @Test
    fun `a pattern that is not detected carries no tags or suppression text`() {
        val m = mv01(rhr = 3.0, hrvWeekly = 0.0, hrvTwo = 0.0, rr = 0.0, ctx = PatternContext(low, setOf(ContextTag.ILLNESS)))
        assertNull(m.suppressionReason)
        assertTrue(m.likelyExplanations.isEmpty())
        assertTrue(m.supporting.isEmpty())
    }

    // ----------------------------------------------------------------------- persistence helper

    @Test
    fun `persistent z is the least extreme of the last nights`() {
        assertEquals(2.5, MultiSignal.persistentZ(listOf(0.0, 3.0, 2.5), Deviation.HIGHER)!!, 1e-12)
        assertEquals(-2.1, MultiSignal.persistentZ(listOf(0.0, -3.0, -2.1), Deviation.LOWER)!!, 1e-12)
        assertEquals(1.0, MultiSignal.persistentZ(listOf(2.5, 1.0), Deviation.HIGHER)!!, 1e-12)
        assertEquals(0.5, MultiSignal.persistentZ(listOf(3.0, 2.5, 0.5), Deviation.HIGHER, nights = 3)!!, 1e-12)
    }

    @Test
    fun `persistent z needs every night`() {
        assertNull(MultiSignal.persistentZ(listOf(3.0), Deviation.HIGHER))
        assertNull(MultiSignal.persistentZ(listOf(3.0, null), Deviation.HIGHER))
        assertNull(MultiSignal.persistentZ(listOf(null, 3.0), Deviation.HIGHER))
        assertNull(MultiSignal.persistentZ(listOf(3.0, Double.NaN), Deviation.HIGHER))
        assertNull(MultiSignal.persistentZ(emptyList(), Deviation.LOWER))
        assertEquals(3.0, MultiSignal.persistentZ(listOf(null, 3.5, 3.0), Deviation.HIGHER)!!, 1e-12)
        assertFailsWith<IllegalArgumentException> { MultiSignal.persistentZ(listOf(1.0, 2.0), Deviation.STABLE) }
        assertFailsWith<IllegalArgumentException> { MultiSignal.persistentZ(listOf(1.0, 2.0), Deviation.HIGHER, nights = 0) }
    }

    @Test
    fun `MV01 from nightly series applies the two-night window`() {
        val m = MultiSignal.illnessLikePattern(
            rhrNightlyZ = listOf(0.1, 2.4, 2.8),
            hrvWeeklyZ = -0.3,
            hrvNightlyZ = listOf(-0.2, -0.1),
            rrNightlyZ = listOf(2.1, 2.6),
            temperatureDeltaC = null,
            context = ok,
        )
        assertTrue(m.detected)
        assertTrue(m.alertAllowed)
        assertEquals(2.4, m.contributing.first { it.signal == PatternSignal.RESTING_HEART_RATE }.value, 1e-12)
    }

    @Test
    fun `MV01 from nightly series does not fire on a single unusual night`() {
        val m = MultiSignal.illnessLikePattern(
            rhrNightlyZ = listOf(0.0, 3.0),
            hrvWeeklyZ = -0.3,
            hrvNightlyZ = listOf(-0.2, -0.1),
            rrNightlyZ = listOf(0.0, 3.0),
            temperatureDeltaC = null,
            context = ok,
        )
        assertEquals(PatternOutcome.NOT_DETECTED, m.outcome)
    }

    @Test
    fun `MV01 from nightly series with an immature HRV baseline stays unknown`() {
        val m = MultiSignal.illnessLikePattern(
            rhrNightlyZ = listOf(2.5, 2.8), hrvWeeklyZ = null, hrvNightlyZ = emptyList(),
            rrNightlyZ = listOf(0.1, 0.2), temperatureDeltaC = null,
        )
        // RHR up, RR normal, HRV unknown: could still be two of three.
        assertEquals(PatternOutcome.INSUFFICIENT_DATA, m.outcome)
    }

    // ------------------------------------------------------------------------ other patterns

    private fun eval(spec: PatternSpec, vararg r: Pair<PatternSignal, Double?>, ctx: PatternContext = ok) =
        MultiSignal.evaluate(spec, mapOf(*r), ctx)

    @Test
    fun `MV02 short sleep with a higher resting heart rate or lower HRV`() {
        val a = eval(MultiSignal.MV02, PatternSignal.SLEEP_DURATION to -2.0, PatternSignal.RESTING_HEART_RATE to 1.6, PatternSignal.HRV_NIGHT to 0.0)
        assertTrue(a.detected)
        val b = eval(MultiSignal.MV02, PatternSignal.SLEEP_DURATION to -2.0, PatternSignal.RESTING_HEART_RATE to 0.0, PatternSignal.HRV_NIGHT to -1.5)
        assertTrue(b.detected)
        val c = eval(MultiSignal.MV02, PatternSignal.SLEEP_DURATION to -2.0, PatternSignal.RESTING_HEART_RATE to 0.0, PatternSignal.HRV_NIGHT to 0.0)
        assertEquals(PatternOutcome.NOT_DETECTED, c.outcome)
        val d = eval(MultiSignal.MV02, PatternSignal.SLEEP_DURATION to -2.0, PatternSignal.RESTING_HEART_RATE to 0.0)
        assertEquals(PatternOutcome.INSUFFICIENT_DATA, d.outcome)
    }

    @Test
    fun `exploratory patterns never raise an alert`() {
        val m = eval(MultiSignal.MV02, PatternSignal.SLEEP_DURATION to -2.0, PatternSignal.HRV_NIGHT to -2.0)
        assertTrue(m.detected)
        assertFalse(m.alertAllowed)
        assertEquals("shown as a learning card, not an alert", m.suppressionReason)
        assertNotNull(m.message)
    }

    @Test
    fun `MV03 late bedtime or low regularity then lower HRV`() {
        assertTrue(eval(MultiSignal.MV03, PatternSignal.BEDTIME to 1.8, PatternSignal.HRV_NIGHT to -1.7).detected)
        assertTrue(eval(MultiSignal.MV03, PatternSignal.SLEEP_REGULARITY to -1.6, PatternSignal.HRV_NIGHT to -1.7).detected)
        assertFalse(eval(MultiSignal.MV03, PatternSignal.BEDTIME to -1.8, PatternSignal.SLEEP_REGULARITY to 1.0, PatternSignal.HRV_NIGHT to -1.7).detected)
    }

    @Test
    fun `MV04 and MV05 against sleep efficiency`() {
        assertTrue(eval(MultiSignal.MV04, PatternSignal.STEPS to -1.5, PatternSignal.SLEEP_EFFICIENCY to -1.5).detected)
        assertTrue(eval(MultiSignal.MV04, PatternSignal.SEDENTARY_TIME to 2.0, PatternSignal.SLEEP_EFFICIENCY to -2.0).detected)
        assertFalse(eval(MultiSignal.MV04, PatternSignal.STEPS to -1.5, PatternSignal.SLEEP_EFFICIENCY to 0.0).detected)
        assertTrue(eval(MultiSignal.MV05, PatternSignal.EVENING_ACTIVITY to 2.0, PatternSignal.SLEEP_EFFICIENCY to -2.0).detected)
        assertTrue(MultiSignal.MV05.interpretation.contains("unrelated"))
    }

    @Test
    fun `MV07 temperature uses degrees and needs a higher resting heart rate`() {
        assertTrue(eval(MultiSignal.MV07, PatternSignal.SLEEP_TEMPERATURE_DELTA_C to 0.3, PatternSignal.RESTING_HEART_RATE to 1.5).detected)
        assertFalse(eval(MultiSignal.MV07, PatternSignal.SLEEP_TEMPERATURE_DELTA_C to 0.29, PatternSignal.RESTING_HEART_RATE to 3.0).detected)
        assertFalse(eval(MultiSignal.MV07, PatternSignal.SLEEP_TEMPERATURE_DELTA_C to 0.5, PatternSignal.RESTING_HEART_RATE to 0.0).detected)
    }

    @Test
    fun `MV08 training load with a recovery signal and short sleep listed`() {
        val m = eval(
            MultiSignal.MV08,
            PatternSignal.TRAINING_LOAD to 2.0, PatternSignal.RESTING_HEART_RATE to 0.2,
            PatternSignal.HRV_NIGHT to -1.6, PatternSignal.SLEEP_DURATION to -2.0,
        )
        assertTrue(m.detected)
        assertEquals(PatternMaturity.SUPPORTABLE, m.spec.maturity)
        assertEquals(listOf(PatternSignal.SLEEP_DURATION), m.supporting.map { it.signal })
        assertEquals(2, m.metCount)
        val noLoad = eval(MultiSignal.MV08, PatternSignal.TRAINING_LOAD to 0.0, PatternSignal.RESTING_HEART_RATE to 3.0)
        assertFalse(noLoad.detected)
    }

    @Test
    fun `MV09 needs the tag and carries the tag as one of its signals`() {
        val m = eval(MultiSignal.MV09, PatternSignal.TAG_ALCOHOL_OR_LATE_MEAL to 1.0, PatternSignal.HRV_NIGHT to -2.0)
        assertTrue(m.detected)
        assertTrue(PatternSignal.TAG_ALCOHOL_OR_LATE_MEAL in m.contributing.map { it.signal })
        assertFalse(eval(MultiSignal.MV09, PatternSignal.TAG_ALCOHOL_OR_LATE_MEAL to 0.0, PatternSignal.HRV_NIGHT to -2.0).detected)
        assertEquals(
            PatternOutcome.INSUFFICIENT_DATA,
            eval(MultiSignal.MV09, PatternSignal.TAG_ALCOHOL_OR_LATE_MEAL to null, PatternSignal.HRV_NIGHT to -2.0).outcome,
        )
    }

    @Test
    fun `MV10 and circadian disruption need every listed signal`() {
        val mv10 = eval(
            MultiSignal.MV10,
            PatternSignal.WEEKEND_SLEEP_SHIFT to 2.0, PatternSignal.STEPS to -2.0, PatternSignal.RESTING_HEART_RATE to 1.6,
        )
        assertTrue(mv10.detected)
        assertEquals(PatternOutcome.NOT_DETECTED, eval(
            MultiSignal.MV10,
            PatternSignal.WEEKEND_SLEEP_SHIFT to 2.0, PatternSignal.STEPS to -2.0, PatternSignal.RESTING_HEART_RATE to 0.0,
        ).outcome)

        val circadian = eval(
            MultiSignal.CIRCADIAN_DISRUPTION,
            PatternSignal.SLEEP_TIMING_VARIABILITY to 2.0, PatternSignal.SLEEP_DURATION to -1.5, PatternSignal.SEDENTARY_TIME to 1.5,
        )
        assertTrue(circadian.detected)
        assertEquals(3, circadian.contributing.size)
        assertEquals(PatternOutcome.NOT_DETECTED, eval(
            MultiSignal.CIRCADIAN_DISRUPTION,
            PatternSignal.SLEEP_TIMING_VARIABILITY to 2.0, PatternSignal.SLEEP_DURATION to 0.0,
            PatternSignal.SEDENTARY_TIME to 1.5, PatternSignal.STEPS to 0.0,
        ).outcome)
    }

    @Test
    fun `low activity with adequate sleep needs sleep to be about usual`() {
        val spec = MultiSignal.LOW_ACTIVITY_ADEQUATE_SLEEP
        val m = eval(spec, PatternSignal.STEPS to -2.0, PatternSignal.SLEEP_DURATION to 0.2)
        assertTrue(m.detected)
        assertEquals(Deviation.STABLE, m.contributing.last().rule.deviation)
        assertTrue(m.observation!!.contains("Sleep duration (about usual)"))
        assertTrue(eval(spec, PatternSignal.MVPA to -2.0, PatternSignal.SLEEP_DURATION to -0.99).detected)
        assertFalse(eval(spec, PatternSignal.STEPS to -2.0, PatternSignal.SLEEP_DURATION to -1.2).detected)
        assertFalse(eval(spec, PatternSignal.STEPS to -2.0, PatternSignal.SLEEP_DURATION to 1.0).detected)
        assertEquals(PatternOutcome.INSUFFICIENT_DATA, eval(spec, PatternSignal.STEPS to -2.0).outcome)
        // Sleep missing is not "stable".
        assertEquals(PatternOutcome.INSUFFICIENT_DATA, eval(spec, PatternSignal.STEPS to -2.0, PatternSignal.SLEEP_DURATION to null).outcome)
    }

    // ----------------------------------------------------------------------------- wording

    @Test
    fun `every pattern is hedged and none is diagnostic`() {
        val forbidden = listOf(
            "you are ill", "you are sick", "you have ", "infection", "infected", "covid", "flu ", "influenza",
            "disease", "diagnosed", "apnoea", "apnea", "fever", "dangerous", "you will",
        )
        assertEquals(MultiSignal.all.size, MultiSignal.all.map { it.id }.toSet().size)
        for (spec in MultiSignal.all) {
            val text = (spec.title + " " + spec.interpretation + " " + spec.suggestion).lowercase()
            assertTrue(" may " in " ${spec.interpretation.lowercase()} ", "${spec.id} interpretation must hedge")
            for (word in forbidden) {
                // MV07 says outright that this is not a fever reading.
                if (spec.id == "MV07" && word == "fever") continue
                assertFalse(word in text, "${spec.id} contains '$word'")
            }
        }
    }

    @Test
    fun `the message always ends with the not-a-diagnosis line`() {
        val m = mv01(rhr = 3.0, rr = 3.0)
        assertTrue(m.message!!.endsWith(MultiSignal.NOT_A_DIAGNOSIS))
        assertEquals("This is not a diagnosis.", MultiSignal.NOT_A_DIAGNOSIS)
    }

    @Test
    fun `MV06 is not built`() {
        assertFalse(MultiSignal.all.any { it.id == "MV06" })
        assertFalse(PatternSignal.entries.any { it.name.contains("SPO2") || it.name.contains("DESAT") })
    }

    @Test
    fun `only MV01 is alert eligible`() {
        assertEquals(listOf("MV01"), MultiSignal.all.filter { it.alertEligible }.map { it.id })
    }

    @Test
    fun `exploratory z reuses the fatigue detector constant`() {
        assertEquals(FatigueSignalDetector.ACUTE_Z, MultiSignal.EXPLORATORY_Z, 0.0)
    }

    // ---------------------------------------------------------------------------- validation

    @Test
    fun `specs and rules reject nonsense`() {
        assertFailsWith<IllegalArgumentException> { SignalRule(PatternSignal.STEPS, Deviation.LOWER, 0.0) }
        assertFailsWith<IllegalArgumentException> { Criterion("none", emptyList()) }
        val crit = Criterion("x", listOf(SignalRule(PatternSignal.STEPS, Deviation.LOWER, 1.0)))
        assertFailsWith<IllegalArgumentException> {
            PatternSpec("X", "t", listOf(crit), 2, PatternMaturity.EXPLORATORY, "C", "may", "s", "src")
        }
        assertFailsWith<IllegalArgumentException> {
            PatternSpec("X", "t", listOf(crit), 0, PatternMaturity.EXPLORATORY, "C", "may", "s", "src")
        }
    }

    @Test
    fun `rule check semantics`() {
        val higher = SignalRule(PatternSignal.RESTING_HEART_RATE, Deviation.HIGHER, 2.0)
        val lower = SignalRule(PatternSignal.HRV_NIGHT, Deviation.LOWER, 1.5)
        val stable = SignalRule(PatternSignal.SLEEP_DURATION, Deviation.STABLE, 1.0)
        assertEquals(true, higher.check(2.0))
        assertEquals(false, higher.check(1.9))
        assertEquals(true, lower.check(-1.5))
        assertEquals(false, lower.check(-1.4))
        assertEquals(true, stable.check(0.99))
        assertEquals(false, stable.check(-1.0))
        assertNull(higher.check(null))
        assertNull(higher.check(Double.NaN))
    }
}
