package org.openstrap.protocol.crypto

import java.math.BigInteger
import java.security.SecureRandom

/**
 * ECDH on NIST B-163 (sect163r2), the curve the strap uses for its auth handshake.
 *
 * Field GF(2^163) with f(x) = x^163 + x^7 + x^6 + x^3 + 1, curve y^2 + xy = x^3 + x^2 + b.
 * Field elements are polynomials stored as BigInteger bit sets. Performance is irrelevant here:
 * one key generation and one shared-secret computation per connection.
 *
 * Wire format (docs/protocol/01 §3.2): scalars and coordinates are 24-byte little-endian.
 * Public key = X || Y (48 bytes, no prefix); shared secret = X coordinate (24 bytes).
 */
object B163 {
    private const val M = 163
    private val F: BigInteger = BigInteger.ONE.shiftLeft(163)
        .or(BigInteger.ONE.shiftLeft(7)).or(BigInteger.ONE.shiftLeft(6)).or(BigInteger.ONE.shiftLeft(3)).or(BigInteger.ONE)
    private val A: BigInteger = BigInteger.ONE
    val B: BigInteger = BigInteger("20a601907b8c953ca1481eb10512f78744a3205fd", 16)
    val GX: BigInteger = BigInteger("3f0eba16286a2d57ea0991168d4994637e8343e36", 16)
    val GY: BigInteger = BigInteger("0d51fbc6c71a0094fa2cdd545b11c5c0c797324f1", 16)
    val N: BigInteger = BigInteger("40000000000000000000292fe77e70c12a4234c33", 16)

    const val SCALAR_BYTES = 24
    const val PUBLIC_KEY_BYTES = 48

    /** An affine point; [INFINITY] is the identity. */
    data class Point(val x: BigInteger, val y: BigInteger) {
        companion object { val INFINITY = Point(BigInteger.valueOf(-1), BigInteger.valueOf(-1)) }
        val isInfinity get() = this === INFINITY || x.signum() < 0
    }

    val G = Point(GX, GY)

    // --- GF(2^163) arithmetic -------------------------------------------------------------

    private fun add(a: BigInteger, b: BigInteger) = a.xor(b)

    private fun reduce(v: BigInteger): BigInteger {
        var r = v
        while (r.bitLength() > M) r = r.xor(F.shiftLeft(r.bitLength() - 1 - M))
        return r
    }

    internal fun mul(a: BigInteger, b: BigInteger): BigInteger {
        var result = BigInteger.ZERO
        var x = a
        for (i in 0 until b.bitLength()) {
            if (b.testBit(i)) result = result.xor(x)
            x = x.shiftLeft(1)
            if (x.testBit(M)) x = x.xor(F)
        }
        return reduce(result)
    }

    private fun sqr(a: BigInteger) = mul(a, a)

    /** Inverse via the extended Euclidean algorithm for binary polynomials. */
    internal fun inv(a: BigInteger): BigInteger {
        require(a.signum() != 0) { "Zero has no inverse" }
        var u = a; var v = F
        var g1 = BigInteger.ONE; var g2 = BigInteger.ZERO
        while (u != BigInteger.ONE) {
            var j = u.bitLength() - v.bitLength()
            if (j < 0) {
                u = v.also { v = u }
                g1 = g2.also { g2 = g1 }
                j = -j
            }
            u = u.xor(v.shiftLeft(j))
            g1 = g1.xor(g2.shiftLeft(j))
        }
        return reduce(g1)
    }

    // --- Curve arithmetic -----------------------------------------------------------------

    fun isOnCurve(p: Point): Boolean {
        if (p.isInfinity) return true
        if (p.x.bitLength() > M || p.y.bitLength() > M) return false
        val lhs = add(sqr(p.y), mul(p.x, p.y))
        val x2 = sqr(p.x)
        val rhs = add(add(mul(x2, p.x), mul(A, x2)), B)
        return lhs == rhs
    }

    fun pointAdd(p: Point, q: Point): Point {
        if (p.isInfinity) return q
        if (q.isInfinity) return p
        if (p.x == q.x) return if (p.y == q.y) pointDouble(p) else Point.INFINITY
        val lambda = mul(add(p.y, q.y), inv(add(p.x, q.x)))
        val x3 = add(add(add(add(sqr(lambda), lambda), p.x), q.x), A)
        val y3 = add(add(mul(lambda, add(p.x, x3)), x3), p.y)
        return Point(x3, y3)
    }

    fun pointDouble(p: Point): Point {
        if (p.isInfinity || p.x.signum() == 0) return Point.INFINITY
        val lambda = add(p.x, mul(p.y, inv(p.x)))
        val x3 = add(add(sqr(lambda), lambda), A)
        val y3 = add(sqr(p.x), mul(add(lambda, BigInteger.ONE), x3))
        return Point(x3, y3)
    }

    fun multiply(k: BigInteger, p: Point): Point {
        var result = Point.INFINITY
        for (i in k.bitLength() - 1 downTo 0) {
            result = pointDouble(result)
            if (k.testBit(i)) result = pointAdd(result, p)
        }
        return result
    }

    // --- Encoding ------------------------------------------------------------------------

    fun toLe(v: BigInteger, size: Int = SCALAR_BYTES): ByteArray {
        val be = v.toByteArray().dropWhile { it == 0.toByte() }.toByteArray()
        require(be.size <= size) { "Value too large for $size bytes" }
        return ByteArray(size) { i -> if (i < be.size) be[be.size - 1 - i] else 0 }
    }

    fun fromLe(bytes: ByteArray): BigInteger = BigInteger(1, bytes.reversedArray())

    fun encodePoint(p: Point): ByteArray = toLe(p.x) + toLe(p.y)

    fun decodePoint(bytes: ByteArray): Point {
        require(bytes.size == PUBLIC_KEY_BYTES) { "Public key must be $PUBLIC_KEY_BYTES bytes" }
        val p = Point(fromLe(bytes.copyOfRange(0, 24)), fromLe(bytes.copyOfRange(24, 48)))
        require(isOnCurve(p)) { "Device public key is not on B-163" }
        return p
    }

    // --- ECDH ----------------------------------------------------------------------------

    class KeyPair(val privateKey: BigInteger) {
        val publicKey: ByteArray = encodePoint(multiply(privateKey, G))
    }

    fun generateKeyPair(random: SecureRandom = SecureRandom()): KeyPair {
        while (true) {
            val k = BigInteger(N.bitLength(), random)
            if (k.signum() > 0 && k < N) return KeyPair(k)
        }
    }

    /** Shared secret = X coordinate of priv·peer, 24 bytes little-endian. */
    fun sharedSecret(privateKey: BigInteger, peerPublic: ByteArray): ByteArray {
        val s = multiply(privateKey, decodePoint(peerPublic))
        check(!s.isInfinity) { "Shared secret is the point at infinity" }
        return toLe(s.x)
    }
}
