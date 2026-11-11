package com.apex.athlete.core.ui.components

import com.apex.athlete.core.domain.DataProvenance
import org.junit.Assert.assertEquals
import org.junit.Test

class ProvenanceLabelTest {
    @Test fun everyProvenanceHasADistinctLabel() {
        val ids = DataProvenance.entries.map { provenanceLabelRes(it) }
        assertEquals(DataProvenance.entries.size, ids.toSet().size)
    }
}
