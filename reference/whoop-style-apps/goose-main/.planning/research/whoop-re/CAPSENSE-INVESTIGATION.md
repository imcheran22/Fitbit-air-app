# Cap Sense GATT UUID Investigation

**Date:** 2026-06-11
**Tool:** Ghidra static analysis (WHOOP 5.37.0, ARM64, 8621 functions)
**Result:** BLOCKED — UUID not definitively identified

---

## What Was Found

### Cap Sense Notification Names (confirmed)
- `WHPWhoopStrapCapSenseFailedNotification` @ `0x105cfb2be`
- `WHPWhoopStrapCapSenseSuccessNotification` @ `0x105cfb2e6`
- `isOnWrist` @ `0x105d17ec3`
- `WHPWhoopStrapOnWrist` @ `0x105d18190`
- `capSenseDidFail` @ `0x105fd220a`
- `capSenseDidSucceed` @ `0x105fee953`

### GATT UUIDs Found Near Each Other in Binary

**FD4B series (already in Goose):**
- `fd4b0001-cce1-4033-93ce-002d5875f58a`
- `fd4b0002-cce1-4033-93ce-002d5875f58a`
- `fd4b0003-cce1-4033-93ce-002d5875f58a`
- `fd4b0004-cce1-4033-93ce-002d5875f58a`
- `fd4b0005-cce1-4033-93ce-002d5875f58a`
- `fd4b0007-cce1-4033-93ce-002d5875f58a`

**11500X series (WHOOP 5.x, NOT in Goose):**
- `11500001-6215-11EE-8C99-0242AC120002`
- `11500002-6215-11EE-8C99-0242AC120002`
- `11500003-6215-11EE-8C99-0242AC120002`
- `11500004-6215-11EE-8C99-0242AC120002`
- `11500005-6215-11EE-8C99-0242AC120002`
- `11500007-6215-11EE-8C99-0242AC120002`

### Why UUID Cannot Be Determined

1. **No string-to-UUID mapping visible:** The CapSense notification names and the GATT UUIDs are in separate data regions with no cross-references visible through string analysis.

2. **No CapSense-named functions found:** `search_functions("CapSense")` and `search_functions("capSense")` return zero results. Functions implementing cap sense are demangled Swift/ObjC methods without `capSense` in their stripped names.

3. **NSNotification pattern:** WHOOP posts `WHPWhoopStrapCapSenseSuccessNotification` after processing the GATT notification — the UUID→notification mapping happens inside compiled Swift code that requires deeper decompilation.

4. **11500X series uncharacterized:** The 11500X UUIDs are present in the binary but their purpose (which sensor data type they carry) is not visible from static string analysis alone.

## Candidate UUIDs for Further Investigation

The **11500X series** is the primary candidate — these are WHOOP 5.x characteristics not yet subscribed to in Goose. Specifically:
- `11500005-6215-11EE-8C99-0242AC120002` — possibly cap sense (position 5 in the series, adjacent to vitals characteristics)
- `11500007-6215-11EE-8C99-0242AC120002` — possibly sensor status / on-wrist flag

## Next Steps to Unblock

1. **Dynamic analysis:** Connect a real WHOOP 5.x device, subscribe to each 11500X UUID, and observe which one emits data correlated with on-wrist state changes (put on/take off).

2. **Deeper decompilation:** Decompile the `CapSenseViewModel` Swift class (`_TtC5Whoop17CapSenseViewModel` @ `0x105d575c0`) — this class likely holds the characteristic UUID as a property.

3. **Protocol capture:** Use a BLE sniffer (Wireshark + BLE adapter) during a cap sense calibration flow to identify which UUID carries the cap sense characteristic notification.

## Conclusion

Phase 66 remains **BLOCKED** until the cap sense GATT UUID is identified via dynamic analysis or deeper decompilation. The 11500X UUID series is the primary candidate to investigate next.
