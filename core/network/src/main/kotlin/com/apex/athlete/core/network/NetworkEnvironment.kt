package com.apex.athlete.core.network

import kotlinx.coroutines.delay
import kotlinx.serialization.json.Json
import java.security.SecureRandom

/** Wall clock, injectable so expiry and back-off logic can be tested without waiting. */
fun interface NetClock {
    fun nowMillis(): Long

    companion object {
        val System: NetClock = NetClock { java.lang.System.currentTimeMillis() }
    }
}

/** Source of uniform random numbers in [0, 1) for back-off jitter, injectable for tests. */
fun interface JitterSource {
    fun nextDouble(): Double

    companion object {
        val Secure: JitterSource = object : JitterSource {
            private val random = SecureRandom()
            override fun nextDouble(): Double = random.nextDouble()
        }
    }
}

/** Suspends for a while; injectable so tests do not really wait. */
fun interface Sleeper {
    suspend fun sleep(millis: Long)

    companion object {
        val Real: Sleeper = Sleeper { delay(it) }
    }
}

/**
 * The one JSON configuration used for every response body.
 *
 * Tolerant reader: unknown fields are ignored, null or unknown values for properties that have a
 * default fall back to that default, and absent optionals are not written back.
 */
object NetworkJson {
    val instance: Json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        explicitNulls = false
        isLenient = true
    }
}
