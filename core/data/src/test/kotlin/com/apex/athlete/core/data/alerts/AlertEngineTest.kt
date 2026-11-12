package com.apex.athlete.core.data.alerts

import com.apex.athlete.core.analytics.recovery.FatigueLevel
import com.apex.athlete.core.analytics.recovery.FatigueSignal
import com.apex.athlete.core.data.alerts.AlertEngine.decide
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class AlertEngineTest {
    private val zone = ZoneId.of("Europe/London")
    private fun at(h: Int, m: Int = 0, day: Int = 10) = ZonedDateTime.of(2026, 11, day, h, m, 0, 0, zone).toInstant().toEpochMilli()
    private fun dayOf(ms: Long) = Instant.ofEpochMilli(ms).atZone(zone).toLocalDate().toEpochDay()
    private val now = at(12)
    private val prefs = AlertPrefs(notificationsEnabled = true)
    private fun signals(pct: Int? = 50, final: Boolean = true, level: FatigueLevel = FatigueLevel.NONE, sig: Set<FatigueSignal> = emptySet(), days: Int = 0, day: Long = dayOf(now)) =
        AlertSignals(day, pct, final, level, sig, days)
    private fun input(s: AlertSignals? = signals(), last: Long? = now - 3_600_000, n: Long = now, p: AlertPrefs = prefs, demo: Boolean = false, ledger: AlertLedger = emptyMap()) =
        AlertInput(s, last, n, zone, demo, p, ledger)
    private fun types(i: AlertInput) = decide(i).raise.map { it.type }

    @Test fun ruleTable() {
        assertEquals(emptyList(), types(input()))
        assertEquals(listOf(AlertType.RECOVERY_LOW), types(input(signals(pct = 33))))
        assertEquals(emptyList(), types(input(signals(pct = 34))))
        assertEquals(emptyList(), types(input(signals(pct = 20, final = false))))
        assertEquals(emptyList(), types(input(signals(pct = null))))
        assertEquals(emptyList(), types(input(signals(pct = 10, day = dayOf(now) - 1))))
        val acute = setOf(FatigueSignal.HRV_ACUTE_DROP, FatigueSignal.RESTING_HR_ELEVATED)
        assertEquals(listOf(AlertType.FATIGUE_SIGNAL), types(input(signals(sig = acute, level = FatigueLevel.ELEVATED))))
        assertEquals(emptyList(), types(input(signals(sig = setOf(FatigueSignal.HRV_ACUTE_DROP), level = FatigueLevel.WATCH))))
        assertEquals(listOf(AlertType.FATIGUE_SIGNAL), types(input(signals(level = FatigueLevel.HIGH, days = 3))))
        assertEquals(emptyList(), types(input(last = now - 36 * 3_600_000)))
        assertEquals(listOf(AlertType.DATA_STALE), types(input(last = now - 36 * 3_600_000 - 1)))
        assertEquals(emptyList(), types(input(last = null)))
        assertEquals(listOf(AlertType.TAKEOUT_NUDGE), types(input(p = prefs.copy(takeoutNudgeDays = 30, lastTakeoutImportMillis = now - 31L * 86_400_000))))
        assertEquals(emptyList(), types(input(p = prefs.copy(takeoutNudgeDays = 30, lastTakeoutImportMillis = now - 29L * 86_400_000))))
        assertEquals(emptyList(), types(input(p = prefs.copy(takeoutNudgeDays = 0, lastTakeoutImportMillis = 1))))
    }

    @Test fun togglesDemoAndMasterSwitch() {
        val bad = input(signals(pct = 10), last = now - 100 * 3_600_000)
        assertEquals(setOf(AlertType.RECOVERY_LOW, AlertType.DATA_STALE), types(bad).toSet())
        assertEquals(listOf(AlertType.DATA_STALE), types(bad.copy(prefs = prefs.copy(notifyRecovery = false))))
        assertEquals(listOf(AlertType.RECOVERY_LOW), types(bad.copy(prefs = prefs.copy(notifyStale = false))))
        assertEquals(emptyList(), types(bad.copy(demoMode = true)))
        assertEquals(emptyList(), types(bad.copy(prefs = prefs.copy(notificationsEnabled = false))))
        val f = input(signals(level = FatigueLevel.HIGH))
        assertEquals(emptyList(), types(f.copy(prefs = prefs.copy(notifyFatigue = false))))
    }

    @Test fun quietHoursAcrossMidnight() {
        val q = AlertPrefs(quietStartMinute = 22 * 60, quietEndMinute = 7 * 60)
        fun quiet(h: Int, m: Int = 0) = AlertEngine.isQuietTime(at(h, m), zone, q.quietStartMinute, q.quietEndMinute)
        assertTrue(quiet(23)); assertTrue(quiet(0)); assertTrue(quiet(6, 59)); assertTrue(quiet(22))
        assertEquals(false, quiet(7)); assertEquals(false, quiet(12)); assertEquals(false, quiet(21, 59))
        assertEquals(false, AlertEngine.isQuietTime(at(3), zone, 600, 600))
        assertTrue(AlertEngine.isQuietTime(at(13), zone, 12 * 60, 14 * 60)) // same-day window
        val d = decide(input(signals(pct = 10), n = at(23), last = at(22), p = prefs.copy(quietStartMinute = 22 * 60, quietEndMinute = 7 * 60)).let { it.copy(signals = signals(pct = 10, day = dayOf(at(23)))) })
        assertEquals(emptyList(), d.raise)
        assertEquals(listOf(AlertType.RECOVERY_LOW), d.heldForQuietHours.map { it.type })
    }

    @Test fun dedupePerTypePerDay() {
        val i = input(signals(pct = 10), last = now - 100 * 3_600_000)
        val first = decide(i).raise
        assertEquals(2, first.size)
        val ledger = first.associate { it.type to it.epochDay }
        assertEquals(emptyList(), decide(i.copy(ledger = ledger)).raise)
        assertEquals(listOf(AlertType.DATA_STALE), decide(i.copy(ledger = mapOf(AlertType.RECOVERY_LOW to dayOf(now)))).raise.map { it.type })
        // next day the same type may fire again
        val tomorrow = i.copy(nowMillis = now + 86_400_000, signals = signals(pct = 10, day = dayOf(now) + 1), ledger = ledger)
        assertTrue(decide(tomorrow).raise.any { it.type == AlertType.RECOVERY_LOW })
    }

    private val banned = listOf("sick", "ill ", "illness", "infect", "disease", "diagnos", "covid", "flu", "fever", "virus", "condition", "you have", "you are ")

    @Test fun wordingIsCalmAndNumeralsComeFromInput() {
        val all = decide(
            input(
                signals(pct = 12, sig = setOf(FatigueSignal.HRV_ACUTE_DROP, FatigueSignal.RESPIRATORY_RATE_ELEVATED), level = FatigueLevel.HIGH, days = 4),
                last = now - 50 * 3_600_000, p = prefs.copy(takeoutNudgeDays = 14, lastTakeoutImportMillis = now - 20L * 86_400_000),
            ),
        ).raise
        assertEquals(4, all.size)
        val expected = mapOf(AlertType.RECOVERY_LOW to listOf("12"), AlertType.FATIGUE_SIGNAL to listOf("4"), AlertType.DATA_STALE to listOf("50"), AlertType.TAKEOUT_NUDGE to listOf("20"))
        for (a in all) {
            assertEquals(expected.getValue(a.type), a.numbers)
            val digits = Regex("""\d+""").findAll(a.title + " " + a.body).map { it.value }.toList()
            assertEquals(a.numbers, digits, "every numeral in the text is a declared slot")
            val text = (a.title + " " + a.body).lowercase() + " "
            banned.forEach { assertTrue(it !in text, "'$it' in ${a.type}") }
            assertTrue(a.lockScreenText.none { it.isDigit() })
        }
        val calm = decide(input(signals(sig = setOf(FatigueSignal.HRV_ACUTE_DROP, FatigueSignal.RESTING_HR_ELEVATED), level = FatigueLevel.ELEVATED))).raise.single()
        assertEquals("Your readings look unlike your usual range. Consider an easy day.", calm.body)
    }

    @Test fun morningDelay() {
        assertEquals(30L * 60_000, AlertEngine.delayUntilNextMorning(at(8), zone))
        assertEquals(24L * 3_600_000 - 30 * 60_000, AlertEngine.delayUntilNextMorning(at(9), zone))
    }
}
