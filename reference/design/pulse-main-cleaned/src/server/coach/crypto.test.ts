import { expect, it } from "vitest";
import { decryptKey, encryptKey } from "./crypto";

const SECRET = "s".repeat(32);

it("round-trips a key, with a fresh IV each time", () => {
  const a = encryptKey("sk-test-123", SECRET);
  expect(decryptKey(a, SECRET)).toBe("sk-test-123");
  expect(encryptKey("sk-test-123", SECRET).equals(a)).toBe(false);
  expect(a.includes(Buffer.from("sk-test-123"))).toBe(false);
});

it("a tampered blob or another secret reads as null, never as a wrong key", () => {
  const a = encryptKey("sk-test-123", SECRET);
  const bad = Buffer.from(a);
  bad[bad.length - 1] ^= 1;
  expect(decryptKey(bad, SECRET)).toBeNull();
  expect(decryptKey(a, "t".repeat(32))).toBeNull();
  expect(decryptKey(Buffer.alloc(5), SECRET)).toBeNull();
});
