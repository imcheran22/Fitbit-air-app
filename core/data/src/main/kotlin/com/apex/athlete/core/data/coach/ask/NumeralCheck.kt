package com.apex.athlete.core.data.coach.ask

import java.math.BigDecimal

/**
 * The "no invented numbers" check for AI text. Every number in the answer must also be in what was
 * sent (compared by value: "05" equals "5", "7.0" equals "7"). Numbers that are not are returned
 * so the screen can show the answer with a warning instead of hiding it.
 */
object NumeralCheck {
    private val numeral = Regex("""\d+(?:[.,]\d+)?""")
    private val listMarker = Regex("""(?m)^\s*\d+[.)]\s""")

    fun numerals(text: String): List<String> =
        numeral.findAll(listMarker.replace(text, " ")).map { it.value }.toList()

    /** A number in a canonical form so equal values compare equal. */
    fun canonical(numeral: String): String =
        try { BigDecimal(numeral.replace(',', '.')).stripTrailingZeros().toPlainString() } catch (_: NumberFormatException) { numeral }

    /** Numbers in the sent text, canonical form. */
    fun allowedSet(sentText: String): Set<String> = numerals(sentText).map(::canonical).toSet()

    /** Numerals of [answer] not present in [allowed], as printed in the answer, each once, in order. */
    fun unverified(answer: String, allowed: Set<String>): List<String> =
        numerals(answer).filter { canonical(it) !in allowed }.distinct()
}
