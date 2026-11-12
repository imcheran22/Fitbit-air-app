package com.apex.athlete.core.data.takeout.parsers

import java.io.Reader

/**
 * The document is not valid JSON at this point. The message carries a character position and what
 * was expected, never any of the file's content, so it is safe to count and report.
 *
 * Deliberately not an `IOException`: an I/O failure means the archive itself is damaged, this
 * means one file inside it is.
 */
class MalformedJsonException(message: String) : Exception(message)

/**
 * A small pull parser for JSON, used instead of `android.util.JsonReader` so the Takeout parsers
 * run on a plain JVM. It reads one token at a time from a [Reader] and holds at most one token in
 * memory, so a file of any size is parsed in constant space:
 *
 * - string values and names longer than [maxStringChars] are cut to that length (the rest is read
 *   and discarded), so a single huge value cannot exhaust memory;
 * - nesting deeper than [maxDepth] is rejected.
 *
 * Tolerances: a byte-order mark and any content after the root value are ignored.
 */
class JsonTokenReader(
    private val input: Reader,
    private val maxStringChars: Int = 65_536,
    private val maxDepth: Int = 64,
) {
    enum class Token { BEGIN_ARRAY, END_ARRAY, BEGIN_OBJECT, END_OBJECT, NAME, STRING, NUMBER, BOOLEAN, NULL, END_DOCUMENT }

    private val buffer = CharArray(8_192)
    private var pos = 0
    private var limit = 0
    private var consumed = 0L

    private val scopes = IntArray(maxDepth + 1)
    private var depth = 0
    private var rootSeen = false

    private var peeked: Token? = null
    private val text = StringBuilder()
    private var booleanValue = false

    /** Nesting level of the token last returned by [peek]: 0 at the root. */
    val nesting: Int get() = depth

    fun peek(): Token = peeked ?: advance().also { peeked = it }

    /** True while the current array or object has another element. */
    fun hasNext(): Boolean {
        val t = peek()
        return t != Token.END_ARRAY && t != Token.END_OBJECT && t != Token.END_DOCUMENT
    }

    fun beginArray() = expect(Token.BEGIN_ARRAY)
    fun endArray() = expect(Token.END_ARRAY)
    fun beginObject() = expect(Token.BEGIN_OBJECT)
    fun endObject() = expect(Token.END_OBJECT)

    fun nextName(): String {
        expect(Token.NAME)
        return text.toString()
    }

    /** The next scalar as text (a string, or the literal of a number or boolean); null for JSON null. Containers are skipped and give null. */
    fun nextStringOrNull(): String? = when (peek()) {
        Token.STRING, Token.NUMBER -> { peeked = null; text.toString() }
        Token.BOOLEAN -> { peeked = null; booleanValue.toString() }
        Token.NULL -> { peeked = null; null }
        else -> { skipValue(); null }
    }

    /** The next scalar as a finite number (a number, or a string holding one); null otherwise. */
    fun nextDoubleOrNull(): Double? = when (peek()) {
        Token.NUMBER, Token.STRING -> {
            peeked = null
            if (text.length > 40) null else text.toString().trim().toDoubleOrNull()?.takeIf { it.isFinite() }
        }
        else -> { skipValue(); null }
    }

    fun nextBooleanOrNull(): Boolean? = when (peek()) {
        Token.BOOLEAN -> { peeked = null; booleanValue }
        Token.STRING -> { peeked = null; text.toString().trim().lowercase().let { if (it == "true") true else if (it == "false") false else null } }
        else -> { skipValue(); null }
    }

    /** Consumes the next value whatever it is, including a whole array or object. */
    fun skipValue() {
        when (peek()) {
            Token.BEGIN_ARRAY, Token.BEGIN_OBJECT -> {
                val target = depth - 1
                peeked = null
                while (depth > target) {
                    if (peek() == Token.END_DOCUMENT) throw malformed("unexpected end inside a value")
                    peeked = null
                }
            }
            Token.END_ARRAY, Token.END_OBJECT, Token.END_DOCUMENT, Token.NAME -> throw malformed("expected a value")
            else -> peeked = null
        }
    }

    private fun expect(token: Token) {
        val t = peek()
        if (t != token) throw malformed("expected $token but found $t")
        peeked = null
    }

    // --- Tokenizer --------------------------------------------------------------------------------

    private fun advance(): Token {
        if (depth == 0) {
            if (rootSeen) return Token.END_DOCUMENT
            val c = nextNonWhitespace()
            if (c < 0) return Token.END_DOCUMENT
            rootSeen = true
            return value(c)
        }
        when (scopes[depth - 1]) {
            ARRAY_FIRST -> {
                val c = nextNonWhitespace()
                if (c == ']'.code) return pop(Token.END_ARRAY)
                scopes[depth - 1] = ARRAY_NEXT
                return value(c)
            }
            ARRAY_NEXT -> {
                val c = nextNonWhitespace()
                if (c == ']'.code) return pop(Token.END_ARRAY)
                if (c != ','.code) throw malformed("expected ',' or ']'")
                return value(nextNonWhitespace())
            }
            OBJECT_FIRST -> {
                val c = nextNonWhitespace()
                if (c == '}'.code) return pop(Token.END_OBJECT)
                return name(c)
            }
            OBJECT_NEXT -> {
                val c = nextNonWhitespace()
                if (c == '}'.code) return pop(Token.END_OBJECT)
                if (c != ','.code) throw malformed("expected ',' or '}'")
                return name(nextNonWhitespace())
            }
            else -> { // OBJECT_VALUE
                if (nextNonWhitespace() != ':'.code) throw malformed("expected ':'")
                scopes[depth - 1] = OBJECT_NEXT
                return value(nextNonWhitespace())
            }
        }
    }

    private fun pop(token: Token): Token {
        depth--
        return token
    }

    private fun push(scope: Int) {
        if (depth >= maxDepth) throw malformed("nesting deeper than $maxDepth")
        scopes[depth++] = scope
    }

    private fun name(c: Int): Token {
        if (c != '"'.code) throw malformed("expected a name")
        readString()
        scopes[depth - 1] = OBJECT_VALUE
        return Token.NAME
    }

    private fun value(c: Int): Token = when {
        c == '['.code -> { push(ARRAY_FIRST); Token.BEGIN_ARRAY }
        c == '{'.code -> { push(OBJECT_FIRST); Token.BEGIN_OBJECT }
        c == '"'.code -> { readString(); Token.STRING }
        c == '-'.code || (c >= '0'.code && c <= '9'.code) -> { readLiteral(c); Token.NUMBER }
        c == 't'.code || c == 'f'.code || c == 'n'.code -> {
            readLiteral(c)
            when (text.toString()) {
                "true" -> { booleanValue = true; Token.BOOLEAN }
                "false" -> { booleanValue = false; Token.BOOLEAN }
                "null" -> Token.NULL
                else -> throw malformed("unknown literal")
            }
        }
        c < 0 -> throw malformed("unexpected end of document")
        else -> throw malformed("unexpected character")
    }

    private fun readLiteral(first: Int) {
        text.setLength(0)
        text.append(first.toChar())
        while (true) {
            if (pos >= limit && !fill()) return
            val c = buffer[pos]
            val literal = (c in '0'..'9') || (c in 'a'..'z') || (c in 'A'..'Z') || c == '.' || c == '-' || c == '+'
            if (!literal) return
            pos++
            if (text.length < MAX_LITERAL_CHARS) text.append(c) else throw malformed("literal too long")
        }
    }

    /** Reads a string whose opening quote has been consumed, keeping at most [maxStringChars] characters. */
    private fun readString() {
        text.setLength(0)
        while (true) {
            if (pos >= limit && !fill()) throw malformed("unterminated string")
            val c = buffer[pos++]
            when (c) {
                '"' -> return
                '\\' -> appendBounded(readEscape())
                else -> appendBounded(c)
            }
        }
    }

    private fun appendBounded(c: Char) {
        if (text.length < maxStringChars) text.append(c)
    }

    private fun readEscape(): Char {
        if (pos >= limit && !fill()) throw malformed("unterminated escape")
        return when (val c = buffer[pos++]) {
            'n' -> '\n'
            't' -> '\t'
            'r' -> '\r'
            'b' -> '\b'
            'f' -> '\u000C'
            'u' -> {
                var code = 0
                repeat(4) {
                    if (pos >= limit && !fill()) throw malformed("unterminated escape")
                    val digit = Character.digit(buffer[pos++], 16)
                    if (digit < 0) throw malformed("bad unicode escape")
                    code = code * 16 + digit
                }
                code.toChar()
            }
            '"', '\\', '/' -> c
            else -> throw malformed("bad escape")
        }
    }

    private fun nextNonWhitespace(): Int {
        while (true) {
            if (pos >= limit && !fill()) return -1
            val c = buffer[pos++]
            if (c == ' ' || c == '\n' || c == '\r' || c == '\t' || c == '\uFEFF') continue
            return c.code
        }
    }

    private fun fill(): Boolean {
        consumed += limit
        pos = 0
        limit = 0
        while (true) {
            val n = input.read(buffer, 0, buffer.size)
            if (n < 0) return false
            if (n > 0) {
                limit = n
                return true
            }
        }
    }

    private fun malformed(what: String) = MalformedJsonException("Malformed JSON near character ${consumed + pos}: $what")

    private companion object {
        const val ARRAY_FIRST = 1
        const val ARRAY_NEXT = 2
        const val OBJECT_FIRST = 3
        const val OBJECT_NEXT = 4
        const val OBJECT_VALUE = 5
        const val MAX_LITERAL_CHARS = 64
    }
}

