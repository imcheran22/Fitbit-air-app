package org.openstrap.protocol.crypto

import org.openstrap.protocol.ByteWriter
import org.openstrap.protocol.u32
import java.util.zip.CRC32
import javax.crypto.Cipher
import javax.crypto.spec.SecretKeySpec

/** AES-128-ECB without padding, the only block primitive the strap uses. */
object Aes {
    fun encrypt(key: ByteArray, data: ByteArray): ByteArray {
        require(key.size == 16 && data.size % 16 == 0)
        return Cipher.getInstance("AES/ECB/NoPadding").run {
            init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"))
            doFinal(data)
        }
    }

    fun decrypt(key: ByteArray, data: ByteArray): ByteArray {
        require(key.size == 16 && data.size % 16 == 0)
        return Cipher.getInstance("AES/ECB/NoPadding").run {
            init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"))
            doFinal(data)
        }
    }
}

fun crc32(data: ByteArray): Long = CRC32().apply { update(data) }.value

class DecryptException(message: String) : Exception(message)

/**
 * Per-connection channel encryption (docs/protocol/01 §3.3, §3.6).
 * Derived from the ECDH shared secret S (24 bytes) and the 16-byte auth key K.
 */
class ChannelCipher(sharedSecret: ByteArray, authKey: ByteArray) {
    init {
        require(sharedSecret.size >= 24 && authKey.size == 16)
    }

    val sessionKey: ByteArray = ByteArray(16) { (sharedSecret[8 + it].toInt() xor authKey[it].toInt()).toByte() }
    var txCounter: Long = sharedSecret.u32(0)
        private set
    var rxCounter: Long = sharedSecret.u32(4)
        private set

    private fun messageKey(sessionId: Int) = ByteArray(16) { (sessionKey[it].toInt() xor sessionId).toByte() }

    /** Returns the ciphertext; the chunk header's totalLength stays [payload].size. */
    fun encrypt(sessionId: Int, payload: ByteArray): ByteArray {
        val withCounter = ByteWriter().bytes(payload).u32(txCounter).toByteArray()
        val plain = ByteWriter().bytes(withCounter).u32(crc32(withCounter)).toByteArray()
        val padded = plain.copyOf(ceil16(plain.size))
        txCounter = (txCounter + 1) % MOD
        return Aes.encrypt(messageKey(sessionId), padded)
    }

    fun decrypt(sessionId: Int, cipher: ByteArray, totalLength: Int): ByteArray {
        if (cipher.size != encryptedSize(totalLength)) throw DecryptException("Bad encrypted length ${cipher.size}")
        val plain = Aes.decrypt(messageKey(sessionId), cipher)
        val payload = plain.copyOfRange(0, totalLength)
        val counter = plain.u32(totalLength)
        val crc = plain.u32(totalLength + 4)
        if (crc32(plain.copyOfRange(0, totalLength + 4)) != crc) throw DecryptException("CRC mismatch")
        if (((counter - rxCounter) + MOD) % MOD > REPLAY_WINDOW) throw DecryptException("Counter outside replay window")
        rxCounter = counter
        return payload
    }

    companion object {
        private const val MOD = 0xFFFFFFFFL
        private const val REPLAY_WINDOW = 100_000L
        fun ceil16(n: Int) = (n + 15) / 16 * 16
        fun encryptedSize(totalLength: Int) = ceil16(totalLength + 8)
    }
}
