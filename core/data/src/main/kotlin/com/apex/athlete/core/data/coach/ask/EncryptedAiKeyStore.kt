package com.apex.athlete.core.data.coach.ask

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * The Anthropic key, encrypted with AES-256-GCM under a non-exportable Android Keystore key (same
 * approach as the OAuth token store). The entry name is bound in as additional authenticated data.
 * `allowBackup` must stay false: a restored blob cannot be decrypted on another phone.
 */
class EncryptedAiKeyStore(context: Context) : AiKeyStore {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    @Synchronized
    override fun has(): Boolean = get() != null

    @Synchronized
    override fun get(): String? {
        val stored = prefs.getString(ENTRY, null) ?: return null
        return try {
            decrypt(stored)
        } catch (_: Exception) {
            // Key lost or blob damaged (for example after a restore): forget it, the owner pastes the key again.
            prefs.edit().remove(ENTRY).commit()
            null
        }
    }

    @Synchronized
    override fun set(key: String) {
        val trimmed = key.trim()
        require(trimmed.isNotEmpty()) { "The key is empty" }
        check(prefs.edit().putString(ENTRY, encrypt(trimmed)).commit()) { "Could not store the key" }
    }

    @Synchronized
    override fun clear() {
        prefs.edit().clear().commit()
        try {
            KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }.deleteEntry(KEY_ALIAS)
        } catch (_: Exception) {
            // Nothing left to delete.
        }
    }

    override fun toString() = "EncryptedAiKeyStore"

    private fun encrypt(plain: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, secretKey()) }
        cipher.updateAAD(ENTRY.toByteArray(Charsets.UTF_8))
        val iv = cipher.iv
        val encrypted = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        val out = ByteArray(1 + iv.size + encrypted.size)
        out[0] = iv.size.toByte()
        iv.copyInto(out, 1)
        encrypted.copyInto(out, 1 + iv.size)
        return Base64.getEncoder().encodeToString(out)
    }

    private fun decrypt(stored: String): String {
        val bytes = Base64.getDecoder().decode(stored)
        val ivSize = bytes[0].toInt()
        val iv = bytes.copyOfRange(1, 1 + ivSize)
        val encrypted = bytes.copyOfRange(1 + ivSize, bytes.size)
        val cipher = Cipher.getInstance(TRANSFORMATION).apply {
            init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(GCM_TAG_BITS, iv))
        }
        cipher.updateAAD(ENTRY.toByteArray(Charsets.UTF_8))
        return String(cipher.doFinal(encrypted), Charsets.UTF_8)
    }

    private fun secretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val spec = KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build()
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE).apply { init(spec) }.generateKey()
    }

    private companion object {
        const val PREFS_NAME = "apex_ai_key"
        const val ENTRY = "anthropic_api_key"
        const val KEY_ALIAS = "apex_ai_key_wrapping_key"
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val GCM_TAG_BITS = 128
    }
}
