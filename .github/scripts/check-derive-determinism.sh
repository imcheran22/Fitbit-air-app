#!/usr/bin/env bash
# Proves that DeriveKeystore.java derives the SAME signing certificate from the same passphrase,
# every time, in separate JVM processes, and a different one from a different passphrase.
#
#   bash .github/scripts/check-derive-determinism.sh            full proof (several derivations)
#   bash .github/scripts/check-derive-determinism.sh --kat      only the pinned known-answer check (used by the release workflow)
#
# The pinned value below was produced by this program on JDK 21 (see docs/DECISIONS.md D9). If a future JDK or a
# code edit changes it, every later build would get a different signature, so the release workflow refuses to
# sign with the passphrase path until this check passes again.
# The test passphrase is public and worthless: never use it for a real key.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_PASSPHRASE='apex-test-vector-NOT-A-REAL-KEY-0001'
EXPECTED_KAT_SHA256='41d96a44a81fb6b0036553bad623668ad035d9b675aab5267dd94fa8f76706e4'
MODE="${1:-full}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

derive() { # derive <passphrase> <out.p12> <store-password>  -> prints "SHA256 SHA1"
  local out
  out="$(APEX_SIGNING_PASSPHRASE="$1" APEX_KEYSTORE_PASSWORD="$3" java "$HERE/DeriveKeystore.java" "$2" apex 2>/dev/null)"
  local sha256 sha1
  sha256="$(printf '%s\n' "$out" | sed -n 's/^CERT_SHA256=//p')"
  sha1="$(printf '%s\n' "$out" | sed -n 's/^CERT_SHA1=//p')"
  [ -n "$sha256" ] && [ -n "$sha1" ] || { echo "FAIL: derivation printed no fingerprint"; return 1; }
  printf '%s %s\n' "$sha256" "$sha1"
}

keytool_sha256() { # fingerprint as keytool sees it (independent of our own printing), lower-case hex
  keytool -list -v -keystore "$1" -storepass "$2" -alias apex 2>/dev/null \
    | sed -n 's/^[[:space:]]*SHA256:[[:space:]]*//p' | head -1 | tr -d ':' | tr 'A-F' 'a-f'
}

fail() { echo "FAIL: $*"; exit 1; }

echo "JDK: $(java -version 2>&1 | grep -m1 'version')"

# 1. Known-answer test.
read -r kat_sha256 _ < <(derive "$TEST_PASSPHRASE" "$WORK/kat.p12" "kat-store-pw-1")
echo "known-answer certificate SHA-256: $kat_sha256"
if [ "$kat_sha256" != "$EXPECTED_KAT_SHA256" ]; then
  fail "known-answer mismatch: expected $EXPECTED_KAT_SHA256"
fi
echo "OK: matches the pinned value"
[ "$MODE" = "--kat" ] && { echo "KAT-ONLY OK"; exit 0; }

# 2. Two more derivations in separate JVM processes, different throwaway store passwords.
read -r a_sha256 a_sha1 < <(derive "$TEST_PASSPHRASE" "$WORK/a.p12" "store-password-AAAA")
read -r b_sha256 b_sha1 < <(derive "$TEST_PASSPHRASE" "$WORK/b.p12" "store-password-BBBB")
echo "run A: SHA-256 $a_sha256  SHA-1 $a_sha1"
echo "run B: SHA-256 $b_sha256  SHA-1 $b_sha1"
[ "$a_sha256" = "$b_sha256" ] && [ "$a_sha256" = "$kat_sha256" ] || fail "SHA-256 differs between runs"
[ "$a_sha1" = "$b_sha1" ] || fail "SHA-1 differs between runs"

# 3. Independent confirmation with keytool, and byte-for-byte certificate comparison.
ka="$(keytool_sha256 "$WORK/a.p12" "store-password-AAAA")"
kb="$(keytool_sha256 "$WORK/b.p12" "store-password-BBBB")"
echo "keytool A: $ka"
echo "keytool B: $kb"
[ "$ka" = "$a_sha256" ] && [ "$kb" = "$b_sha256" ] || fail "keytool disagrees with the derivation output"
keytool -exportcert -keystore "$WORK/a.p12" -storepass "store-password-AAAA" -alias apex -file "$WORK/a.der" 2>/dev/null
keytool -exportcert -keystore "$WORK/b.p12" -storepass "store-password-BBBB" -alias apex -file "$WORK/b.der" 2>/dev/null
cmp "$WORK/a.der" "$WORK/b.der" || fail "certificate bytes differ"
echo "OK: certificate DER is byte-identical across runs ($(wc -c < "$WORK/a.der") bytes)"

# The PKCS12 files themselves differ (random salt, different store password): only the key and certificate are pinned.
if cmp -s "$WORK/a.p12" "$WORK/b.p12"; then fail "PKCS12 files are identical; the store password was not applied"; fi
echo "OK: the PKCS12 wrapper differs (random salt, store password), the certificate does not"

# 4. The certificate is a proper self-signed X.509 with the fixed fields.
if command -v openssl >/dev/null 2>&1; then
  openssl x509 -inform DER -in "$WORK/a.der" -noout -subject -issuer -serial -dates -text 2>/dev/null \
    | grep -E "Subject:|Issuer:|serial=|notBefore|notAfter|Signature Algorithm: sha256WithRSAEncryption|Public-Key: \(2048 bit\)" | sort -u | sed 's/^ */  /'
  openssl x509 -inform DER -in "$WORK/a.der" -noout -subject | grep -q "Apex personal build" || fail "unexpected subject"
  # Self-signature verifies with its own key.
  openssl x509 -inform DER -in "$WORK/a.der" -out "$WORK/a.pem" -outform PEM
  openssl verify -CAfile "$WORK/a.pem" "$WORK/a.pem" >/dev/null 2>&1 || fail "self-signature does not verify"
  echo "OK: openssl verifies the self-signature"
fi

# 5. Whitespace around the passphrase (a paste with a trailing newline) must not change the key.
read -r c_sha256 _ < <(derive "  $TEST_PASSPHRASE"$'\n' "$WORK/c.p12" "store-password-CCCC")
[ "$c_sha256" = "$a_sha256" ] || fail "surrounding whitespace changed the key"
echo "OK: surrounding whitespace is ignored"

# 6. A different passphrase gives a different certificate.
read -r d_sha256 _ < <(derive "${TEST_PASSPHRASE}x" "$WORK/d.p12" "store-password-DDDD")
echo "different passphrase: $d_sha256"
[ "$d_sha256" != "$a_sha256" ] || fail "different passphrases gave the same certificate"
echo "OK: a different passphrase gives a different certificate"

# 7. A short passphrase is refused.
if APEX_SIGNING_PASSPHRASE="short" APEX_KEYSTORE_PASSWORD="store-password-EEEE" java "$HERE/DeriveKeystore.java" "$WORK/e.p12" apex >/dev/null 2>&1; then
  fail "a short passphrase was accepted"
fi
[ ! -e "$WORK/e.p12" ] || fail "a keystore was written for a short passphrase"
echo "OK: a short passphrase is refused"

echo "DETERMINISM PROOF PASSED"
