package com.apex.athlete.core.data.export

import com.apex.athlete.core.data.model.HeartRatePoint
import kotlin.math.roundToLong

/**
 * Turns a stored one-minute heart-rate bucket back into readings for the ingestor, which only
 * accepts readings and folds them into minutes itself.
 *
 * The readings reproduce the bucket's count, minimum and maximum exactly and its average to within
 * half a beat divided by the count (readings are whole beats, so that is the most a whole-number
 * set can do). A bucket of one reading is that reading. This is why importing the same file twice
 * gives the same rows: the same bucket always expands to the same readings.
 */
object HeartRateMinuteExpansion {
    const val MAX_SAMPLES_PER_MINUTE = 120

    fun expand(minuteStartMillis: Long, avg: Double, min: Int, max: Int, n: Int): List<HeartRatePoint> {
        require(n in 1..MAX_SAMPLES_PER_MINUTE) { "sample count out of range" }
        if (n == 1) {
            val v = if (min == max) min else avg.roundToLong().toInt()
            return listOf(HeartRatePoint(minuteStartMillis, v))
        }
        val values = ArrayList<Int>(n)
        values += min
        values += max
        val k = n - 2
        if (k > 0) {
            val wanted = avg.times(n).roundToLong() - min - max
            val total = wanted.coerceIn(k.toLong() * min, k.toLong() * max)
            val base = Math.floorDiv(total, k.toLong())
            val extra = (total - base * k).toInt()
            for (i in 0 until k) values += (if (i < extra) base + 1 else base).toInt()
        }
        val step = 59_000L / n
        return values.mapIndexed { i, v -> HeartRatePoint(minuteStartMillis + i * step, v) }
    }
}
