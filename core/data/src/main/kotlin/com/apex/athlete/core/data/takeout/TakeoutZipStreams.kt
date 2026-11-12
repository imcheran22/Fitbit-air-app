package com.apex.athlete.core.data.takeout

import kotlinx.serialization.Serializable
import java.io.BufferedInputStream
import java.io.EOFException
import java.io.FilterInputStream
import java.io.IOException
import java.io.InputStream
import java.util.zip.CRC32
import java.util.zip.ZipException
import java.util.zip.ZipInputStream

/** What happened when one picked file was read as a ZIP. */
@Serializable
enum class TakeoutPartStatus {
    /** Read to the end. */
    OK,

    /** The stream does not start like a ZIP (wrong file picked). */
    NOT_A_ZIP,

    /** A gzip/tar export; Takeout offers `.tgz` as an alternative to `.zip`, which this engine does not read. */
    UNSUPPORTED_TGZ,

    /** The ZIP ends early or is damaged; entries before the damage were read. */
    TRUNCATED,

    /** The file could not be opened or read (permission gone, storage error). */
    UNREADABLE,
}

/**
 * The stream handed to a parser for one entry. Closing it does nothing to the archive: parsers
 * wrap it in readers and close them freely, and the ZIP stays open for the next entry. It also
 * counts the uncompressed bytes and computes their CRC-32 as they pass, which is the change signal
 * stored in the watermark (the sizes in a ZIP's local headers are often absent in streamed
 * archives, so they are never relied on).
 */
class TakeoutEntryStream internal constructor(private val zip: InputStream) : InputStream() {
    private val crc = CRC32()
    private var closedByReader = false
    private var finished = false

    /** Uncompressed bytes read so far; the entry's full size once [drain] has returned. */
    var bytesRead = 0L
        private set

    /** CRC-32 of the bytes read so far. */
    val crc32: Long get() = crc.value

    /** Largest single read a consumer asked for; lets tests prove nothing slurps a whole entry. */
    var largestReadRequest = 0
        private set

    override fun read(): Int {
        if (finished) return -1
        val b = zip.read()
        if (b < 0) {
            finished = true
            return -1
        }
        crc.update(b)
        bytesRead++
        return b
    }

    override fun read(b: ByteArray, off: Int, len: Int): Int {
        if (len > largestReadRequest) largestReadRequest = len
        if (finished) return -1
        if (len == 0) return 0
        val n = zip.read(b, off, len)
        if (n < 0) {
            finished = true
            return -1
        }
        crc.update(b, off, n)
        bytesRead += n
        return n
    }

    /** Does not close the archive. Reading after a close still works, so the rest can be drained for the CRC. */
    override fun close() {
        closedByReader = true
    }

    override fun available(): Int = 0

    override fun markSupported(): Boolean = false

    /** Reads whatever the consumer left unread, in small chunks, so size and CRC cover the whole entry. */
    fun drain() {
        if (finished) return
        val scratch = ByteArray(DRAIN_CHUNK)
        while (true) {
            val n = zip.read(scratch, 0, scratch.size)
            if (n < 0) break
            crc.update(scratch, 0, n)
            bytesRead += n
        }
        finished = true
    }

    private companion object {
        const val DRAIN_CHUNK = 32 * 1024
    }
}

/** A stream wrapper whose close is a no-op; used where a consumer must not close what it was given. */
class NonClosingInputStream(input: InputStream) : FilterInputStream(input) {
    override fun close() = Unit
}

/** Walks the entries of one picked file as a forward-only stream. Nothing is extracted or buffered beyond a read chunk. */
internal object TakeoutZipWalker {

    /**
     * Calls [onEntry] for every file entry in order. [onEntry] receives the entry's ordinal in
     * the archive (directories included in the count, so the same entry has the same ordinal on
     * every pass), its name, and a lazily created stream; it returns false to stop early.
     *
     * Never throws for a damaged or unreadable archive: the status says what happened and the
     * entries delivered before the damage stand. Exceptions thrown by [onEntry] itself that are
     * not I/O errors (cancellation, database errors) pass through.
     */
    inline fun walk(part: TakeoutArchivePart, onEntry: (ordinal: Int, name: String, open: () -> TakeoutEntryStream, size: () -> Long) -> Boolean): TakeoutPartStatus {
        val raw: InputStream = try {
            part.open()
        } catch (e: IOException) {
            return TakeoutPartStatus.UNREADABLE
        } catch (e: SecurityException) {
            return TakeoutPartStatus.UNREADABLE
        }
        // Whatever is outermost is closed at the end: closing the ZIP stream also frees its inflater.
        var outermost: InputStream = raw
        try {
            val buffered = BufferedInputStream(raw, BUFFER_BYTES)
            when (sniff(buffered)) {
                Magic.ZIP -> Unit
                Magic.GZIP -> return TakeoutPartStatus.UNSUPPORTED_TGZ
                Magic.OTHER -> return TakeoutPartStatus.NOT_A_ZIP
            }
            val zip = ZipInputStream(buffered)
            outermost = zip
            var ordinal = -1
            while (true) {
                val entry = zip.nextEntry ?: break
                ordinal++
                if (entry.isDirectory) continue
                var stream: TakeoutEntryStream? = null
                val keepGoing = onEntry(
                    ordinal,
                    entry.name.orEmpty(),
                    { stream ?: TakeoutEntryStream(zip).also { stream = it } },
                    {
                        // Known only after the entry has been read through when the ZIP was streamed.
                        zip.closeEntry()
                        entry.size
                    },
                )
                if (!keepGoing) break
                // Reads through whatever was not consumed; this is also how an unread entry is skipped.
                zip.closeEntry()
            }
            return TakeoutPartStatus.OK
        } catch (e: EOFException) {
            return TakeoutPartStatus.TRUNCATED
        } catch (e: ZipException) {
            return TakeoutPartStatus.TRUNCATED
        } catch (e: IOException) {
            return TakeoutPartStatus.UNREADABLE
        } catch (e: SecurityException) {
            return TakeoutPartStatus.UNREADABLE
        } finally {
            try {
                outermost.close()
            } catch (_: IOException) {
                // Nothing useful to do; the stream is being discarded.
            }
        }
    }

    enum class Magic { ZIP, GZIP, OTHER }

    /** Looks at the first four bytes without consuming them. */
    fun sniff(input: BufferedInputStream): Magic {
        input.mark(8)
        val head = ByteArray(4)
        var n = 0
        while (n < 4) {
            val r = input.read(head, n, 4 - n)
            if (r < 0) break
            n += r
        }
        input.reset()
        if (n >= 2 && head[0] == 0x1f.toByte() && head[1] == 0x8b.toByte()) return Magic.GZIP
        if (n < 4 || head[0] != 'P'.code.toByte() || head[1] != 'K'.code.toByte()) return Magic.OTHER
        val a = head[2].toInt()
        val b = head[3].toInt()
        // Local file header, end of central directory (an empty archive), or the spanning marker.
        return if ((a == 3 && b == 4) || (a == 5 && b == 6) || (a == 7 && b == 8)) Magic.ZIP else Magic.OTHER
    }

    const val BUFFER_BYTES = 64 * 1024
}
