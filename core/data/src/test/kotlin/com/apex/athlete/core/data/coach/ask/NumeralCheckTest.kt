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
}
