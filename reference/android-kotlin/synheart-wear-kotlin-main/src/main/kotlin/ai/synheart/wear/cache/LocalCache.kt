package ai.synheart.wear.cache

import android.content.Context
import ai.synheart.wear.models.WearMetrics
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.InternalSerializationApi
import java.io.File

/**
 * Local cache for biometric data with optional encryption
 *
 * @param context Android application context
 * @param enableEncryption Whether to encrypt cached data
 */
@OptIn(InternalSerializationApi::class)
class LocalCache(
    private val context: Context,
    private val enableEncryption: Boolean
) {
    private val cacheDir: File by lazy {
        File(context.cacheDir, "synheart_wear").apply {
            if (!exists()) mkdirs()
        }
    }

    /**
     * Store a biometric session
     *
     * @param metrics WearMetrics to store
     */
    suspend fun storeSession(metrics: WearMetrics) = withContext(Dispatchers.IO) {
        // Simplified implementation - stores to file
        val file = File(cacheDir, "session_${metrics.timestamp}.json")
        // In production, serialize and optionally encrypt the metrics
        file.writeText(metrics.toString())
    }

    /**
     * Get cached sessions within time range
     *
     * @param startTime Start time in milliseconds
     * @param endTime End time in milliseconds
     * @param limit Maximum number of sessions to return
     * @return List of cached WearMetrics
     */
    suspend fun getSessions(
        startTime: Long,
        endTime: Long,
        limit: Int
    ): List<WearMetrics> = withContext(Dispatchers.IO) {
        // Simplified implementation
        emptyList()
    }

    /**
     * Get cache statistics
     *
     * @return Map containing cache statistics
     */
    suspend fun getStats(): Map<String, Any> = withContext(Dispatchers.IO) {
        val files = cacheDir.listFiles() ?: emptyArray()
        mapOf(
            "total_sessions" to files.size,
            "total_size_bytes" to files.sumOf { it.length() },
            "oldest_session_ms" to (files.minOfOrNull { it.lastModified() } ?: 0L),
            "newest_session_ms" to (files.maxOfOrNull { it.lastModified() } ?: 0L)
        )
    }

    /**
     * Clear old cached data
     *
     * @param maxAge Maximum age in milliseconds
     */
    suspend fun clearOldData(maxAge: Long) = withContext(Dispatchers.IO) {
        val cutoffTime = System.currentTimeMillis() - maxAge
        cacheDir.listFiles()?.forEach { file ->
            if (file.lastModified() < cutoffTime) {
                file.delete()
            }
        }
    }

    /**
     * Purge all cached data (GDPR compliance)
     */
    suspend fun purgeAll() = withContext(Dispatchers.IO) {
        cacheDir.listFiles()?.forEach { it.delete() }
    }
}
