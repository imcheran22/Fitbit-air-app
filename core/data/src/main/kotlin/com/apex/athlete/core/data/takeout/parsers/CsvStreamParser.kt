package com.apex.athlete.core.data.takeout.parsers

import java.io.Reader

/**
 * Streams a CSV file one record at a time.
 *
 * - Columns are found by **header name**, never by position: names are compared case-insensitively
 *   after punctuation and spaces are folded to `_`, unknown columns are ignored and any column
 *   order works ([column]).
 * - Quoted fields, doubled quotes and line breaks inside quotes follow RFC 4180. `\n`, `\r\n` and
 *   `\r` all end a record. A byte-order mark is ignored.
 * - The delimiter is taken from the header line (`,`, `;` or tab), so an export written with a
 *   decimal-comma locale still parses; see [decimalComma].
 * - A record longer than [maxRecordChars] is consumed but not kept and is flagged [oversized], so
 *   one broken line cannot exhaust memory. The caller quarantines it.
 *
 * Only the current record is held in memory.
 */
class CsvStreamParser(private val input: Reader, private val maxRecordChars: Int = 65_536) {

    private val buffer = CharArray(8_192)
    private var pos = 0
    private var limit = 0
    private var endOfInput = false

    private val fields = ArrayList<String>()
    private val field = StringBuilder()

    /** Normalised header names in file order; empty when the file has no header line. */
    val header: List<String>

    var delimiter: Char = ','
        private set

    /** True when numbers in this file may use a decimal comma (the delimiter is not a comma). */
    val decimalComma: Boolean get() = delimiter != ','

    /** The current record did not fit in [maxRecordChars]; its fields are not available. */
    var oversized = false
        private set

    /** The current record ended inside an open quote (end of file reached). */
    var unterminatedQuote = false
        private set

    /** Records returned so far, not counting the header. */
    var recordNumber = 0L
        private set

    init {
        val line = readHeaderLine()
        if (line == null) {
            header = emptyList()
        } else {
            delimiter = detectDelimiter(line)
            header = splitLine(line).map(::normalise)
        }
    }

    /** Index of the first of [aliases] present in the header (aliases in normalised form), or -1. */
    fun column(vararg aliases: String): Int {
        for (alias in aliases) {
            val i = header.indexOf(alias)
            if (i >= 0) return i
        }
        return -1
    }

    /** Advances to the next non-blank record. False at the end of the file. */
    fun next(): Boolean {
        while (true) {
            if (!readRecord()) return false
            if (oversized || fields.size > 1 || fields[0].isNotEmpty()) {
                recordNumber++
                return true
            }
        }
    }

    /** Trimmed text of a column in the current record; null when the column is absent or the cell is empty. */
    fun get(index: Int): String? {
        if (index < 0 || index >= fields.size) return null
        return fields[index].trim().takeIf { it.isNotEmpty() }
    }

    // --- Reading ----------------------------------------------------------------------------------

    private fun read(): Int {
        if (pos >= limit) {
            if (endOfInput) return -1
            pos = 0
            limit = 0
            while (limit == 0) {
                val n = input.read(buffer, 0, buffer.size)
                if (n < 0) {
                    endOfInput = true
                    return -1
                }
                limit = n
            }
        }
        return buffer[pos++].code
    }

    private fun peekIs(c: Char): Boolean {
        if (pos >= limit) {
            val next = read()
            if (next < 0) return false
            pos--
        }
        return buffer[pos] == c
    }

    /** The header is read as one physical line (bounded), because the delimiter is not known yet. */
    private fun readHeaderLine(): String? {
        val sb = StringBuilder()
        var any = false
        while (true) {
            val c = read()
            if (c < 0) break
            any = true
            if (c == '\n'.code) break
            if (c == '\r'.code) {
                if (peekIs('\n')) pos++
                break
            }
            if (c == '\uFEFF'.code && sb.isEmpty()) continue
            if (sb.length < maxRecordChars) sb.append(c.toChar())
        }
        return if (any) sb.toString() else null
    }

    private fun detectDelimiter(line: String): Char {
        var commas = 0
        var semicolons = 0
        var tabs = 0
        var quoted = false
        for (c in line) {
            when {
                c == '"' -> quoted = !quoted
                quoted -> Unit
                c == ',' -> commas++
                c == ';' -> semicolons++
                c == '\t' -> tabs++
            }
        }
        return when {
            semicolons > commas && semicolons >= tabs -> ';'
            tabs > commas && tabs > semicolons -> '\t'
            else -> ','
        }
    }

    private fun splitLine(line: String): List<String> {
        val out = ArrayList<String>()
        val sb = StringBuilder()
        var quoted = false
        var i = 0
        while (i < line.length) {
            val c = line[i]
            when {
                quoted && c == '"' && i + 1 < line.length && line[i + 1] == '"' -> { sb.append('"'); i++ }
                c == '"' -> quoted = !quoted
                !quoted && c == delimiter -> { out += sb.toString(); sb.setLength(0) }
                else -> sb.append(c)
            }
            i++
        }
        out += sb.toString()
        return out
    }

    private fun readRecord(): Boolean {
        fields.clear()
        field.setLength(0)
        oversized = false
        unterminatedQuote = false
        var chars = 0
        // Characters met in the current field, counted even when the record is too long to keep;
        // a quote opens a quoted field only as the field's first character.
        var fieldChars = 0
        var quoted = false
        var any = false
        while (true) {
            val c = read()
            if (c < 0) {
                if (!any) return false
                unterminatedQuote = quoted
                break
            }
            any = true
            chars++
            if (chars > maxRecordChars && !oversized) {
                oversized = true
                fields.clear()
                field.setLength(0)
            }
            val ch = c.toChar()
            if (quoted) {
                if (ch == '"') {
                    if (peekIs('"')) {
                        pos++
                        if (!oversized) field.append('"')
                    } else {
                        quoted = false
                    }
                } else if (oversized && (ch == '\n' || ch == '\r')) {
                    // A quote that never closes would otherwise swallow the rest of the file as one
                    // record. Once the record is too long anyway, a line break ends it.
                    if (ch == '\r' && peekIs('\n')) pos++
                    break
                } else if (!oversized) {
                    field.append(ch)
                }
                fieldChars++
                continue
            }
            when (ch) {
                '"' -> {
                    if (fieldChars == 0) quoted = true else if (!oversized) field.append(ch)
                    fieldChars++
                }
                '\n' -> break
                '\r' -> {
                    if (peekIs('\n')) pos++
                    break
                }
                delimiter -> {
                    if (!oversized) {
                        fields += field.toString()
                        field.setLength(0)
                    }
                    fieldChars = 0
                }
                else -> {
                    if (!oversized) field.append(ch)
                    fieldChars++
                }
            }
        }
        if (oversized) {
            fields.clear()
        } else {
            fields += field.toString()
        }
        return true
    }

    companion object {
        /** `Daily SpO2 (%)` becomes `daily_spo2`; `beats per minute` becomes `beats_per_minute`. */
        fun normalise(name: String): String {
            val sb = StringBuilder(name.length)
            var pendingSeparator = false
            for (c in name.trim().trim('\uFEFF')) {
                if (c.isLetterOrDigit()) {
                    if (pendingSeparator && sb.isNotEmpty()) sb.append('_')
                    pendingSeparator = false
                    sb.append(c.lowercaseChar())
                } else {
                    pendingSeparator = true
                }
            }
            return sb.toString()
        }
    }
}
