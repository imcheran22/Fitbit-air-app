package org.openstrap.protocol.history

import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File

/**
 * Manual check: runs every parser over raw dumps from the app's debug dump (`<code>_<headerTime>.bin`)
 * and writes what it decoded. Skipped unless RAW_DIR is set.
 */
class RawDumpReport {
    @Test
    fun report() {
        val dir = System.getenv("RAW_DIR")?.let(::File)
        assumeTrue(dir != null && dir.isDirectory)
        val out = StringBuilder()
        dir!!.listFiles { f -> f.name.matches(Regex("""\d+_\d+\.bin""")) }!!.sortedBy { it.name.substringBefore('_').toInt() }.forEach { f ->
            val (code, header) = f.nameWithoutExtension.split('_').map { it.toLong() }
            val bytes = f.readBytes()
            val spec = HistoryTypeSpecs.forCode(code.toInt())
            out.appendLine("== type $code ${HistoryDataType.fromCode(code.toInt())} header=$header bytes=${bytes.size} parser=${spec?.parser != null}")
            val p = spec?.parser ?: return@forEach
            val size = if (code == 1L) ActivityLayout.detect(bytes) else 4
            when (val r = p.parse(bytes, ParseContext(header, activityRecordSize = size))) {
                is ParseResult.Failure -> out.appendLine("  FAILED: ${r.reason}")
                is ParseResult.Success -> {
                    out.appendLine("  ${r.records.size} records, next=${r.nextCursor}, dropped=${r.droppedBytes}")
                    r.records.forEach { out.appendLine("  ${java.time.Instant.ofEpochSecond(it.timestamp)} $it".take(400)) }
                }
            }
        }
        File(dir, "report.txt").writeText(out.toString())
    }
}
