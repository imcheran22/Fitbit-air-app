package com.apex.athlete.core.data.coach.ask

import kotlin.test.Test
import kotlin.test.assertEquals

class NumeralCheckTest {
    private val allowed = NumeralCheck.allowedSet("Recovery 31 % sleep 8 h 05 min strain 7.5 zone 2")

    @Test fun sameValuesPassWhateverTheFormat() {
        assertEquals(emptyList(), NumeralCheck.unverified("You are at 31%, slept 8 h 5 min, strain 7.50.", allowed))
        assertEquals(emptyList(), NumeralCheck.unverified("Strain is 7,5.", allowed))
    }

    @Test fun inventedNumbersAreFlagged() {
        assertEquals(listOf("42", "9"), NumeralCheck.unverified("Recovery 31, expect 42 tomorrow, or 9 hours.", allowed))
    }

    @Test fun listMarkersAreIgnored() {
        assertEquals(emptyList(), NumeralCheck.unverified("1. Rest\n2) Hydrate\n3. Sleep 8 h", allowed))
    }

    @Test fun signIsPartOfTheNumber() {
        val a = NumeralCheck.allowedSet("Skin temperature was +0.3 \u00B0C and \u22120.5 \u00B0C")
        assertEquals(emptyList(), NumeralCheck.unverified("It was 0.3 and +0.3 and -0.5 and \u22120.5.", a))
        assertEquals(listOf("-0.3", "0.5"), NumeralCheck.unverified("It was -0.3 and 0.5.", a))
    }

    @Test fun hyphenInARangeIsNotASign() {
        assertEquals(emptyList(), NumeralCheck.unverified("Aim for 6-8 minutes", NumeralCheck.allowedSet("6 and 8")))
    }
}
