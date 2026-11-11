package com.apex.athlete.core.network.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import com.apex.athlete.core.network.NetworkJson
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.Json
import java.security.KeyStore
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Keeps the OAuth tokens (and an in-progress authorization) on the phone, encrypted.
 *
 * Each stored value is encrypted with AES-256-GCM using a key that lives in the Android Keystore
 * and cannot be exported. The value's name is bound in as additional authenticated data, so one
 * entry cannot be swapped for another. This follows the approach of `DatabasePassphraseStore`; the
 * deprecated `security-crypto` library is not used.
 *
 * The app must be declared with `android:allowBackup="false"`: a restored blob could not be
 * decrypted on another phone anyway, and it would be useless there.
 */
class EncryptedTokenStore(
    context: Context,
    private val json: Json = NetworkJson.instance,
) : TokenStore, PendingAuthorizationStore {

    private val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val state = MutableStateFlow(readInitialState())

    override val authState: StateFlow<AuthState> = state.asStateFlow()

    override fun currentState(): AuthState = state.value

    @Synchronized
    override fun load(): StoredTokens? = readEncrypted(KEY_TOKENS)?.let {
        try {
            json.decodeFromString(StoredTokens.serializer(), it)
        } catch (_: Exception) {
            null
        }
    }

    @Synchronized
    override fun save(tokens: StoredTokens) {
        val blob = encrypt(KEY_TOKENS, json.encodeToString(StoredTokens.serializer(), tokens))
        check(prefs.edit().putString(KEY_TOKENS, blob).remove(KEY_REAUTH_REASON).commit()) {
            "Could not persist the sign-in"
        }
        state.value = AuthState.SignedIn(tokens.grantedScopes)
    }

    @Synchronized
    override fun markNeedsReauth(reason: ReauthReason) {
        prefs.edit().remove(KEY_TOKENS).putString(KEY_REAUTH_REASON, reason.name).commit()
        state.value = AuthState.NeedsReauth(reason)
    }

    @Synchronized
    override fun clear() {
        prefs.edit().remove(KEY_TOKENS).remove(KEY_REAUTH_REASON).commit()
        state.value = AuthState.SignedOut
    }

    @Synchronized
    override fun savePending(pending: PendingAuthorization) {
        val blob = encrypt(KEY_PENDING, json.encodeToString(PendingAuthorization.serializer(), pending))
        check(prefs.edit().putString(KEY_PENDING, blob).commit()) { "Could not persist the pending sign-in" }
    }

    @Synchronized
    override fun loadPending(): PendingAuthorization? = readEncrypted(KEY_PENDING)?.let {
        try {
            json.decodeFromString(PendingAuthorization.serializer(), it)
        } catch (_: Exception) {
            null
        }
    }

    @Synchronized
    override fun clearPending() {
        prefs.edit().remove(KEY_PENDING).commit()
    }

    /** Removes everything this store holds, including the Keystore key (used by "delete all data"). */
    @Synchronized
    fun wipe() {
        prefs.edit().clear().commit()
        try {
            KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }.deleteEntry(KEY_ALIAS)
        } catch (_: Exception) {
            // The key may not exist; nothing left to delete.
        }
        state.value = AuthState.SignedOut
    }

    private fun readInitialState(): AuthState {
        val tokens = load()
        if (tokens != null) return AuthState.SignedIn(tokens.grantedScopes)
        val reason = prefs.getString(KEY_REAUTH_REASON, null)
            ?.let { name -> ReauthReason.entries.firstOrNull { it.name == name } }
        return if (reason != null) AuthState.NeedsReauth(reason) else AuthState.SignedOut
    }

    /** Returns the decrypted value, or null if absent or unreadable (unreadable entries are dropped). */
    private fun readEncrypted(name: String): String? {
        val stored = prefs.getString(name, null) ?: return null
        return try {
            decrypt(name, stored)
        } catch (_: Exception) {
            // Key lost or blob damaged (for example after a restore). Forget it; the owner signs in again.
            prefs.edit().remove(name).commit()
            null
        }
    }

    private fun encrypt(name: String, plain: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, secretKey()) }
        cipher.updateAAD(name.toByteArray(Charsets.UTF_8))
        val iv = cipher.iv
        val encrypted = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        val out = ByteArray(1 + iv.size + encrypted.size)
        out[0] = iv.size.toByte()
        iv.copyInto(out, 1)
        encrypted.copyInto(out, 1 + iv.size)
        return Base64.getEncoder().encodeToString(out)
    }

    private fun decrypt(name: String, stored: String): String {
        val bytes = Base64.getDecoder().decode(stored)
        val ivSize = bytes[0].toInt()
        val iv = bytes.copyOfRange(1, 1 + ivSize)
        val encrypted = bytes.copyOfRange(1 + ivSize, bytes.size)
        val cipher = Cipher.getInstance(TRANSFORMATION).apply {
            init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(GCM_TAG_BITS, iv))
        }
        cipher.updateAAD(name.toByteArray(Charsets.UTF_8))
        return String(cipher.doFinal(encrypted), Charsets.UTF_8)
    }

    private fun secretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }

        val spec = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build()
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
            .apply { init(spec) }
            .generateKey()
    }

    private companion object {
        const val PREFS_NAME = "apex_oauth_tokens"
        const val KEY_TOKENS = "tokens"
        const val KEY_PENDING = "pending_authorization"
        const val KEY_REAUTH_REASON = "reauth_reason"
        const val KEY_ALIAS = "apex_oauth_wrapping_key"
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val GCM_TAG_BITS = 128
    }
}
