package com.apex.athlete.core.data.export

import java.io.StringReader
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class JsonStreamScannerTest {
    private fun tokens(s: String) = JsonStreamScanner(StringReader(s)).tokens().toList()

    @Test fun elementsStreamWithStringsContainingBracketsAndEscapes() {
        val t = tokens("""{"a":1,"rows":[{"s":"x]}\"}"},[1,2],3, "q"],"b":{"k":[1]}}""")
        val els = t.filterIsInstance<ScanToken.Element>()
        assertEquals(4, els.size)
        assertEquals("""{"s":"x]}\"}"}""", els[0].raw)
        assertEquals("[1,2]", els[1].raw)
        assertEquals(2, t.filterIsInstance<ScanToken.Field>().size)
    }

    @Test fun truncationThrows() {
        assertFailsWith<MalformedJsonException> { tokens("""{"rows":[{"a":1},{"a":""") }
    }
}
