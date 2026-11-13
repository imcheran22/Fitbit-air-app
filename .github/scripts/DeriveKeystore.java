import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.RSAPrivateCrtKeySpec;
import java.text.Normalizer;
import java.util.Arrays;
import javax.crypto.Mac;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Derives Apex's release signing key from ONE passphrase, so the owner only has to keep one password.
 *
 * Run with the JDK source launcher (no build step):
 *   APEX_SIGNING_PASSPHRASE=... APEX_KEYSTORE_PASSWORD=... java DeriveKeystore.java OUT.p12 ALIAS
 *
 * Everything that decides the signature is deterministic, so the same passphrase always gives the same
 * certificate (and therefore the same APK signature) on any machine with a Java 17+ runtime:
 *
 *   1. PBKDF2WithHmacSHA256(passphrase, salt "apex-signing-v1", 1,000,000 iterations) -> 64-byte seed.
 *   2. An HMAC-SHA256 counter stream keyed with the seed supplies every "random" byte.
 *   3. RSA-2048 primes are searched from that stream by this program itself (not by the JDK's
 *      KeyPairGenerator, whose internals may change between releases). BigInteger.nextProbablePrime is a
 *      deterministic search; the only residual non-determinism is a composite passing the Miller-Rabin
 *      tests, which has probability below 2^-100 per call.
 *   4. The X.509 certificate is encoded by hand (DER) with a FIXED serial, FIXED validity
 *      (2026-01-01 to 2126-01-01) and FIXED subject, and signed with SHA256withRSA (PKCS#1 v1.5, which has
 *      no random component).
 *
 * Only the PKCS12 wrapper is random (salt, throwaway store password); it does not affect the key or the
 * certificate. The passphrase is read from the environment, never from the command line, and never printed.
 * Prints the public certificate fingerprints (not secret) on stdout.
 */
public final class DeriveKeystore {
    private static final String SALT = "apex-signing-v1";
    private static final int PBKDF2_ITERATIONS = 1_000_000;
    private static final int MIN_PASSPHRASE_CHARS = 20;
    private static final BigInteger E = BigInteger.valueOf(65537);
    private static final BigInteger SERIAL = new BigInteger("5ECA0001", 16);
    private static final String SUBJECT_CN = "Apex personal build";

    private DeriveKeystore() {}

    public static void main(String[] args) throws Exception {
        if (args.length != 2) {
            fail("usage: java DeriveKeystore.java OUT.p12 ALIAS  (env APEX_SIGNING_PASSPHRASE, APEX_KEYSTORE_PASSWORD)");
        }
        String outPath = args[0];
        String alias = args[1];
        String passphraseRaw = System.getenv("APEX_SIGNING_PASSPHRASE");
        String storePassword = System.getenv("APEX_KEYSTORE_PASSWORD");
        if (passphraseRaw == null || storePassword == null || storePassword.length() < 6) {
            fail("APEX_SIGNING_PASSPHRASE and APEX_KEYSTORE_PASSWORD (6+ chars) must be set in the environment");
        }

        // NFC and trimmed: a phone keyboard or a paste must not change the key by adding a space or newline.
        String passphrase = Normalizer.normalize(passphraseRaw, Normalizer.Form.NFC).strip();
        if (passphrase.codePointCount(0, passphrase.length()) < MIN_PASSPHRASE_CHARS) {
            fail("The signing passphrase is too short (" + MIN_PASSPHRASE_CHARS + " characters minimum, 24 or more random "
                + "characters recommended). The repository is public, so a short passphrase can be guessed.");
        }

        byte[] seed = pbkdf2(passphrase);
        Stream stream = new Stream(seed);
        Arrays.fill(seed, (byte) 0);

        BigInteger p = prime(stream, 1024);
        BigInteger q;
        do {
            q = prime(stream, 1024);
        } while (q.equals(p) || p.subtract(q).abs().bitLength() < 900);
        BigInteger n = p.multiply(q);
        if (n.bitLength() != 2048) {
            throw new IllegalStateException("modulus is not 2048 bits");
        }
        BigInteger phi = p.subtract(BigInteger.ONE).multiply(q.subtract(BigInteger.ONE));
        BigInteger d = E.modInverse(phi);
        BigInteger dp = d.mod(p.subtract(BigInteger.ONE));
        BigInteger dq = d.mod(q.subtract(BigInteger.ONE));
        BigInteger qinv = q.modInverse(p);
        PrivateKey priv = KeyFactory.getInstance("RSA").generatePrivate(new RSAPrivateCrtKeySpec(n, E, d, p, q, dp, dq, qinv));

        byte[] certDer = certificate(n, priv);
        X509Certificate cert = (X509Certificate) CertificateFactory.getInstance("X.509")
            .generateCertificate(new ByteArrayInputStream(certDer));
        cert.verify(cert.getPublicKey());
        if (!((RSAPublicKey) cert.getPublicKey()).getModulus().equals(n)) {
            throw new IllegalStateException("certificate does not carry the derived key");
        }
        if (!Arrays.equals(cert.getEncoded(), certDer)) {
            throw new IllegalStateException("certificate re-encoding differs");
        }

        char[] pw = storePassword.toCharArray();
        KeyStore ks = KeyStore.getInstance("PKCS12");
        ks.load(null, null);
        ks.setKeyEntry(alias, priv, pw, new Certificate[] {cert});
        try (OutputStream out = new FileOutputStream(outPath)) {
            ks.store(out, pw);
        }
        Arrays.fill(pw, '\0');

        System.out.println("CERT_SHA1=" + hex(MessageDigest.getInstance("SHA-1").digest(certDer)));
        System.out.println("CERT_SHA256=" + hex(MessageDigest.getInstance("SHA-256").digest(certDer)));
    }

