package com.apex.athlete.widget

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put

/**
 * JSON form of [WidgetSnapshot]. Reading is tolerant and never throws: unknown keys are ignored, an unknown
 * status or a missing number becomes "no data", and anything unreadable (not JSON, wrong version, no timestamp)
 * returns null, which the widgets show as the neutral "Open Apex" state.
 */
object WidgetSnapshotJson {

    fun encode(snapshot: WidgetSnapshot): String = buildJsonObject {
        put("v", snapshot.version)
        put("updatedAt", snapshot.updatedAtMillis)
        put("epochDay", snapshot.epochDay)
        put("demo", snapshot.isDemo)
        put("recovery", metricJson(snapshot.recovery))
        put("sleep", metricJson(snapshot.sleep))
        put("strain", metricJson(snapshot.strain))
        put(
            "heartRate",
            buildJsonObject {
                put("bpm", snapshot.heartRateBpm)
                put("at", snapshot.heartRateAtMillis)
                put("prov", snapshot.heartRateProvenance)
            },
        )
    }.toString()

    /** The snapshot in [text], or null when it cannot be trusted. */
    fun decode(text: String): WidgetSnapshot? = try {
        parse(text)
    } catch (_: Exception) {
        null
    }

    private fun metricJson(m: WidgetMetric): JsonObject = buildJsonObject {
        put("state", m.status.key)
        put("value", m.value?.takeIf { it.isFinite() })
        put("band", m.band)
        put("prov", m.provenance)
        put("provisional", m.provisional)
        put("days", m.calibrationDaysLeft)
        put("reason", m.reason)
    }

    private fun parse(text: String): WidgetSnapshot? {
        val root = Json.parseToJsonElement(text) as? JsonObject ?: return null
        if (root.int("v") != WidgetSnapshot.CURRENT_VERSION) return null
        val updatedAt = root.long("updatedAt") ?: return null
        val epochDay = root.long("epochDay") ?: return null
        val heart = root["heartRate"] as? JsonObject
        val bpm = heart?.int("bpm")?.takeIf { it > 0 }
        val at = heart?.long("at")
        return WidgetSnapshot(
            updatedAtMillis = updatedAt,
            epochDay = epochDay,
            isDemo = root.bool("demo") ?: false,
            recovery = parseMetric(root["recovery"] as? JsonObject),
            sleep = parseMetric(root["sleep"] as? JsonObject),
            strain = parseMetric(root["strain"] as? JsonObject),
            // A reading needs both its number and its time; one without the other is not a reading.
            heartRateBpm = if (bpm != null && at != null) bpm else null,
            heartRateAtMillis = if (bpm != null && at != null) at else null,
            heartRateProvenance = heart?.string("prov"),
        )
    }

    private fun parseMetric(o: JsonObject?): WidgetMetric {
        if (o == null) return WidgetMetric.NO_DATA
        val status = WidgetMetricStatus.fromKey(o.string("state")) ?: return WidgetMetric.NO_DATA
        return when (status) {
            WidgetMetricStatus.VALUE -> {
                val value = o.double("value")?.takeIf { it.isFinite() } ?: return WidgetMetric.NO_DATA
                WidgetMetric(
                    status = status,
                    value = value,
                    provenance = o.string("prov"),
                    provisional = o.bool("provisional") ?: false,
                    band = o.string("band"),
                )
            }
            WidgetMetricStatus.CALIBRATING -> WidgetMetric(
                status = status,
                calibrationDaysLeft = o.int("days")?.takeIf { it > 0 },
            )
            WidgetMetricStatus.UNAVAILABLE -> WidgetMetric(status = status, reason = o.string("reason"))
        }
    }

    private fun JsonObject.prim(key: String): JsonPrimitive? = (this[key] as? JsonPrimitive)?.takeIf { it !is JsonNull }

    private fun JsonObject.string(key: String): String? = prim(key)?.takeIf { it.isString }?.content

    private fun JsonObject.long(key: String): Long? = prim(key)?.takeIf { !it.isString }?.longOrNull

    private fun JsonObject.int(key: String): Int? = prim(key)?.takeIf { !it.isString }?.intOrNull

    private fun JsonObject.double(key: String): Double? = prim(key)?.takeIf { !it.isString }?.doubleOrNull

    private fun JsonObject.bool(key: String): Boolean? = prim(key)?.takeIf { !it.isString }?.booleanOrNull
}
