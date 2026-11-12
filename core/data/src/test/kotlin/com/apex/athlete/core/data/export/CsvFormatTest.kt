package com.apex.athlete.core.data.export

import java.util.Locale
import kotlin.test.Test
import kotlin.test.assertEquals

class CsvFormatTest {
    @Test fun escaping() {
        assertEquals("plain", CsvFormat.text("plain"))
        assertEquals("\"a,b\"", CsvFormat.text("a,b"))
        assertEquals("\"say \"\"hi\"\"\"", CsvFormat.text("say \"hi\""))
        assertEquals("\"l1\nl2\"", CsvFormat.text("l1\nl2"))
        assertEquals("'=1+1", CsvFormat.text("=1+1"))
        assertEquals("", CsvFormat.text(null))
    }

    @Test fun decimalsAreLocaleIndependent() {
        val old = Locale.getDefault()
        try {
            Locale.setDefault(Locale.GERMANY)
            assertEquals("55.5", CsvFormat.number(55.5))
            assertEquals("1234567.25", CsvFormat.number(1234567.25))
            assertEquals("0.0001", CsvFormat.number(0.0001))
            assertEquals("9000", CsvFormat.number(9000.0))
            assertEquals("-3.2", CsvFormat.number(-3.2))
            assertEquals("", CsvFormat.number(Double.NaN))
            assertEquals("", CsvFormat.number(null as Double?))
        } finally { Locale.setDefault(old) }
    }

    @Test fun lineEndsAreCrLf() = assertEquals("a,b\r\n", CsvFormat.line("a", "b"))
}
