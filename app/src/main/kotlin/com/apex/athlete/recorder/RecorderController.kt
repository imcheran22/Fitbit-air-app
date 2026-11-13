package com.apex.athlete.recorder

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File

/**
 * Single owner of the live session. The service, the screen and the notification all go through it; every
 * change is persisted before it is published. [session] is null when nothing is being recorded.
 */
class RecorderController(private val store: SessionStore, private val clock: () -> Long = System::currentTimeMillis) {
    private val lock = Any()
    private val _session = MutableStateFlow(store.load())
    val session: StateFlow<RecorderSession?> = _session.asStateFlow()

    fun now(): Long = clock()

    /** Starts a new recording; ignored (returns the existing one) when a session already exists. */
    fun start(): RecorderSession = synchronized(lock) {
        _session.value ?: RecorderSession.start(clock()).also(::commit)
    }

    fun pause() = update { it.pause(clock()) }
    fun resume() = update { it.resume(clock()) }
    fun stop() = update { it.stop(clock()) }
    fun heartRate(bpm: Int) = update { it.withHeartRate(bpm) }

    /** Forgets the session (after saving or discarding). */
    fun clear() {
        synchronized(lock) {
            store.save(null)
            _session.value = null
        }
    }

    private fun update(f: (RecorderSession) -> RecorderSession) {
        synchronized(lock) {
            val cur = _session.value
            if (cur != null) {
                val next = f(cur)
                if (next != cur) commit(next)
            }
        }
    }

    private fun commit(s: RecorderSession) {
        store.save(s)
        _session.value = s
    }

    companion object {
        @Volatile private var instance: RecorderController? = null

        fun shared(context: Context): RecorderController = instance ?: synchronized(this) {
            instance ?: RecorderController(SessionStore(File(context.applicationContext.filesDir, "recorder/session.json"))).also { instance = it }
        }
    }
}
