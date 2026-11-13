#!/usr/bin/env bash
# Chooses how the release APK is signed and writes the key material to a git-ignored temp directory.
#
#   prepare-signing.sh <work-dir>
#
# Order of preference (first that is fully present wins):
#   secrets4    APEX_KEYSTORE_B64 + APEX_KEYSTORE_PASSWORD + APEX_KEY_ALIAS + APEX_KEY_PASSWORD
#   passphrase  APEX_SIGNING_PASSPHRASE alone: the key is DERIVED from it (DeriveKeystore.java), so the same
#               passphrase always gives the same signature
#   throwaway   nothing configured: a fresh random key; the APK cannot update an earlier install
#
# Results go to "$GITHUB_ENV" (SIGNING_MODE, KS_FILE, KS_ALIAS, KS_PASS, KEY_PASS) with every password masked
# first. Nothing secret is ever printed.
set -euo pipefail

WORK="${1:?usage: prepare-signing.sh <work-dir>}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_OUT="${GITHUB_ENV:-/dev/stdout}"
mkdir -p "$WORK"
chmod 700 "$WORK"

mask() { [ -z "${1:-}" ] || echo "::add-mask::$1"; }
export_var() { printf '%s=%s\n' "$1" "$2" >> "$ENV_OUT"; }

# Secrets may carry stray whitespace from a phone paste.
trim() { printf '%s' "$1" | tr -d '\r' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//'; }

B64="$(printf '%s' "${APEX_KEYSTORE_B64:-}" | tr -d '[:space:]')"
KSPASS="${APEX_KEYSTORE_PASSWORD:-}"
ALIAS="$(trim "${APEX_KEY_ALIAS:-}")"
KEYPASS="${APEX_KEY_PASSWORD:-}"
PASSPHRASE="${APEX_SIGNING_PASSPHRASE:-}"

# The repository secrets are masked by GitHub already; masking the trimmed forms covers a stripped paste.
mask "$KSPASS"; mask "$KEYPASS"; mask "$PASSPHRASE"

if [ -z "$B64$KSPASS$ALIAS$KEYPASS" ] || { [ -n "$B64" ] && [ -n "$KSPASS" ] && [ -n "$ALIAS" ] && [ -n "$KEYPASS" ]; }; then :; else
  echo "::warning::Only some of the four keystore secrets (APEX_KEYSTORE_B64, APEX_KEYSTORE_PASSWORD, APEX_KEY_ALIAS, APEX_KEY_PASSWORD) are set, so they were ignored."
fi

if [ -n "$B64" ] && [ -n "$KSPASS" ] && [ -n "$ALIAS" ] && [ -n "$KEYPASS" ]; then
  printf '%s' "$B64" | base64 -d > "$WORK/release.jks"
  [ -s "$WORK/release.jks" ] || { echo "::error::APEX_KEYSTORE_B64 is not valid base64"; exit 1; }
  export_var SIGNING_MODE secrets4
  export_var KS_FILE "$WORK/release.jks"
  export_var KS_ALIAS "$ALIAS"
  export_var KS_PASS "$KSPASS"
  export_var KEY_PASS "$KEYPASS"
  echo "Signing mode: keystore from the four repository secrets."

elif [ -n "$PASSPHRASE" ]; then
  # Refuse to continue if the derivation no longer gives the pinned known answer (a JDK or code change would
  # otherwise silently produce a new signature and break updates).
  bash "$HERE/check-derive-determinism.sh" --kat
  STOREPW="$(openssl rand -hex 24)"
  mask "$STOREPW"
  APEX_SIGNING_PASSPHRASE="$PASSPHRASE" APEX_KEYSTORE_PASSWORD="$STOREPW" \
    java "$HERE/DeriveKeystore.java" "$WORK/derived.p12" apex > "$WORK/derive.out" 2> "$WORK/derive.err" \
    || { cat "$WORK/derive.err" | grep -v '^Picked up' || true; echo "::error::Could not derive the signing key from APEX_SIGNING_PASSPHRASE (is it at least 20 characters?)"; exit 1; }
  export_var SIGNING_MODE passphrase
  export_var KS_FILE "$WORK/derived.p12"
  export_var KS_ALIAS apex
  export_var KS_PASS "$STOREPW"
  export_var KEY_PASS "$STOREPW"
  echo "Signing mode: key derived from APEX_SIGNING_PASSPHRASE (certificate SHA-256 $(sed -n 's/^CERT_SHA256=//p' "$WORK/derive.out"))."

else
  STOREPW="$(openssl rand -hex 24)"
  mask "$STOREPW"
  keytool -genkeypair -keystore "$WORK/throwaway.p12" -storetype PKCS12 -storepass "$STOREPW" -keypass "$STOREPW" \
    -alias throwaway -keyalg RSA -keysize 2048 -validity 30 -dname "CN=Apex throwaway build" -noprompt 2>/dev/null
  export_var SIGNING_MODE throwaway
  export_var KS_FILE "$WORK/throwaway.p12"
  export_var KS_ALIAS throwaway
  export_var KS_PASS "$STOREPW"
  export_var KEY_PASS "$STOREPW"
  echo "Signing mode: THROWAWAY key (no signing secrets configured)."
fi
