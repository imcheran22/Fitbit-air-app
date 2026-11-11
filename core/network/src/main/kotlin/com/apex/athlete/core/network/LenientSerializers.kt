package com.apex.athlete.core.network

import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive

/**
 * Google's JSON mapping writes 64-bit integers as strings (`"count": "1234"`) but older or
 * hand-made payloads may use plain numbers. This reads both and yields null for anything else,
 * so one odd value never fails a whole page.
 */
object LenientLongSerializer : KSerializer<Long?> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("LenientLong", PrimitiveKind.STRING)

    override fun deserialize(decoder: Decoder): Long? {
        val element = (decoder as? JsonDecoder)?.decodeJsonElement() ?: return decoder.decodeString().toLongOrNull()
        if (element is JsonNull || element !is JsonPrimitive) return null
        element.content.toLongOrNull()?.let { return it }
        val asDouble = element.content.toDoubleOrNull() ?: return null
        return if (asDouble.isFinite() && asDouble == Math.rint(asDouble)) asDouble.toLong() else null
    }

    override fun serialize(encoder: Encoder, value: Long?) {
        if (value == null) encoder.encodeNull() else encoder.encodeString(value.toString())
    }
}

/** Reads a number or numeric string as a double; anything else (including NaN text) becomes null. */
object LenientDoubleSerializer : KSerializer<Double?> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("LenientDouble", PrimitiveKind.DOUBLE)

    override fun deserialize(decoder: Decoder): Double? {
        val element = (decoder as? JsonDecoder)?.decodeJsonElement() ?: return decoder.decodeDouble()
        if (element is JsonNull || element !is JsonPrimitive) return null
        return element.content.toDoubleOrNull()?.takeIf { it.isFinite() }
    }

    override fun serialize(encoder: Encoder, value: Double?) {
        if (value == null) encoder.encodeNull() else encoder.encodeDouble(value)
    }
}
