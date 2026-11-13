package com.apex.athlete.recorder

/** Clock text for the screen and notification: m:ss under an hour, h:mm:ss from an hour. */
object RecorderFormat {
    fun clock(millis: Long): String {
        val total = (millis.coerceAtLeast(0L) / 1000)
        val h = total / 3600
        val m = (total % 3600) / 60
        val s = total % 60
        return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
    }
}
