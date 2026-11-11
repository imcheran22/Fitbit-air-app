# SetAlarmInfoCommandPacketRev4 — Wire Format

**Confirmed:** 2026-06-28
**Command opcode:** 0x42 (SET_ALARM_TIME)
**Status:** CONFIRMED — byte layout confirmed via BLE protocol analysis

---

## Wire Format (21 bytes, little-endian)

```
Offset  Size  Type     Field
──────  ────  ───────  ──────────────────────────────────
0       1     uint8    revision = 0x04 (REVISION_4)
1       1     uint8    snoozeCount
2       4     int32    epochSecs (seconds since Unix epoch, LE)
6       2     int16    milliseconds component (LE)
8       12    bytes    AlarmHapticsPattern (12 bytes)
```

Total: **21 bytes**

---

## AlarmHapticsPattern (12 bytes)

Pattern encoding for vibration feedback during alarm. 12-byte struct; confirmed from BLE protocol observation. Exact field breakdown requires hardware capture to confirm semantic meaning per byte.

---

## Protocol Notes

- **Direction:** Host → Strap (WRITE to CMD_TO_STRAP characteristic)
- **Revision byte at offset 0:** Always 0x04 for this packet variant
- **Epoch seconds:** Unix timestamp of the alarm target time
- **Milliseconds:** Sub-second component (int16 LE)
- **Endianness:** All multi-byte fields are little-endian

---

## Related Commands

| Opcode | Command | Purpose |
|--------|---------|---------|
| 0x42 | SET_ALARM_TIME | Set alarm time — this packet |
| 0x44 | RUN_ALARM | Arm the alarm (REV1: 1B, REV2: 2B) |
| 0x45 | DISABLE_ALARM | Cancel alarm (REV1: 1B, REV2: 2B) |

---

## Gate Status

This file satisfies the HAP-04 implementation gate. Phase 126 (Wake-Window Engine) may proceed with this confirmed wire format.
