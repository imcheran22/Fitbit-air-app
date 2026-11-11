package app.fitdash.health

import app.fitdash.settings.NutrientKind
import java.time.Instant
import java.time.ZonedDateTime

enum class Availability { AVAILABLE, NOT_INSTALLED, NEEDS_UPDATE }

interface HealthSource {
    val allPermissions: Set<String>
    // The "read older data" permission when this build declares it, else null.
    val historyPermission: String? get() = null
    // The "read while closed" permission when this build declares it and this Health Connect supports it, else null.
    suspend fun backgroundPermission(): String? = null
    fun availability(): Availability
    suspend fun grantedPermissions(): Set<String>
    // `since` limits record reads to that instant onwards (aggregates still cover the whole window); null reads everything.
    // `onProgress` hears each record type as it lands: types done, types in all, and the one that just finished.
    suspend fun read(now: ZonedDateTime, since: Instant? = null, onProgress: (ReadProgress) -> Unit = {}): HealthSnapshot
    suspend fun addWater(liters: Double, at: Instant): String?
    suspend fun deleteWater(id: String): Boolean
    suspend fun addSteps(start: Instant, end: Instant, count: Long): Boolean
    suspend fun addSleep(start: Instant, end: Instant): String?
    suspend fun deleteSleep(id: String): Boolean
    suspend fun setHeight(meters: Double, at: Instant): Boolean
    suspend fun addNutrient(kind: NutrientKind, amount: Double, at: Instant): String?
    suspend fun deleteNutrient(id: String): Boolean
}
