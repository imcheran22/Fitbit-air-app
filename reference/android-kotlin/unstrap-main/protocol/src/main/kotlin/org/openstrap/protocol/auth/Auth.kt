package org.openstrap.protocol.auth

import org.openstrap.protocol.ByteWriter
import org.openstrap.protocol.bytesOf
import org.openstrap.protocol.crypto.Aes
import org.openstrap.protocol.crypto.B163
import org.openstrap.protocol.crypto.ChannelCipher
import org.openstrap.protocol.u8
import java.security.SecureRandom

/** Auth endpoint and status codes (docs/protocol/01 §3.4). */
object Auth {
    const val ENDPOINT = 0x0082

    const val CMD_INFO = 0x00
    const val CMD_KEY_EXCHANGE = 0x04
    const val CMD_PROVE = 0x05

    const val STATUS_SUCCESS = 1

    private val STATUS_NAMES = mapOf(
        0 to "other error", 1 to "success", 2 to "invalid state", 3 to "unknown command",
        4 to "operation failed", 5 to "a workout is in progress", 6 to "invalid parameter",
        7 to "no key on the strap (it was unbound)", 8 to "signature verification failed",
        9 to "API level insufficient", 0x20 to "cannot save key", 0x21 to "rejected on the strap",
        0x22 to "public key hash failed", 0x23 to "AES failed", 0x24 to "out of memory",
        0x25 to "binding ciphertext mismatch", 0x26 to "wrong auth key",
        0x27 to "ECDH private key failed", 0x28 to "ECDH shared secret failed",
        0x41 to "binding protection is on", 0x81 to "local binding forbidden (cloud bind required)",
    )

    fun describe(status: Int): String = STATUS_NAMES[status] ?: "status 0x%02x".format(status)

    /** Strips the auth reply prefix `10 <cmd>` (always this form, 02 §7). Returns `[status][data…]`, or null. */
    fun stripReply(command: Int, reply: ByteArray): ByteArray? =
        if (reply.size >= 3 && reply.u8(0) == 0x10 && reply.u8(1) == command) reply.copyOfRange(2, reply.size) else null
}

class AuthException(val status: Int, message: String) : Exception(message)

/**
 * The already-bound handshake. Pure state machine: the caller sends [step1Request], feeds the device's
 * stripped reply to [handleStep1Reply] (which returns the step-2 request), then checks the step-2 status
 * with [handleStep2Reply], which yields the [ChannelCipher] for the session.
 */
class AuthHandshake(private val authKey: ByteArray, random: SecureRandom = SecureRandom()) {
    init {
        require(authKey.size == 16) { "Auth key must be 16 bytes" }
    }

    private val keys = B163.generateKeyPair(random)
    private var cipher: ChannelCipher? = null

    /** `04 02 00 02` + phone public key (52 bytes). */
    val step1Request: ByteArray = bytesOf(Auth.CMD_KEY_EXCHANGE, 0x02, 0x00, 0x02) + keys.publicKey

    /** [reply] is `status, random[16], devicePub[48]`. Returns the step-2 payload. */
    fun handleStep1Reply(reply: ByteArray): ByteArray {
        val status = reply.u8(0)
        if (status != Auth.STATUS_SUCCESS) throw AuthException(status, "Key exchange failed: ${Auth.describe(status)}")
        if (reply.size < 1 + 16 + B163.PUBLIC_KEY_BYTES) throw AuthException(0, "Key exchange reply too short (${reply.size})")
        val challenge = reply.copyOfRange(1, 17)
        val devicePublic = reply.copyOfRange(17, 17 + B163.PUBLIC_KEY_BYTES)
        val shared = B163.sharedSecret(keys.privateKey, devicePublic)
        val c = ChannelCipher(shared, authKey)
        cipher = c
        return ByteWriter()
            .u8(Auth.CMD_PROVE)
            .bytes(Aes.encrypt(authKey, challenge))
            .bytes(Aes.encrypt(c.sessionKey, challenge))
            .toByteArray()
    }

    /** [reply] is the stripped step-2 reply; on success returns the session cipher. */
    fun handleStep2Reply(reply: ByteArray): ChannelCipher {
        val status = if (reply.isEmpty()) 0 else reply.u8(0)
        if (status != Auth.STATUS_SUCCESS) throw AuthException(status, "Authentication failed: ${Auth.describe(status)}")
        return cipher ?: throw AuthException(0, "Step 2 before step 1")
    }
}
