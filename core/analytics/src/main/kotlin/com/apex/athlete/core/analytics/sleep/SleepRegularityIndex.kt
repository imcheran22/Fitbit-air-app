package com.apex.athlete.core.analytics.sleep

/**
 * A stretch of sleep (a main sleep or a nap) on the local wall clock, in whole minutes since the
 * local epoch (the local date's epoch day * 1440 plus the minute of day). Using the clock the
 * sleeper lived by keeps regularity about habits: a night that started at 23:00 abroad is 23:00.
 */
data class SleepSpan(val startLocalMinute: Long, val endLocalMinute: Long)

/**
 * @property index Sleep Regularity Index, -100..100; null when fewer than [SleepRegularityIndex.MIN_PAIRS] day pairs exist.
 * @property minutePairs number of minute pairs compared (1440 per usable pair of consecutive windows).
 */
data class SleepRegularity(val index: Double?, val minutePairs: Int)

/**
 * Sleep Regularity Index (formula version 3), after Phillips et al. 2017 (Sci Rep 7:3216; 61
 * undergraduates, 30 days of diaries and actigraphy; recalled and the abstract checked, the full text
 * not opened: unverified): every minute is asleep or awake, and
 *
 *   SRI = -100 + 200 * P(same state at t and t + 24 h)
 *
 * over the minute pairs of consecutive days. 100 is the same minutes every day, 0 is chance, and
 * -100 is the opposite pattern. Naps count as sleep. Windows run from local noon to local noon so
 * that a night is never split. A window flagged not covered (no night recorded: band off) is skipped
 * together with its pairs; it is never counted as awake.
 */
object SleepRegularityIndex {
    const val MINUTES_PER_DAY = 1440
    private const val NOON = 720L

    /** Usable consecutive-window pairs needed for an index (*calibration*; two comparisons at least). */
    const val MIN_PAIRS = 2

    /**
     * @param spans every sleep span in or around the window (main sleeps and naps).
     * @param firstWindowDay civil day d whose noon starts the first window; window i runs from noon of
     *   d + i to noon of d + i + 1.
     * @param covered one flag per window: true when that window has recorded sleep data.
     */
    fun compute(spans: List<SleepSpan>, firstWindowDay: Long, covered: List<Boolean>): SleepRegularity {
        val windows = covered.size
        if (windows < 2) return SleepRegularity(null, 0)
        val origin = firstWindowDay * MINUTES_PER_DAY + NOON
        val total = windows * MINUTES_PER_DAY
        val asleep = BooleanArray(total)
        for (s in spans) {
            if (s.endLocalMinute <= s.startLocalMinute) continue
            val from = (s.startLocalMinute - origin).coerceIn(0L, total.toLong()).toInt()
            val to = (s.endLocalMinute - origin).coerceIn(0L, total.toLong()).toInt()
            for (m in from until to) asleep[m] = true
        }
        var same = 0
        var pairs = 0
        var usable = 0
        for (w in 0 until windows - 1) {
            if (!covered[w] || !covered[w + 1]) continue
            usable++
            val base = w * MINUTES_PER_DAY
            for (m in 0 until MINUTES_PER_DAY) {
                pairs++
                if (asleep[base + m] == asleep[base + MINUTES_PER_DAY + m]) same++
            }
        }
        if (usable < MIN_PAIRS) return SleepRegularity(null, pairs)
        return SleepRegularity(-100.0 + 200.0 * same / pairs, pairs)
    }

    /** The consistency sub-score: the index limited to 0..100 (*calibration*; a negative index scores 0). */
    fun subScore(index: Double?): Double? = index?.takeIf { it.isFinite() }?.coerceIn(0.0, 100.0)
}
