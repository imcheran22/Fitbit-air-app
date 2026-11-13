package com.apex.athlete.ui.journal

import com.apex.athlete.R
import com.apex.athlete.core.domain.MetricType
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class JournalFactorsModelTest {
    @Test fun theFiveFactorsInDisplayOrder() {
        assertEquals(
            listOf(
                MetricType.JOURNAL_ALCOHOL,
                MetricType.JOURNAL_LATE_CAFFEINE,
                MetricType.JOURNAL_LATE_MEAL,
                MetricType.JOURNAL_STRESSFUL_DAY,
                MetricType.JOURNAL_TRAVEL,
            ),
            JOURNAL_FACTORS,
        )
        JOURNAL_FACTORS.forEach { assertNotEquals(R.string.journal_factor_other, factorTitleRes(it)) }
        assertEquals(JOURNAL_FACTORS.size, JOURNAL_FACTORS.map { factorTitleRes(it) }.distinct().size)
    }

    @Test fun choicesMapToTheValuesSaveJournalFactorsTakes() {
        assertEquals(true, FactorChoice.YES.value)
        assertEquals(false, FactorChoice.NO.value)
        assertNull(FactorChoice.NOT_LOGGED.value)
        assertEquals(FactorChoice.YES, choiceOf(true))
        assertEquals(FactorChoice.NO, choiceOf(false))
        assertEquals(FactorChoice.NOT_LOGGED, choiceOf(null))
    }

    @Test fun aPendingClearBeatsTheStoredValueAndAPendingValueBeatsAClear() {
        val stored = JOURNAL_FACTORS.associateWith { f -> if (f == MetricType.JOURNAL_ALCOHOL) true else null }
        val cleared = effectiveFactors(stored, mapOf(MetricType.JOURNAL_ALCOHOL to null))
        assertNull(cleared[MetricType.JOURNAL_ALCOHOL])
        assertTrue(cleared.containsKey(MetricType.JOURNAL_ALCOHOL))
        val set = effectiveFactors(stored, mapOf(MetricType.JOURNAL_TRAVEL to false))
        assertEquals(true, set[MetricType.JOURNAL_ALCOHOL])
        assertEquals(false, set[MetricType.JOURNAL_TRAVEL])
        assertEquals(JOURNAL_FACTORS, set.keys.toList())
    }

    @Test fun panelIsLoadingUntilTheStoreAnswers() {
        val loading = FactorsPanel.of(null, emptyMap(), SaveStatus.IDLE)
        assertFalse(loading.loaded)
        assertEquals(JOURNAL_FACTORS.toSet(), loading.choices.keys)
        val loaded = FactorsPanel.of(
            JOURNAL_FACTORS.associateWith { f -> if (f == MetricType.JOURNAL_LATE_MEAL) false else null },
            emptyMap(),
            SaveStatus.SAVED,
        )
        assertTrue(loaded.loaded)
        assertEquals(FactorChoice.NO, loaded.choices[MetricType.JOURNAL_LATE_MEAL])
        assertEquals(FactorChoice.NOT_LOGGED, loaded.choices[MetricType.JOURNAL_ALCOHOL])
        assertEquals(SaveStatus.SAVED, loaded.status)
    }
}
