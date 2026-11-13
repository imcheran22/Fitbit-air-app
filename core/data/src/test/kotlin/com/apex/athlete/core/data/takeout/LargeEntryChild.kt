package com.apex.athlete.core.data.takeout

import kotlinx.coroutines.runBlocking
import java.time.ZoneOffset
import kotlin.system.exitProcess

/**
 * Entry point of the bounded-memory test: runs the importer over a generated archive in a JVM
 * started with a small heap (see TakeoutLargeEntryTest). A parser that read the entry into a String
 * or a list would not fit and the process would die with OutOfMemoryError.
 */
object LargeEntryChild {
    @JvmStatic
    fun main(args: Array<String>) {
        val sink = CountingSink()
        // "file <rows> <pad>": one huge file. "many <files> <rowsPerFile>": thousands of small ones.
        if (args[0] == "calories") {
            val calories = runBlocking {
                TakeoutZipImporter(sink, MemoryMarks(), TakeoutReplayer { _, _ -> 0 }, TakeoutTimeConfig(ZoneOffset.UTC), nowMillis = { NOW_MS })
                    .import(listOf(generatedCaloriesZip(args[1].toInt())))
            }
            val f = calories.files.single()
            println("RESULT rows=${sink.rows} read=${f.rowsRead} status=${f.status} largest=${sink.largestBatch} maxMb=${Runtime.getRuntime().maxMemory() / (1024 * 1024)}")
            exitProcess(0)
        }
        val part = if (args[0] == "many") generatedManyFilesZip(args[1].toInt(), args[2].toInt()) else generatedHeartRateZip(args[1].toInt(), args[2].toInt())
        val report = runBlocking {
            TakeoutZipImporter(sink, MemoryMarks(), TakeoutReplayer { _, _ -> 0 }, TakeoutTimeConfig(ZoneOffset.UTC), nowMillis = { NOW_MS })
                .import(listOf(part))
        }
        if (args[0] == "many") {
            println("RESULT files=${report.filesImported} rows=${sink.rows} outcome=${report.outcome} largest=${sink.largestBatch} maxMb=${Runtime.getRuntime().maxMemory() / (1024 * 1024)}")
            exitProcess(0)
        }
        val file = report.files.single()
        println("RESULT rows=${sink.rows} batches=${sink.batches} largest=${sink.largestBatch} outOfOrder=${sink.outOfOrder} " +
            "status=${file.status} bytes=${file.sizeBytes} read=${file.rowsRead} maxMb=${Runtime.getRuntime().maxMemory() / (1024 * 1024)}")
        exitProcess(0)
    }
}
