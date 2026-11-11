package app.fitdash.health

import android.content.Context
import android.util.Log
import java.io.File
import java.io.ObjectInputStream
import java.io.ObjectOutputStream
import java.io.Serializable
import java.time.Instant

// The last raw snapshot, so a launch shows yesterday's dashboard instantly while the fresh read runs.
data class CachedSnapshot(val snapshot: HealthSnapshot, val readAt: Instant, val fullReadAt: Instant) : Serializable {
    companion object {
        const val VERSION = 1
    }
}

interface SnapshotStore {
    fun load(): CachedSnapshot?
    fun save(cached: CachedSnapshot)
    fun clear()
}

class SnapshotCache(context: Context) : SnapshotStore {
    private val file = File(context.filesDir, "snapshot.bin")

    override fun load(): CachedSnapshot? = try {
        if (!file.exists()) null
        else ObjectInputStream(file.inputStream().buffered()).use { input ->
            if (input.readInt() != CachedSnapshot.VERSION) null else input.readObject() as CachedSnapshot
        }
    } catch (e: Exception) {
        Log.w("fitdash", "Snapshot cache unreadable, starting fresh", e)
        file.delete()
        null
    }

    override fun save(cached: CachedSnapshot) {
        try {
            // A unique temp file: the dashboard and the background worker may save at the same moment.
            val tmp = File.createTempFile("snapshot", ".tmp", file.parentFile)
            ObjectOutputStream(tmp.outputStream().buffered()).use { out ->
                out.writeInt(CachedSnapshot.VERSION)
                out.writeObject(cached)
            }
            tmp.renameTo(file)
        } catch (e: Exception) {
            Log.w("fitdash", "Could not save the snapshot cache", e)
        }
    }

    override fun clear() {
        file.delete()
    }
}