/** Marker returned by [readTree] for an element that exceeded the node budget; it was consumed, not kept. */
internal object JsonTooLarge

/** A number kept as its literal so the reader decides how to interpret it. */
internal class JsonNumber(val literal: String)

/**
 * Reads the next value into plain Kotlin collections (`Map`, `List`, `String`, [JsonNumber],
 * `Boolean`, null) for records that are small but nested, such as one sleep log. An element with
 * more than [maxNodes] values is consumed without being kept and reported as [JsonTooLarge], so a
 * malformed or hostile file cannot grow the heap.
 */
internal fun JsonTokenReader.readTree(maxNodes: Int = 200_000): Any? {
    val budget = intArrayOf(maxNodes)
    val tree = readNode(budget)
    return if (budget[0] < 0) JsonTooLarge else tree
}

private fun JsonTokenReader.readNode(budget: IntArray): Any? {
    budget[0]--
    if (budget[0] < 0) {
        skipValue()
        return null
    }
    return when (peek()) {
        JsonTokenReader.Token.BEGIN_OBJECT -> {
            beginObject()
            val map = LinkedHashMap<String, Any?>()
            while (hasNext()) {
                val name = nextName()
                val child = readNode(budget)
                if (budget[0] >= 0) map[name] = child
            }
            endObject()
            map
        }
        JsonTokenReader.Token.BEGIN_ARRAY -> {
            beginArray()
            val list = ArrayList<Any?>()
            while (hasNext()) {
                val child = readNode(budget)
                if (budget[0] >= 0) list += child
            }
            endArray()
            list
        }
        JsonTokenReader.Token.NUMBER -> JsonNumber(nextStringOrNull().orEmpty())
        JsonTokenReader.Token.BOOLEAN -> nextBooleanOrNull()
        JsonTokenReader.Token.STRING -> nextStringOrNull()
        JsonTokenReader.Token.NULL -> nextStringOrNull()
        else -> throw MalformedJsonException("Malformed JSON: expected a value")
    }
}

// Tolerant accessors over a tree read by readTree: a missing key or an unexpected type is null.

@Suppress("UNCHECKED_CAST")
internal fun Any?.asObject(): Map<String, Any?>? = this as? Map<String, Any?>

internal fun Any?.asArray(): List<Any?>? = this as? List<Any?>

internal fun Map<String, Any?>.text(key: String): String? = when (val v = this[key]) {
    is String -> v
    is JsonNumber -> v.literal
    else -> null
}

internal fun Map<String, Any?>.number(key: String): Double? = when (val v = this[key]) {
    is JsonNumber -> v.literal.toDoubleOrNull()?.takeIf { it.isFinite() }
    is String -> if (v.length > 40) null else v.trim().toDoubleOrNull()?.takeIf { it.isFinite() }
    else -> null
}

internal fun Map<String, Any?>.flag(key: String): Boolean? = when (val v = this[key]) {
    is Boolean -> v
    is String -> when (v.trim().lowercase()) { "true" -> true; "false" -> false; else -> null }
    else -> null
}
