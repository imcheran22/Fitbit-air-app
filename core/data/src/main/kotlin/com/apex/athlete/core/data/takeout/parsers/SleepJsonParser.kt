package com.apex.athlete.core.data.takeout.parsers

import com.apex.athlete.core.data.model.SleepObservation
import com.apex.athlete.core.data.model.SleepStageObservation
import com.apex.athlete.core.data.takeout.TakeoutClock
import com.apex.athlete.core.data.takeout.TakeoutTimestamps
import com.apex.athlete.core.domain.SleepStage
import java.io.Reader
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * Classic layout `sleep-YYYY-MM-DD.json`: an array of sleep logs, each with `logId`, `startTime`,
 * `endTime` (ISO-8601 without offset), `duration` (ms), the minute summaries, `mainSleep`, and
 * `levels.data` / `levels.shortData` segments of `{dateTime, level, seconds}` (UNVERIFIED).
 *
 * Time handling, the part that goes wrong silently:
 * - start and end are resolved together. When clocks go back, one of them can be read two ways;
 *   the reading whose length matches the log's own `duration` is the right one.
 * - each stage segment is resolved next to where the previous one ended, so a night that crosses a
 *   clock change keeps its segments in order and inside the session.
 * - `shortData` holds brief awakenings that lie on top of the longer segments; they are cut out of
 *   the stage underneath so deep, REM and light minutes are not overstated.
 *
 * Each log is read into a small tree (a night is a few hundred values) with a hard cap, then
 * mapped with tolerant accessors: unknown fields and unknown stage names are ignored.
 */
class SleepJsonParser(reader: Reader, private val clock: TakeoutClock) : TakeoutEntryParser {
    override val stats = TakeoutParseStats()
    private val json = JsonTokenReader(reader)
    private var started = false
    private var done = false

    override fun readInto(out: TakeoutRowBuffer, maxRows: Int): Boolean {
        if (done) return false
        try {
            if (!started) {
                started = true
                if (json.peek() != JsonTokenReader.Token.BEGIN_ARRAY) {
                    stats.schemaMismatch = true
                    done = true
                    return false
                }
                json.beginArray()
            }
            while (out.size < maxRows) {
                if (!json.hasNext()) {
                    done = true
                    return false
                }
                stats.rowsRead++
                val log = json.readTree().asObject()
                val observation = log?.let(::toObservation)
                if (observation == null) {
                    stats.quarantined++
                } else {
                    out.sleeps += observation
                    stats.rowsEmitted++
                    stats.span(observation.startEpochMillis)
                    stats.span(observation.endEpochMillis)
                }
            }
            return true
        } catch (e: MalformedJsonException) {
            stats.abortedMidStream = true
            done = true
            return false
        }
    }

    private class Segment(val start: Long, val end: Long, val stage: SleepStage)

    private fun toObservation(log: Map<String, Any?>): SleepObservation? {
        val startStamp = TakeoutTimestamps.parse(log.text("startTime")) ?: return null
        val endStamp = TakeoutTimestamps.parse(log.text("endTime"))
        val duration = log.number("duration")?.takeIf { it > 0 }?.toLong()

        val start: Long
        val end: Long
        if (endStamp != null) {
            var best: LongArray? = null
            var bestError = Long.MAX_VALUE
            for (s in clock.candidates(startStamp)) {
                for (e in clock.candidates(endStamp)) {
                    if (e <= s) continue
                    val error = if (duration != null) abs((e - s) - duration) else 0L
                    if (error < bestError) {
                        bestError = error
                        best = longArrayOf(s, e)
                    }
                }
            }
            if (best == null) return null
            start = best[0]
            end = best[1]
        } else {
            if (duration == null) return null
            start = clock.candidates(startStamp)[0]
            end = start + duration
        }

        val levels = log["levels"].asObject()
        val long = segments(levels?.get("data").asArray(), start)
        val short = segments(levels?.get("shortData").asArray(), start)
        val stages = carve(long, short).map { SleepStageObservation(it.start, it.end, it.stage) }

        val main = log.flag("mainSleep") ?: log.flag("isMainSleep")
        val logId = log.text("logId")?.trim()?.takeIf { it.isNotEmpty() && it.length <= 40 }
        return SleepObservation(
            id = "takeout:sleep:" + (logId ?: start.toString()),
            startEpochMillis = start,
            endEpochMillis = end,
            startZoneOffsetSeconds = clock.offsetSecondsAt(start),
            endZoneOffsetSeconds = clock.offsetSecondsAt(end),
            isMainSleep = main,
            isNap = main?.not(),
            minutesAsleep = minutes(log, "minutesAsleep"),
            minutesAwake = minutes(log, "minutesAwake"),
            minutesToFallAsleep = minutes(log, "minutesToFallAsleep"),
            stages = stages,
        )
    }

    private fun minutes(log: Map<String, Any?>, key: String): Int? =
        log.number(key)?.takeIf { it >= 0 && it <= 2 * 24 * 60 }?.roundToInt()

    private fun segments(raw: List<Any?>?, sessionStart: Long): List<Segment> {
        if (raw == null) return emptyList()
        val out = ArrayList<Segment>(raw.size)
        var expected = sessionStart
        for (item in raw) {
            val o = item.asObject() ?: continue
            val stamp = TakeoutTimestamps.parse(o.text("dateTime")) ?: continue
            val seconds = o.number("seconds")?.takeIf { it > 0 && it <= 2 * 24 * 3600 } ?: continue
            val segmentStart = clock.toEpochMillisNear(stamp, expected)
            val segmentEnd = segmentStart + (seconds * 1000).toLong()
            expected = segmentEnd
            val stage = stageOf(o.text("level")) ?: continue
            out += Segment(segmentStart, segmentEnd, stage)
        }
        out.sortBy { it.start }
        return out
    }

    private fun stageOf(level: String?): SleepStage? = when (level?.trim()?.lowercase()) {
        "deep" -> SleepStage.DEEP
        "light" -> SleepStage.LIGHT
        "rem" -> SleepStage.REM
        "wake", "awake" -> SleepStage.AWAKE
        "asleep" -> SleepStage.ASLEEP
        "restless" -> SleepStage.RESTLESS
        else -> null
    }

    /** Cuts the short awakenings out of the longer segments they overlap. */
    private fun carve(long: List<Segment>, short: List<Segment>): List<Segment> {
        if (short.isEmpty() || long.isEmpty()) return long
        val out = ArrayList<Segment>(long.size + 2 * short.size)
        for (segment in long) {
            if (!segment.stage.isAsleep) {
                out += segment
                continue
            }
            var cursor = segment.start
            for (wake in short) {
                if (wake.end <= cursor) continue
                if (wake.start >= segment.end) break
                val from = maxOf(wake.start, cursor)
                val to = minOf(wake.end, segment.end)
                if (to <= from) continue
                if (from > cursor) out += Segment(cursor, from, segment.stage)
                out += Segment(from, to, SleepStage.AWAKE)
                cursor = to
            }
            if (cursor < segment.end) out += Segment(cursor, segment.end, segment.stage)
        }
        return out
    }
}
