package com.apex.athlete.core.database.security

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Generates and guards the database passphrase.
 *
 * A random 256-bit passphrase is created once. It is stored only in encrypted form: wrapped with
 * an AES-256-GCM key that lives inside the Android Keystore and cannot be exported from the
 * device. Copying the app's files off the phone therefore yields neither the passphrase nor
 * readable health data.
 *
 * The app must be declared with `android:allowBackup="false"`: a wrapped passphrase restored onto
 * another phone could not be unwrapped there, and health data should not travel in cloud backups.
 */
class DatabasePassphraseStore(context: Context) {

    private val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    /** Returns the passphrase as ASCII bytes, creating and persisting it on first use. */
    @Synchronized
    fun getOrCreate(): ByteArray {
        prefs.getString(KEY_WRAPPED_PASSPHRASE, null)?.let { return unwrap(it) }

        val random = ByteArray(PASSPHRASE_BYTES).also { SecureRandom().nextBytes(it) }
        // Hex keeps the passphrase free of zero bytes, which C string handling could truncate.
        val passphrase = random.joinToString("") { "%02x".format(it) }.toByteArray(Charsets.US_ASCII)
        check(prefs.edit().putString(KEY_WRAPPED_PASSPHRASE, wrap(passphrase)).commit()) {
            "Could not persist the database passphrase"
        }
        return passphrase
    }

    @Synchronized
    fun clear() {
        prefs.edit().remove(KEY_WRAPPED_PASSPHRASE).commit()
        KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }.deleteEntry(KEY_ALIAS)
    }

    private fun wrap(plain: ByteArray): String {
        val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, wrappingKey()) }
        val iv = cipher.iv
        val encrypted = cipher.doFinal(plain)
        val out = ByteArray(1 + iv.size + encrypted.size)
        out[0] = iv.size.toByte()
        iv.copyInto(out, 1)
        encrypted.copyInto(out, 1 + iv.size)
        return Base64.encodeToString(out, Base64.NO_WRAP)
    }

    private fun unwrap(stored: String): ByteArray {
        val bytes = Base64.decode(stored, Base64.NO_WRAP)
        val ivSize = bytes[0].toInt()
        val iv = bytes.copyOfRange(1, 1 + ivSize)
        val encrypted = bytes.copyOfRange(1 + ivSize, bytes.size)
        val cipher = Cipher.getInstance(TRANSFORMATION).apply {
            init(Cipher.DECRYPT_MODE, wrappingKey(), GCMParameterSpec(GCM_TAG_BITS, iv))
        }
        return cipher.doFinal(encrypted)
    }

    private fun wrappingKey(): SecretKey {
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
        const val PREFS_NAME = "apex_database_key"
        const val KEY_WRAPPED_PASSPHRASE = "wrapped_passphrase"
        const val KEY_ALIAS = "apex_database_wrapping_key"
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val GCM_TAG_BITS = 128
        const val PASSPHRASE_BYTES = 32
    }
}
