package com.apex.athlete.widget

import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class WidgetSnapshotStoreTest {
    @get:Rule
    val folder = TemporaryFolder()

    private fun store() = WidgetSnapshotStore(folder.root)

    private fun file() = File(folder.root, WidgetSnapshotStore.FILE_NAME)

    @Test
    fun missingFileReadsAsNull() {
        assertNull(store().read())
        assertFalse(store().exists())
    }

    @Test
    fun writeThenReadRoundTrips() {
        val snapshot = WidgetTestData.snapshot()
        assertTrue(store().write(snapshot))
        assertEquals(snapshot, store().read())
    }

    @Test
    fun aSecondWriteReplacesTheFirstAndLeavesNoTempFile() {
        val first = WidgetTestData.snapshot(recovery = WidgetTestData.value(40.0))
        val second = WidgetTestData.snapshot(recovery = WidgetTestData.value(80.0))
        assertTrue(store().write(first))
        assertTrue(store().write(second))
        assertEquals(second, store().read())
        assertEquals(listOf(WidgetSnapshotStore.FILE_NAME), folder.root.list()!!.toList())
    }

    @Test
    fun writeCreatesTheDirectory() {
        val nested = File(folder.root, "a/b")
        val store = WidgetSnapshotStore(nested)
        assertTrue(store.write(WidgetTestData.snapshot()))
        assertNotNull(store.read())
    }

    @Test
    fun corruptFileReadsAsNullInsteadOfCrashing() {
        file().writeText("{\"v\":1,\"updatedAt\":")
        assertNull(store().read())
        file().writeBytes(byteArrayOf(0, 1, 2, -1, -2))
        assertNull(store().read())
    }

    @Test
    fun emptyAndOversizedFilesReadAsNull() {
        file().writeText("")
        assertNull(store().read())
        file().writeText(" ".repeat(20_000))
        assertNull(store().read())
    }

    @Test
    fun aHalfWrittenTempFileIsNeverRead() {
        val good = WidgetTestData.snapshot(recovery = WidgetTestData.value(61.0))
        assertTrue(store().write(good))
        File(folder.root, "${WidgetSnapshotStore.FILE_NAME}.tmp").writeText("{\"v\":1,\"updat")
        assertEquals(good, store().read())
    }

    @Test
    fun aFailedWriteKeepsThePreviousFile() {
        val good = WidgetTestData.snapshot()
        assertTrue(store().write(good))
        // The temp path is a directory, so the next write cannot open it.
        File(folder.root, "${WidgetSnapshotStore.FILE_NAME}.tmp").mkdir()
        assertFalse(store().write(WidgetTestData.snapshot(recovery = WidgetTestData.value(10.0))))
        assertEquals(good, store().read())
    }

    @Test
    fun writingIntoAFileInsteadOfADirectoryFailsQuietly() {
        val notADirectory = folder.newFile("plain")
        assertFalse(WidgetSnapshotStore(notADirectory).write(WidgetTestData.snapshot()))
        assertNull(WidgetSnapshotStore(notADirectory).read())
    }

    @Test
    fun clearRemovesTheSnapshotAndAnyTempFile() {
        assertTrue(store().write(WidgetTestData.snapshot()))
        File(folder.root, "${WidgetSnapshotStore.FILE_NAME}.tmp").writeText("x")
        store().clear()
        assertNull(store().read())
        assertEquals(emptyList<String>(), folder.root.list()!!.toList())
    }

    @Test
    fun clearWithNothingStoredIsSafeAndRepeatable() {
        store().clear()
        store().clear()
        assertNull(store().read())
    }

    @Test
    fun theStoredFileHoldsNoDemoSnapshotUnlessOneWasWrittenOnPurpose() {
        // The store does not filter; demo isolation is the publisher's job and the mapper refuses a demo snapshot.
        assertTrue(store().write(WidgetTestData.snapshot(isDemo = true)))
        assertEquals(true, store().read()?.isDemo)
    }
}
