package com.apex.athlete.core.data.coach.ask

/**
 * Where the owner's Anthropic API key lives. The key is a secret: it is never logged, never put in
 * an exception message, never exported, and `toString` of nothing here shows it.
 */
interface AiKeyStore {
    fun has(): Boolean

    /** The key for one request. Callers must not keep or log it. */
    fun get(): String?

    fun set(key: String)

    /** Forgets the key (the AI coach switch, or "Delete all my data"). */
    fun clear()
}

class InMemoryAiKeyStore(initial: String? = null) : AiKeyStore {
    @Volatile private var key: String? = initial?.takeIf { it.isNotBlank() }
    override fun has() = key != null
    override fun get() = key
    override fun set(key: String) { this.key = key.trim().takeIf { it.isNotEmpty() } }
    override fun clear() { key = null }
    override fun toString() = "InMemoryAiKeyStore(has=${has()})"
}
