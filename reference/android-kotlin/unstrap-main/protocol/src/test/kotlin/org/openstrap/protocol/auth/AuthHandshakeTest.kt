package org.openstrap.protocol.auth

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.openstrap.protocol.crypto.Aes
import org.openstrap.protocol.crypto.B163
import org.openstrap.protocol.crypto.ChannelCipher
import org.openstrap.protocol.hexToBytes

class AuthHandshakeTest {
    private val authKey = "00112233445566778899aabbccddeeff".hexToBytes()

    /** A minimal simulated strap implementing the device side of §3.4. */
    private class FakeStrap(private val authKey: ByteArray) {
        val keys = B163.generateKeyPair()
        val challenge = ByteArray(16) { (it * 7).toByte() }
        lateinit var cipher: ChannelCipher

        fun onStep1(req: ByteArray): ByteArray {
            assertEquals(52, req.size)
            assertArrayEquals(byteArrayOf(4, 2, 0, 2), req.copyOfRange(0, 4))
            val phonePub = req.copyOfRange(4, 52)
            cipher = ChannelCipher(B163.sharedSecret(keys.privateKey, phonePub), authKey)
            return byteArrayOf(1) + challenge + keys.publicKey
        }

        fun onStep2(req: ByteArray): ByteArray {
            val ok = req[0].toInt() == 5 &&
                req.copyOfRange(1, 17).contentEquals(Aes.encrypt(authKey, challenge)) &&
                req.copyOfRange(17, 33).contentEquals(Aes.encrypt(cipher.sessionKey, challenge))
            return byteArrayOf(if (ok) 1 else 0x26)
        }
    }

    @Test
    fun handshakeAgreesOnSessionKey() {
        val strap = FakeStrap(authKey)
        val hs = AuthHandshake(authKey)
        val step2 = hs.handleStep1Reply(strap.onStep1(hs.step1Request))
        assertEquals(33, step2.size)
        val cipher = hs.handleStep2Reply(strap.onStep2(step2))
        assertArrayEquals(strap.cipher.sessionKey, cipher.sessionKey)
    }

    @Test
    fun wrongKeyIsReported() {
        val strap = FakeStrap(authKey)
        val hs = AuthHandshake("ffeeddccbbaa99887766554433221100".hexToBytes())
        val step2 = hs.handleStep1Reply(strap.onStep1(hs.step1Request))
        val e = runCatching { hs.handleStep2Reply(strap.onStep2(step2)) }.exceptionOrNull() as AuthException
        assertEquals(0x26, e.status)
        assertTrue(e.message!!.contains("wrong auth key"))
    }

    @Test
    fun stripsBothReplyPrefixes() {
        assertArrayEquals(byteArrayOf(1, 9), Auth.stripReply(4, byteArrayOf(0x10, 4, 1, 9)))
        // The `<cmd+1>` form isn't an auth reply (02 §7); it must not satisfy a wait for one.
        org.junit.Assert.assertNull(Auth.stripReply(4, byteArrayOf(5, 1, 9)))
    }
}
