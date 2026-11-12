// Coach API keys at rest: AES-256-GCM under a key derived (HKDF-SHA256) from BETTER_AUTH_SECRET. Stored as
// iv (12 bytes) | tag (16 bytes) | ciphertext. Rotating the secret makes stored keys unreadable: the coach then asks
// the user to add their key again (docs/setup.md).
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const dataKey = (secret: string) => Buffer.from(hkdfSync("sha256", secret, "", "pulse:coach-key", 32));

export function encryptKey(plain: string, secret: string): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", dataKey(secret), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]);
}

/** The key, or null when the blob was tampered with or sealed under another secret. */
export function decryptKey(blob: Buffer, secret: string): string | null {
  try {
    const d = createDecipheriv("aes-256-gcm", dataKey(secret), blob.subarray(0, 12));
    d.setAuthTag(blob.subarray(12, 28));
    return Buffer.concat([d.update(blob.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
