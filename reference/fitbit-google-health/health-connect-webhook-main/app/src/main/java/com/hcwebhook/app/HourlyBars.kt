package com.hcwebhook.app

/** Webhook deliveries in one hour of the activity bars. */
data class HourBar(val sent: Int, val failed: Int) {
    val total: Int get() = sent + failed
}

/**
 * Deliveries ([time] ms, success) per hour for the 24 hours that end with the hour of [now],
 * oldest first. The last bar is the current, still running hour.
 */
fun hourlyBars(events: List<Pair<Long, Boolean>>, now: Long): List<HourBar> {
    val hour = 60 * 60 * 1000L
    val end = (now / hour + 1) * hour
    val start = end - 24 * hour
    val sent = IntArray(24)
    val failed = IntArray(24)
    events.forEach { (time, ok) ->
        val index = ((time - start) / hour).toInt()
        if (time >= start && index in 0..23) {
            if (ok) sent[index]++ else failed[index]++
        }
    }
    return List(24) { HourBar(sent[it], failed[it]) }
}
