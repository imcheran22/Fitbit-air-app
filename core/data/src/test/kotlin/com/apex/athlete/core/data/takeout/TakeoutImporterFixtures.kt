package com.apex.athlete.core.data.takeout

import com.apex.athlete.core.data.worker.TakeoutImportCodec
import com.apex.athlete.core.data.worker.TakeoutImportSummary
import kotlinx.coroutines.runBlocking

/** Builds real reports by running the engine on tiny archives, for tests of code that consumes reports. */
object TakeoutImporterFixtures {
    fun summary(): TakeoutImportSummary {
        val sink = MemorySink()
        val report = runBlocking {
            importer(sink, MemoryMarks(), RecordingReplayer())
                .import(listOf(partOf(zipOf("${HR_PATH}2024-06-10.json" to heartRateJson(clockTexts("06/10/24", 3).map { Triple(it, 60, 2) })))))
        }
        return TakeoutImportCodec.summaryOf(report)
    }

    /** The failure code for one picked part per given status; null when the run was usable. */
    fun failureFor(vararg parts: TakeoutPartStatus): String? {
        val good = zipOf("${HR_PATH}2024-06-10.json" to heartRateJson(clockTexts("06/10/24", 3).map { Triple(it, 60, 2) }))
        val picked = parts.map { status ->
            when (status) {
                TakeoutPartStatus.OK -> partOf(good)
                TakeoutPartStatus.NOT_A_ZIP -> partOf("not a zip".toByteArray())
                TakeoutPartStatus.UNSUPPORTED_TGZ -> partOf(byteArrayOf(0x1f, 0x8b.toByte(), 8, 0))
                else -> TakeoutArchivePart("p") { throw java.io.IOException("gone") }
            }
        }
        val report = runBlocking { importer(MemorySink(), MemoryMarks(), RecordingReplayer()).import(picked) }
        return TakeoutImportCodec.failureOf(report)
    }
}
