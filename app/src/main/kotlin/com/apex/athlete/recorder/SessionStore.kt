package com.apex.athlete.recorder

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.longOrNull
import java.io.File

/**
 * Persists the in-progress (or stopped, not yet saved) session to one small private file so it survives process
 * death. Holds timestamps and heart-rate summary numbers for the current workout only; it is deleted when the
 * workout is saved or discarded. Atomic write (temp file then rename); a corrupt file reads as "no session".
 */
class SessionStore(private val file: File) {

    fun load(): RecorderSession? {
        if (!file.exists()) return null
        return try {
            decode(file.readText())
        } catch (e: Exception) {
            runCatching { file.delete() }
            null
        }
    }

    fun save(session: RecorderSession?) {
        if (session == null) {
            file.delete()
            return
        }
        file.parentFile?.mkdirs()
        val tmp = File(file.path + ".tmp")
        tmp.writeText(encode(session))
        if (!tmp.renameTo(file)) {
            file.delete()
            check(tmp.renameTo(file)) { "could not write the recorder session file" }
        }
    }

    companion object {
        private const val VERSION = 1

        fun encode(s: RecorderSession): String = JsonObject(
            buildMap {
                put("v", JsonPrimitive(VERSION))
                put("phase", JsonPrimitive(s.phase.name))
                put("start", JsonPrimitive(s.startedAtMillis))
                put("before", JsonPrimitive(s.activeBeforeSegmentMillis))
                s.segmentStartMillis?.let { put("segment", JsonPrimitive(it)) }
                put("hrCount", JsonPrimitive(s.hrSampleCount))
                put("hrSum", JsonPrimitive(s.hrSumBpm))
                s.hrMaxBpm?.let { put("hrMax", JsonPrimitive(it)) }
                put("strap", JsonPrimitive(s.usedStrap))
            },
        ).toString()

        fun decode(text: String): RecorderSession? {
            val o = Json.parseToJsonElement(text).jsonObject
            if (o["v"]?.let { (it as? JsonPrimitive)?.intOrNull } != VERSION) return null
            fun long(k: String) = (o[k] as? JsonPrimitive)?.longOrNull
            val phase = RecorderPhase.entries.firstOrNull { it.name == (o["phase"] as? JsonPrimitive)?.contentOrNull } ?: return null
            val start = long("start") ?: return null
            val before = long("before")?.takeIf { it >= 0 } ?: return null
            val segment = long("segment")
            if ((phase == RecorderPhase.RUNNING) != (segment != null)) return null
            return RecorderSession(
                phase = phase,
                startedAtMillis = start,
                activeBeforeSegmentMillis = before,
                segmentStartMillis = segment,
                hrSampleCount = (o["hrCount"] as? JsonPrimitive)?.intOrNull?.takeIf { it >= 0 } ?: 0,
                hrSumBpm = long("hrSum")?.takeIf { it >= 0 } ?: 0L,
                hrMaxBpm = (o["hrMax"] as? JsonPrimitive)?.intOrNull,
                usedStrap = (o["strap"] as? JsonPrimitive)?.booleanOrNull ?: false,
            )
        }
    }
}
