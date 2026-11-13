#!/usr/bin/env bash
# Release smoke test on an emulator: install, launch, enter Demo mode, visit the tabs, rotate,
# relaunch after a kill, and fail on any crash or ANR of the app. Screenshots go to smoke/.
set -euo pipefail
APK="$1"
PKG=com.apex.athlete
OUT=smoke
mkdir -p "$OUT"

shot() { adb exec-out screencap -p > "$OUT/$1.png" || true; }
alive() { adb shell pidof "$PKG" >/dev/null 2>&1; }
# Taps the first node whose text or content-desc matches $1 (case-insensitive). Returns 1 if absent.
tap_text() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || return 1
  adb pull /sdcard/ui.xml "$OUT/ui.xml" >/dev/null 2>&1 || return 1
  local xy
  xy=$(python3 - "$1" "$OUT/ui.xml" <<'PY'
import re, sys, xml.etree.ElementTree as ET
want = sys.argv[1].lower()
for n in ET.parse(sys.argv[2]).iter("node"):
    label = (n.get("text") or "") + " " + (n.get("content-desc") or "")
    if want in label.lower():
        x1, y1, x2, y2 = map(int, re.findall(r"\d+", n.get("bounds")))
        print((x1 + x2) // 2, (y1 + y2) // 2)
        break
PY
)
  [ -n "$xy" ] || return 1
  adb shell input tap $xy
}
check() {
  sleep "${2:-3}"
  if ! alive; then echo "SMOKE FAIL: app not running after $1"; adb logcat -d -b crash > "$OUT/crash.txt" || true; cat "$OUT/crash.txt"; exit 1; fi
  shot "$1"
}

adb logcat -c || true
adb install -r "$APK"
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0

adb shell am start -W -n "$PKG/.MainActivity"
check launch 6

tap_text "Explore with demo data" && check demo 15 || echo "demo button not found (layout may differ); continuing"
for tab in Overview Health Journal More; do
  tap_text "$tab" && check "tab-$tab" 4 || echo "tab $tab not found"
done

# More rows added for the local-extras screens: open each by its label, then go back. Labels sit below the
# fold, so scroll the list first. A missing row only warns; a crash fails in check().
tap_text "More" || true
sleep 2
for row in "Goals" "Weekly plan" "Reports" "Quick log" "Behaviours" "Food" "Blood pressure" "Record a workout" "Breathe"; do
  adb shell input swipe 540 1600 540 700 200 || true
  tap_text "$row" && { check "more-$row" 3; adb shell input keyevent KEYCODE_BACK; sleep 1; } || echo "more row $row not found"
done

adb shell settings put system accelerometer_rotation 0
adb shell settings put system user_rotation 1
check rotated 4
adb shell settings put system user_rotation 0

adb shell settings put system font_scale 2.0
check font200 5
adb shell settings put system font_scale 1.0

adb shell am force-stop "$PKG"
adb shell am start -W -n "$PKG/.MainActivity"
check relaunch 6

adb shell "cmd uimode night yes" || true
check dark 4

if adb logcat -d | grep -E "FATAL EXCEPTION|ANR in $PKG" | grep -q .; then
  adb logcat -d | grep -A 30 -E "FATAL EXCEPTION|ANR in $PKG" | head -80
  echo "SMOKE FAIL: crash or ANR in logcat"; exit 1
fi
echo "SMOKE PASS"
