package app.fitdash.settings

import app.fitdash.TODAY
import app.fitdash.at
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

@OptIn(ExperimentalCoroutinesApi::class)
class JournalStoreTest {
    @get:Rule val tmp = TemporaryFolder()

    @Test fun `toggle on a past date lands on that date`() = runTest {
        val store = JournalStore(tmp.newFile(), CoroutineScope(StandardTestDispatcher(testScheduler)))
        store.toggle(TODAY.minusDays(1), Tag.ALCOHOL)
        advanceUntilIdle()
        assertEquals(setOf(Tag.ALCOHOL), store.flow.value[TODAY.minusDays(1)]?.tags)
        assertNull(store.flow.value[TODAY])
    }

    @Test fun `round trips through the file`() = runTest {
        val f = tmp.newFile(); val a = JournalStore(f, CoroutineScope(StandardTestDispatcher(testScheduler)))
        a.toggle(TODAY, Tag.STRESS); a.add(TODAY, NutrientKind.PROTEIN, Entry(at(TODAY, 9), 25.0, "r1"))
        advanceUntilIdle()
        val b = JournalStore(f, CoroutineScope(StandardTestDispatcher(testScheduler)))
        advanceUntilIdle()
        assertEquals(a.flow.value, b.flow.value)
    }

    @Test fun `remove drops the entry and empty days vanish`() = runTest {
        val s = JournalStore(tmp.newFile(), CoroutineScope(StandardTestDispatcher(testScheduler))); val t = at(TODAY, 9)
        s.add(TODAY, NutrientKind.CAFFEINE, Entry(t, 95.0, null)); s.remove(TODAY, NutrientKind.CAFFEINE, t)
        advanceUntilIdle()
        assertTrue(s.flow.value.isEmpty())
    }

    @Test fun `a toggle before the load finishes lands on the loaded journal`() = runTest {
        val f = tmp.newFile()
        JournalStore(f, CoroutineScope(StandardTestDispatcher(testScheduler))).toggle(TODAY.minusDays(1), Tag.STRESS)
        advanceUntilIdle()
        val store = JournalStore(f, CoroutineScope(StandardTestDispatcher(testScheduler)))
        store.toggle(TODAY, Tag.ALCOHOL)
        advanceUntilIdle()
        assertEquals(setOf(Tag.STRESS), store.flow.value[TODAY.minusDays(1)]?.tags)
        assertEquals(setOf(Tag.ALCOHOL), store.flow.value[TODAY]?.tags)
        val again = JournalStore(f, CoroutineScope(StandardTestDispatcher(testScheduler)))
        advanceUntilIdle()
        assertEquals(store.flow.value, again.flow.value)
    }

    @Test fun `a corrupt file starts empty and is kept aside`() = runTest {
        val f = File(tmp.root, "journal.json").apply { writeText("{not json") }
        val store = JournalStore(f, CoroutineScope(StandardTestDispatcher(testScheduler)))
        advanceUntilIdle()
        assertTrue(store.flow.value.isEmpty())
        assertEquals("{not json", File(tmp.root, "journal.json.bad").readText())
    }

    @Test fun `an add is visible at once, before the write runs`() = runTest {
        val s = JournalStore(tmp.newFile(), CoroutineScope(StandardTestDispatcher(testScheduler))); val e = Entry(at(TODAY, 9), 25.0, null)
        s.add(TODAY, NutrientKind.PROTEIN, e)
        assertEquals(listOf(e), s.flow.value[TODAY]?.protein)
        advanceUntilIdle()
        assertEquals(listOf(e), s.flow.value[TODAY]?.protein)
    }

    @Test fun `a file with a bad date starts empty and is kept aside`() = runTest {
        val f = File(tmp.root, "journal.json").apply { writeText("""{"not-a-date":{"tags":["ALCOHOL"]}}""") }
        val store = JournalStore(f, CoroutineScope(StandardTestDispatcher(testScheduler)))
        advanceUntilIdle()
        assertTrue(store.flow.value.isEmpty())
        assertEquals("""{"not-a-date":{"tags":["ALCOHOL"]}}""", File(tmp.root, "journal.json.bad").readText())
    }
}
