package com.apex.athlete.core.data.takeout

import java.time.DateTimeException
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset

/**
 * A timestamp as it was written in a file: the clock fields, and the UTC offset when the text
 * carried one. Turning it into an instant is a separate, explicit step ([TakeoutClock]).
 */
class ParsedTimestamp(
    val local: LocalDateTime,
    /** Offset written in the text (`Z` is 0); null when the text had none. */
    val offsetSeconds: Int?,
) {
    /** The calendar date exactly as written. Daily summary files use this and nothing else. */
    val literalDate: LocalDate get() = local.toLocalDate()
}

/**
 * Tolerant parser for the timestamp shapes reported in Fitbit exports:
 *
 * - `MM/dd/yy HH:mm:ss` and `MM/dd/yyyy HH:mm:ss` (seconds optional, time optional)
 * - ISO-8601 `yyyy-MM-dd`, `yyyy-MM-ddTHH:mm[:ss[.fraction]]`, a space instead of `T`, and an
 *   optional `Z`, `+HH:mm`, `+HHmm` or `+HH` offset
 *
 * Anything else returns null and the row is quarantined. Written by hand rather than with
 * `DateTimeFormatter` because it runs once per row on files with hundreds of thousands of rows.
 */
object TakeoutTimestamps {

    fun parse(raw: String?): ParsedTimestamp? {
        if (raw == null) return null
        val text = raw.trim().trim('"').trim()
        if (text.length < 6 || text.length > 40) return null
        return try {
            val firstSeparator = text.indexOfFirst { it == '/' || it == '-' }
            when {
                firstSeparator in 1..2 && text[firstSeparator] == '/' -> parseUsStyle(text)
                firstSeparator == 4 && text[firstSeparator] == '-' -> parseIso(text)
                else -> null
            }
        } catch (_: DateTimeException) {
            null
        } catch (_: NumberFormatException) {
            null
        }
    }

    private class Cursor(val s: String) {
        var i = 0
        val atEnd: Boolean get() = i >= s.length

        fun peek(): Char = if (atEnd) '\u0000' else s[i]

        /** Reads between [min] and [max] ASCII digits; -1 when there are fewer than [min]. */
        fun digits(min: Int, max: Int): Int {
            var n = 0
            var value = 0
            while (n < max && i < s.length && s[i] in '0'..'9') {
                value = value * 10 + (s[i] - '0')
                i++
                n++
            }
            return if (n < min) -1 else value
        }

        fun accept(c: Char): Boolean = if (!atEnd && s[i] == c) { i++; true } else false
    }

    private fun parseUsStyle(text: String): ParsedTimestamp? {
        val c = Cursor(text)
        val month = c.digits(1, 2)
        if (month < 0 || !c.accept('/')) return null
        val day = c.digits(1, 2)
        if (day < 0 || !c.accept('/')) return null
        val yearStart = c.i
        var year = c.digits(2, 4)
        if (year < 0) return null
        val yearDigits = c.i - yearStart
        if (yearDigits == 3) return null
        if (yearDigits == 2) year += 2000
        val time = if (c.atEnd) IntArray(4) else parseTime(c) ?: return null
        if (!c.atEnd) return null
        return ParsedTimestamp(LocalDateTime.of(year, month, day, time[0], time[1], time[2], time[3]), null)
    }

    private fun parseIso(text: String): ParsedTimestamp? {
        val c = Cursor(text)
        val year = c.digits(4, 4)
        if (year < 0 || !c.accept('-')) return null
        val month = c.digits(2, 2)
        if (month < 0 || !c.accept('-')) return null
        val day = c.digits(2, 2)
        if (day < 0) return null
        if (c.atEnd) return ParsedTimestamp(LocalDateTime.of(year, month, day, 0, 0), null)
        val time = parseTime(c) ?: return null
        var offset: Int? = null
        if (!c.atEnd) {
            offset = parseOffset(c) ?: return null
            if (!c.atEnd) return null
        }
        return ParsedTimestamp(LocalDateTime.of(year, month, day, time[0], time[1], time[2], time[3]), offset)
    }

    /** Reads `[T| ]HH:mm[:ss[.fraction]]`; returns hour, minute, second, nanosecond. */
    private fun parseTime(c: Cursor): IntArray? {
        if (!c.accept('T') && !c.accept(' ') && !c.accept('t')) return null
        while (c.accept(' ')) Unit
        val hour = c.digits(1, 2)
        if (hour < 0 || !c.accept(':')) return null
        val minute = c.digits(2, 2)
        if (minute < 0) return null
        var second = 0
        var nano = 0
        if (c.accept(':')) {
            second = c.digits(2, 2)
            if (second < 0) return null
            if (c.accept('.') || c.accept(',')) {
                var scale = 100_000_000
                var any = false
                while (!c.atEnd && c.peek() in '0'..'9') {
                    nano += (c.peek() - '0') * scale
                    scale /= 10
                    c.i++
                    any = true
                }
                if (!any) return null
            }
        }
        return intArrayOf(hour, minute, second, nano)
    }

