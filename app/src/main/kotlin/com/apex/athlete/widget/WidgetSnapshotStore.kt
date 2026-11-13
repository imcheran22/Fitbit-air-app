package com.apex.athlete.widget

import android.content.Context
import java.io.File
import java.io.FileOutputStream
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.StandardCopyOption

/**
 * The one small file the home-screen widgets read, in the app-private `noBackupFilesDir` (never backed up,
 * never shared). Writes are atomic (temp file, then rename), so a reader sees the old file or the new one and
 * never half of one. A missing or corrupt file reads as null, which the widgets show as the neutral state.
 * Nothing here touches the database.
 */
class WidgetSnapshotStore(private val directory: File) {

    private val file: File get() = File(directory, FILE_NAME)
    private val temp: File get() = File(directory, "$FILE_NAME.tmp")

    /** The stored snapshot, or null when there is none or it cannot be read. Never throws. */
    @Synchronized
    fun read(): WidgetSnapshot? = try {
        file.takeIf { it.isFile && it.length() in 1..MAX_BYTES }
            ?.readText(Charsets.UTF_8)
            ?.let(WidgetSnapshotJson::decode)
    } catch (_: Exception) {
        null
    }

    /** Writes [snapshot] atomically. Returns false when the write failed (the previous file stays as it was). */
    @Synchronized
    fun write(snapshot: WidgetSnapshot): Boolean = try {
        directory.mkdirs()
        FileOutputStream(temp).use { out ->
            out.write(WidgetSnapshotJson.encode(snapshot).toByteArray(Charsets.UTF_8))
            out.fd.sync()
        }
        moveIntoPlace()
        true
    } catch (_: Exception) {
        runCatching { temp.delete() }
        false
    }

    /** Deletes the snapshot (and any half-written temp file). Safe to call when nothing is stored. */
    @Synchronized
    fun clear() {
        runCatching { temp.delete() }
        runCatching { file.delete() }
    }

    fun exists(): Boolean = file.exists()

    private fun moveIntoPlace() {
        try {
            Files.move(temp.toPath(), file.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
        } catch (_: AtomicMoveNotSupportedException) {
            Files.move(temp.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING)
        }
    }

    companion object {
        const val FILE_NAME = "widget_snapshot.json"
        private const val MAX_BYTES = 16L * 1024

        /** The store in the app's `noBackupFilesDir`. */
        fun forContext(context: Context): WidgetSnapshotStore = WidgetSnapshotStore(context.applicationContext.noBackupFilesDir)
    }
}
