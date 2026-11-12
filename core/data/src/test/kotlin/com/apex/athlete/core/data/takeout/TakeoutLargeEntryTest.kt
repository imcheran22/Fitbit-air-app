package com.apex.athlete.core.data.takeout

import com.apex.athlete.core.data.takeout.parsers.TakeoutParsers
import com.apex.athlete.core.data.takeout.parsers.TakeoutRowBuffer
import kotlinx.coroutines.runBlocking
import java.io.File
import java.time.ZoneOffset
import java.util.concurrent.TimeUnit
import java.util.zip.ZipInputStream
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * A 250,000-row heart-rate file (§9 required test). Three angles on "never hold a whole file":
 * every batch is at most 2,500 rows; no consumer ever asks the ZIP for more than a small chunk; and
 * a JVM with a 40 MB heap, far smaller than the 35 MB-plus entry once decoded to text, completes
 * the import.
 */
class TakeoutLargeEntryTest {

    private val rows = 250_000
    private val pad = 80

    @Test
    fun aQuarterMillionRowFileIsWrittenInBatchesOfAtMost2500AndInTimeOrder() {
        val sink = CountingSink()
        val report = runBlocking {
            TakeoutZipImporter(sink, MemoryMarks(), TakeoutReplayer { _, _ -> 0 }, TakeoutTimeConfig(ZoneOffset.UTC), nowMillis = { NOW_MS })
                .import(listOf(generatedHeartRateZip(rows, pad)))
        }
        val file = report.files.single()
        assertEquals(TakeoutFileStatus.COMPLETE, file.status)
        assertEquals(rows.toLong(), sink.rows)
        assertEquals(rows.toLong(), file.rowsRead)
        assertEquals(0L, sink.outOfOrder)
        assertTrue(sink.largestBatch <= TakeoutZipImporter.BATCH_ROWS, "largest batch ${sink.largestBatch}")
        assertTrue(sink.batches >= rows / TakeoutZipImporter.BATCH_ROWS, "batches ${sink.batches}")
        assertTrue(file.sizeBytes > 30L * 1024 * 1024, "the entry is large: ${file.sizeBytes}")
    }

    @Test
    fun noConsumerAsksTheZipForMoreThanASmallChunkAtOnce() {
        val part = generatedHeartRateZip(20_000, pad)
        ZipInputStream(part.open()).use { zip ->
            val entry = assertNotNull(zip.nextEntry)
            val route = assertNotNull(TakeoutEntryRouter.route(entry.name))
            val stream = TakeoutEntryStream(zip)
            val parser = TakeoutParsers.open(route, stream, TakeoutTimeConfig(ZoneOffset.UTC))
            val buffer = TakeoutRowBuffer()
            var total = 0
            while (parser.readInto(buffer, 2_500)) {
                total += buffer.size
                buffer.clear()
            }
            total += buffer.size
            stream.drain()
            assertEquals(20_000, total)
            assertTrue(stream.largestReadRequest <= 64 * 1024, "largest single read request: ${stream.largestReadRequest}")
            assertTrue(stream.bytesRead > 2_000_000)
        }
    }

    /** Runs [LargeEntryChild] in a JVM with a [heapMb] MB heap and returns its RESULT line (or fails with its output). */
    private fun runChild(heapMb: Int, vararg args: String): String {
        val java = File(System.getProperty("java.home"), "bin/java").path
        val classpath = (System.getProperty("java.class.path").orEmpty().split(File.pathSeparator) + listOf(
            LargeEntryChild::class.java, TakeoutZipImporter::class.java, Unit::class.java,
            kotlinx.coroutines.Dispatchers::class.java, com.apex.athlete.core.domain.DataProvenance::class.java,
        ).mapNotNull { runCatching { File(it.protectionDomain.codeSource.location.toURI()).path }.getOrNull() })
            .filter { it.isNotBlank() }.distinct().joinToString(File.pathSeparator)
        val process = ProcessBuilder(java, "-Xmx${heapMb}m", "-XX:+UseSerialGC", "-cp", classpath, LargeEntryChild::class.java.name, *args)
            .redirectErrorStream(true).start()
        val output = process.inputStream.bufferedReader().readText()
        assertTrue(process.waitFor(300, TimeUnit.SECONDS), "child JVM timed out")
        val result = output.lines().firstOrNull { it.startsWith("RESULT") }
        return assertNotNull(result, "child JVM failed (exit ${process.exitValue()}): ${output.lines().filter { !it.startsWith("Picked up") }.joinToString("\n").take(800)}")
    }

    @Test
    fun theImportCompletesInAJvmWithAFortyMegabyteHeap() {
        val result = runChild(40, "file", rows.toString(), pad.toString())
        assertTrue("rows=$rows " in result && "status=COMPLETE" in result && "outOfOrder=0" in result, result)
        val maxMb = Regex("maxMb=(\\d+)").find(result)!!.groupValues[1].toInt()
        assertTrue(maxMb <= 40, "the heap limit really applied: $result")
        val largest = Regex("largest=(\\d+)").find(result)!!.groupValues[1].toInt()
        assertTrue(largest <= TakeoutZipImporter.BATCH_ROWS, result)
    }

    /** A multi-year export is thousands of daily files: nothing may be kept per file beyond a few counters. */
    @Test
    fun thousandsOfSmallFilesAlsoFitInAFortyMegabyteHeap() {
        val result = runChild(40, "many", "6000", "20")
        assertTrue("files=6000 " in result && "rows=120000 " in result && "outcome=COMPLETED" in result, result)
    }
}