    private fun parseOffset(c: Cursor): Int? {
        while (c.accept(' ')) Unit
        if (c.accept('Z') || c.accept('z')) return 0
        val sign = when {
            c.accept('+') -> 1
            c.accept('-') -> -1
            else -> return null
        }
        val hours = c.digits(2, 2)
        if (hours < 0 || hours > 18) return null
        c.accept(':')
        val minutes = if (c.atEnd) 0 else c.digits(2, 2)
        if (minutes < 0 || minutes > 59) return null
        return sign * (hours * 3600 + minutes * 60)
    }
}

/**
 * Turns the timestamps of one file into instants under one explicit [ZoneRule].
 *
 * One instance per file, because local wall-clock times are ambiguous for an hour when clocks go
 * back, and the only way to tell the two passes through that hour apart is the order of the rows:
 * a time that would run backwards belongs to the second pass. Times that do not exist (the hour
 * skipped when clocks go forward) are moved forward by the length of the gap.
 */
class TakeoutClock(val rule: ZoneRule, val localZone: ZoneId) {
    private val rules = localZone.rules
    private var previous = NO_PREVIOUS

    /** Number of timestamps resolved through [rule], i.e. written without an offset. */
    var ruleApplied = 0L
        private set

    /** For a time series in file order. */
    fun toEpochMillis(t: ParsedTimestamp): Long {
        val millis = resolve(t) { earlier, later -> if (earlier >= previous - ORDER_SLACK_MS) earlier else later }
        if (millis > previous) previous = millis
        return millis
    }

    /** For a timestamp whose approximate instant is known from context (a span's other end, the previous segment). */
    fun toEpochMillisNear(t: ParsedTimestamp, expectedEpochMillis: Long): Long =
        resolve(t) { earlier, later ->
            if (kotlin.math.abs(earlier - expectedEpochMillis) <= kotlin.math.abs(later - expectedEpochMillis)) earlier else later
        }

    /** Both readings of an ambiguous local time (one element when it is not ambiguous). */
    fun candidates(t: ParsedTimestamp): LongArray {
        if (t.offsetSeconds != null || rule == ZoneRule.UTC) return longArrayOf(resolve(t) { earlier, _ -> earlier })
        val offsets = rules.getValidOffsets(t.local)
        return if (offsets.size == 2) longArrayOf(at(t.local, offsets[0]), at(t.local, offsets[1])) else longArrayOf(resolve(t) { e, _ -> e })
    }

    /** UTC offset of [localZone] at an instant, for records that keep their local clock time. */
    fun offsetSecondsAt(epochMillis: Long): Int = rules.getOffset(Instant.ofEpochMilli(epochMillis)).totalSeconds

    private inline fun resolve(t: ParsedTimestamp, choose: (earlier: Long, later: Long) -> Long): Long {
        t.offsetSeconds?.let { return at(t.local, ZoneOffset.ofTotalSeconds(it)) }
        ruleApplied++
        if (rule == ZoneRule.UTC) return at(t.local, ZoneOffset.UTC)
        val offsets = rules.getValidOffsets(t.local)
        return when (offsets.size) {
            1 -> at(t.local, offsets[0])
            // Skipped hour: reading the time with the offset before the change moves it forward by the gap.
            0 -> at(t.local, rules.getTransition(t.local).offsetBefore)
            else -> choose(at(t.local, offsets[0]), at(t.local, offsets[1]))
        }
    }

    private fun at(local: LocalDateTime, offset: ZoneOffset): Long =
        local.toEpochSecond(offset) * 1000L + local.nano / 1_000_000

    private companion object {
        /** Rows may be a little out of order without being taken for the second pass of a repeated hour. */
        const val ORDER_SLACK_MS = 10L * 60 * 1000

        /** Far in the past, and far enough from Long.MIN_VALUE that subtracting the slack cannot overflow. */
        const val NO_PREVIOUS = Long.MIN_VALUE / 2
    }
}

/** Number parsing shared by the parsers: plain decimals, optional decimal comma, never NaN or infinity. */
internal object TakeoutNumbers {
    fun parse(text: String?, decimalComma: Boolean = false): Double? {
        if (text == null) return null
        var s = text.trim()
        if (s.isEmpty() || s.length > 40) return null
        if (decimalComma && s.indexOf(',') >= 0 && s.indexOf('.') < 0) s = s.replace(',', '.')
        val c = s[0]
        if (!(c in '0'..'9' || c == '-' || c == '+' || c == '.')) return null
        return s.toDoubleOrNull()?.takeIf { it.isFinite() }
    }
}