    // ---- key derivation --------------------------------------------------------------------------------

    private static byte[] pbkdf2(String passphrase) throws Exception {
        char[] chars = passphrase.toCharArray();
        PBEKeySpec spec = new PBEKeySpec(chars, SALT.getBytes(StandardCharsets.UTF_8), PBKDF2_ITERATIONS, 512);
        try {
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
        } finally {
            spec.clearPassword();
            Arrays.fill(chars, '\0');
        }
    }

    /** Deterministic byte stream: HMAC-SHA256(seed, "apex-rsa-v1" || counter32), block after block. */
    private static final class Stream {
        private final Mac mac;
        private final byte[] label = "apex-rsa-v1".getBytes(StandardCharsets.UTF_8);
        private int counter;
        private byte[] block = new byte[0];
        private int pos;

        Stream(byte[] seed) throws Exception {
            mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(seed, "HmacSHA256"));
        }

        byte[] next(int count) {
            byte[] out = new byte[count];
            for (int i = 0; i < count; i++) {
                if (pos == block.length) {
                    mac.update(label);
                    mac.update(ByteBuffer.allocate(4).putInt(counter++).array());
                    block = mac.doFinal();
                    pos = 0;
                }
                out[i] = block[pos++];
            }
            return out;
        }
    }

    private static BigInteger prime(Stream stream, int bits) {
        while (true) {
            BigInteger candidate = new BigInteger(1, stream.next(bits / 8)).setBit(bits - 1).setBit(bits - 2).setBit(0);
            BigInteger p = candidate.nextProbablePrime();
            if (p.bitLength() != bits) {
                continue;
            }
            if (!p.subtract(BigInteger.ONE).gcd(E).equals(BigInteger.ONE)) {
                continue;
            }
            return p;
        }
    }

    // ---- certificate (hand-encoded DER, no JDK-internal classes) -----------------------------------------

    private static byte[] certificate(BigInteger modulus, PrivateKey priv) throws Exception {
        byte[] sha256WithRsa = seq(oid("1.2.840.113549.1.1.11"), new byte[] {5, 0});
        byte[] name = seq(tlv(0x31, seq(oid("2.5.4.3"), tlv(0x0C, SUBJECT_CN.getBytes(StandardCharsets.UTF_8)))));
        byte[] validity = seq(
            tlv(0x17, "260101000000Z".getBytes(StandardCharsets.US_ASCII)),      // UTCTime 2026-01-01
            tlv(0x18, "21260101000000Z".getBytes(StandardCharsets.US_ASCII)));   // GeneralizedTime 2126-01-01
        byte[] rsaPublicKey = seq(integer(modulus), integer(E));
        byte[] spki = seq(seq(oid("1.2.840.113549.1.1.1"), new byte[] {5, 0}), tlv(0x03, concat(new byte[] {0}, rsaPublicKey)));
        byte[] tbs = seq(
            tlv(0xA0, integer(BigInteger.valueOf(2))),   // version v3
            integer(SERIAL),
            sha256WithRsa,
            name,
            validity,
            name,
            spki);
        Signature sig = Signature.getInstance("SHA256withRSA");
        sig.initSign(priv);
        sig.update(tbs);
        byte[] signature = sig.sign();
        return seq(tbs, sha256WithRsa, tlv(0x03, concat(new byte[] {0}, signature)));
    }

    private static byte[] seq(byte[]... parts) {
        return tlv(0x30, concat(parts));
    }

    private static byte[] integer(BigInteger v) {
        return tlv(0x02, v.toByteArray());
    }

    private static byte[] oid(String dotted) {
        String[] arcs = dotted.split("\\.");
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(Integer.parseInt(arcs[0]) * 40 + Integer.parseInt(arcs[1]));
        for (int i = 2; i < arcs.length; i++) {
            long v = Long.parseLong(arcs[i]);
            byte[] tmp = new byte[10];
            int k = tmp.length;
            tmp[--k] = (byte) (v & 0x7F);
            v >>= 7;
            while (v > 0) {
                tmp[--k] = (byte) ((v & 0x7F) | 0x80);
                v >>= 7;
            }
            out.write(tmp, k, tmp.length - k);
        }
        return tlv(0x06, out.toByteArray());
    }

    private static byte[] tlv(int tag, byte[] content) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(tag);
        int len = content.length;
        if (len < 128) {
            out.write(len);
        } else if (len < 256) {
            out.write(0x81);
            out.write(len);
        } else if (len < 65536) {
            out.write(0x82);
            out.write(len >> 8);
            out.write(len & 0xFF);
        } else {
            throw new IllegalArgumentException("DER element too long");
        }
        out.write(content, 0, content.length);
        return out.toByteArray();
    }

    private static byte[] concat(byte[]... parts) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (byte[] part : parts) {
            out.write(part, 0, part.length);
        }
        return out.toByteArray();
    }

    private static String hex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }

    private static void fail(String message) {
        System.err.println("error: " + message);
        System.exit(2);
    }
}
