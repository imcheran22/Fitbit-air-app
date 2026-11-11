package com.hcwebhook.app

import android.content.Context
import androidx.health.connect.client.permission.HealthPermission
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import java.time.Instant

/** The MCP tools of the app, on top of the same reads and syncs as the local HTTP server. */
class HealthMcpTools(private val context: Context) : McpTools {
    private val prefs = PreferencesManager(context)

    override suspend fun healthData(types: List<String>, start: String?, end: String?, days: Int?): String {
        val params = buildMap {
            start?.let { put("start", it) }
            end?.let { put("end", it) }
            days?.let { put("days", it.toString()) }
        }
        val syncManager = SyncManager(context)
        val result = when (val range = LocalHttpRange.parse(params)) {
            is LocalHttpRange.Result.Invalid -> throw IllegalArgumentException(range.message)
            is LocalHttpRange.Result.Valid -> syncManager.getRealtimeJsonPayload(start = range.start, end = range.end)
            LocalHttpRange.Result.None -> syncManager.getRealtimeJsonPayload(timeRangeDays = days ?: 1)
        }
        val payload = result.getOrThrow()
        if (types.isEmpty()) return payload
        // Keep the envelope and only the asked types, so a small question gets a small answer.
        val wanted = types.map { it.lowercase() }.toSet() + ENVELOPE_KEYS
        val json = Json.parseToJsonElement(payload).jsonObject
        return JsonObject(json.filterKeys { it in wanted }).toString()
    }

    override suspend fun dataTypes(): String {
        val enabled = prefs.getEnabledDataTypes()
        val granted = HealthConnectManager(context).getGrantedPermissions()
        val resolutions = prefs.getDataTypeResolutions()
        return buildJsonArray {
            HealthDataType.entries.forEach { type ->
                add(buildJsonObject {
                    put("type", type.name.lowercase())
                    put("name", context.getString(type.nameResId))
                    put("category", type.category.name.lowercase())
                    put("synced", type in enabled)
                    put("access", HealthPermission.getReadPermission(type.recordClass) in granted)
                    if (type.resolutionFamily != null) put("resolution_minutes", resolutions[type] ?: type.defaultResolutionMinutes)
                })
            }
        }.toString()
    }

    override suspend fun syncStatus(): String {
        val cutoff = System.currentTimeMillis() - 24 * 60 * 60 * 1000L
        val logs = prefs.getWebhookLogs().filter { it.timestamp >= cutoff && it.syncType != "test" }
        return buildJsonObject {
            put("last_sync", prefs.getLastSyncTime()?.let { Instant.ofEpochMilli(it).toString() })
            put("last_sync_summary", prefs.getLastSyncSummary())
            when (prefs.getSyncMode()) {
                SyncMode.INTERVAL -> putJsonObject("schedule") {
                    put("mode", "interval")
                    put("every_minutes", prefs.getSyncIntervalMinutes())
                }
                SyncMode.SCHEDULED -> putJsonObject("schedule") {
                    put("mode", "scheduled")
                    putJsonArray("times") { prefs.getScheduledSyncs().filter { it.enabled }.forEach { add(it.getDisplayTime()) } }
                }
            }
            put("webhooks", prefs.getWebhookConfigs().count { it.isEnabled })
            put("data_types", prefs.getEnabledDataTypes().size)
            putJsonObject("last_24_hours") {
                put("sent", logs.count { it.success })
                put("failed", logs.count { !it.success })
            }
        }.toString()
    }

    override suspend fun recentDeliveries(limit: Int, success: Boolean?): String {
        val logs = prefs.getWebhookLogs()
            .filter { success == null || it.success == success }
            .take(limit)
        // Only the host: a path or a query can hold a webhook secret.
        return buildJsonArray {
            logs.forEach { log ->
                add(buildJsonObject {
                    put("time", Instant.ofEpochMilli(log.timestamp).toString())
                    put("host", runCatching { java.net.URI(log.url).host }.getOrNull() ?: "unknown")
                    put("success", log.success)
                    put("status_code", log.statusCode)
                    put("items", log.recordCount)
                    put("sync_type", log.syncType)
                    if (!log.success) put("error", log.errorMessage)
                })
            }
        }.toString()
    }

    override val syncNow: (suspend () -> String)? = if (prefs.isMcpSyncAllowed()) {
        {
            val result = SyncManager(context).performSync(syncType = "mcp")
            result.fold(
                onSuccess = { sync ->
                    when (sync) {
                        is SyncResult.NoData -> "No new data."
                        is SyncResult.NoMatchingData -> "No data matches the webhook filters."
                        is SyncResult.Success -> "Sync done: " + sync.syncCounts.entries.joinToString { (type, count) -> "${type.name.lowercase()} $count" }
                    }
                },
                onFailure = { throw it },
            )
        }
    } else null

    private companion object {
        val ENVELOPE_KEYS = setOf("timestamp", "app_version", "timezone")
    }
}
