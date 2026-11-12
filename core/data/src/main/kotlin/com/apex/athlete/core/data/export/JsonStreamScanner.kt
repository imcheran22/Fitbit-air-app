package com.apex.athlete.core.data.export

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import java.io.Reader

/** The file is not JSON, or ends in the middle of a value. */
class MalformedJsonException(message: String) : Exception(message)

/** One step of the top-level object: a small value (header field) or one element of a top-level array. */
internal sealed interface ScanToken {
    data class Field(val key: String, val value: JsonElement) : ScanToken
    data class Element(val key: String, val raw: String) : ScanToken
}

/**
 * Reads the top-level JSON object token by token so a file of any size is processed with flat
 * memory: array elements are handed over one at a time as raw text (decoded, or quarantined, by the
 * caller); every other top-level value is parsed and returned as a [ScanToken.Field].
 *
 * Only the structure is checked here (balanced brackets, terminated strings). A single array
 * element above [maxRawChars] is treated as damage, not buffered.
 */
internal class JsonStreamScanner(
    private val reader: Reader,
    private val maxRawChars: Int = 2_000_000,
    private val json: Json = Json,
) {
    private val buf = CharArray(16 * 1024)
    private var pos = 0
    private var lim = 0

    private fun fill(): Boolean {
        if (pos < lim) return true
        lim = reader.read(buf, 0, buf.size)
        pos = 0
        if (lim <= 0) { lim = 0; return false }
        return true
    }

    private fun peek(): Int = if (fill()) buf[pos].code else -1
    private fun next(): Int = if (fill()) buf[pos++].code else -1

    private fun skipWs() {
        while (true) {
            val c = peek()
            if (c == ' '.code || c == '\n'.code || c == '\r'.code || c == '\t'.code || c == 0xFEFF) pos++ else return
        }
    }

    private fun expect(ch: Char) {
        skipWs()
        val c = next()
        if (c != ch.code) throw MalformedJsonException(if (c < 0) "The file ends unexpectedly." else "Expected '$ch'.")
    }

    fun tokens(): Sequence<ScanToken> = sequence {
        skipWs()
        if (peek() != '{'.code) throw MalformedJsonException("The file is not a JSON object.")
        pos++
        skipWs()
        if (peek() == '}'.code) { pos++; return@sequence }
        while (true) {
            skipWs()
            if (peek() != '"'.code) throw MalformedJsonException("Expected a field name.")
            val key = json.parseToJsonElement(readRaw()).let { (it as kotlinx.serialization.json.JsonPrimitive).content }
            expect(':')
            skipWs()
            if (peek() == '['.code) {
                pos++
                skipWs()
                if (peek() == ']'.code) {
                    pos++
                } else {
                    while (true) {
                        skipWs()
                        yield(ScanToken.Element(key, readRaw()))
                        skipWs()
                        val c = next()
                        if (c == ','.code) continue
                        if (c == ']'.code) break
                        throw MalformedJsonException(if (c < 0) "The file ends unexpectedly." else "Expected ',' or ']'.")
                    }
                }
            } else {
                val raw = readRaw()
                val value = try { json.parseToJsonElement(raw) } catch (e: Exception) { throw MalformedJsonException("A header value is not valid JSON.") }
                yield(ScanToken.Field(key, value))
            }
            skipWs()
            val c = next()
            if (c == ','.code) continue
            if (c == '}'.code) break
            throw MalformedJsonException(if (c < 0) "The file ends unexpectedly." else "Expected ',' or '}'.")
        }
    }

    /** Reads one whole JSON value as text. */
    private fun readRaw(): String {
        skipWs()
        val sb = StringBuilder()
        val first = peek()
        when {
            first < 0 -> throw MalformedJsonException("The file ends unexpectedly.")
            first == '"'.code -> readString(sb)
            first == '{'.code || first == '['.code -> readComposite(sb)
            else -> {
                while (true) {
                    val c = peek()
                    if (c < 0 || c == ','.code || c == ']'.code || c == '}'.code || c == ' '.code || c == '\n'.code || c == '\r'.code || c == '\t'.code) break
                    sb.append(next().toChar())
                    if (sb.length > maxRawChars) throw MalformedJsonException("A value is too long.")
                }
                if (sb.isEmpty()) throw MalformedJsonException("A value is missing.")
            }
        }
        return sb.toString()
    }

    private fun readString(sb: StringBuilder) {
        sb.append(next().toChar()) // opening quote
        while (true) {
            val c = next()
            if (c < 0) throw MalformedJsonException("The file ends inside a string.")
            sb.append(c.toChar())
            if (c == '\\'.code) {
                val e = next()
                if (e < 0) throw MalformedJsonException("The file ends inside a string.")
                sb.append(e.toChar())
            } else if (c == '"'.code) return
            if (sb.length > maxRawChars) throw MalformedJsonException("A value is too long.")
        }
    }

    private fun readComposite(sb: StringBuilder) {
        var depth = 0
        while (true) {
            val c = peek()
            if (c < 0) throw MalformedJsonException("The file ends unexpectedly.")
            if (c == '"'.code) { readString(sb); continue }
            sb.append(next().toChar())
            if (c == '{'.code || c == '['.code) depth++
            else if (c == '}'.code || c == ']'.code) { depth--; if (depth == 0) return }
            if (sb.length > maxRawChars) throw MalformedJsonException("A value is too long.")
        }
    }
}
