# 03 – Firmware Update (OTA)

Target device: **Amazfit Helio Strap** (codename *Stuttgart*). Device sources are `10289410` (CN, `MILI_STUTTGART`) and `10289411` (global, `MILI_STUTTGART_W`). The device belongs to the `MILI` (band) family.

This is a **clean-room** specification. Its only source is a static reading of the decompiled official Zepp Android app. Evidence is cited as `file:line` relative to `work/jadx/sources/`, with `defpackage/` abbreviated to `d/`. The conventions are the same as in `01-transport-auth-realtime.md`:

* All multi-byte integers are **little-endian** unless stated otherwise.
* `HUAMI(xxxx)` stands for the UUID `0000xxxx-0000-3512-2118-0009af100700`.
* **UNVERIFIED** marks a claim the decompiled source could not settle. The reason is always given.

> **Read this first: where OTA traffic actually runs.**
> The bulk firmware transfer does **not** run on a channel endpoint. For a BLE-connected band it runs on a dedicated **legacy GATT DFU service, `HUAMI(1530)`**, with a control characteristic `HUAMI(1531)` and a data characteristic `HUAMI(1532)`. The app calls this "DFU V5" (`NewDfuProfile`). See §3.
> Channel endpoint **`0x000C`** does exist. It is the app's `OtaModule` (`@ChannelModule(id = 12)`, `d/rsw.java:17`). It is a small **side-channel**: it reports capabilities, reports the package the device already holds, accepts "preset firmware info", and sends an "unpacked" notification. It does **not** carry firmware bytes. See §4. The claim "OTA endpoint = 0x000c" is therefore only half right.

---

## 0. Overview of the whole flow

```
 ┌─────────────── phone ───────────────┐                     ┌──── strap ────┐
 1. GET /devices/ALL/hasNewVersion  ───► cloud (JSON: per-part URL/MD5/version/length/flag)
 2. download each part, MD5-check, cache
 3. (if device supports "batch") wrap all parts into one UIHH container (§2.3)
 4. preconditions (battery, not busy, …) (§5)
 5. [endpoint 0x000C] optional: write "preset firmware info" (§4.4)
 6. GATT HUAMI(1530):  D0 query protocol ─────────────────────────────────►
                       D1 query status   ─────────────────────────────────►  must be IDLE / WAITING_NEXT_FIRMWARE
                       D2 prepare(type,len,crc32,chunk,mode,…) ──────────►  ◄── 10 D2 code recvSize recvCrc (resume)
                       D3 start(fresh|continue) ─────────────────────────►
                       data windows on 1532, ◄── 10 D4 progress after each window
                       D5 validate ──────────────────────────────────────►  ◄── 10 D5 code
                       D6 upgrade/apply (skipped in background mode) ────►  ◄── 10 D6 code → device reboots
 7. reconnect (GATT cache refresh), re-auth, re-read device info
```

---

## 1. Firmware acquisition (cloud)

### 1.1 Version check request

| Item | Value | Evidence |
|---|---|---|
| Method | `GET` (the app's internal method code 4 maps to GET) | `d/xp4.java:341`; `d/sa2.java:119-127` |
| URL | `{apiBase}devices/ALL/hasNewVersion`. The default `apiBase` is `https://api-mifit.zepp.com/`. A region-specific host may replace it after login. | `d/xp4.java:245`; `d/wtg0.java:369-381, 545-551`; `d/mok.java:33-61` |
| Rate limit in app | at most one check per device every 30 s | `d/wlh.java:8-29` |
| Skipped for | the virtual device source (`VDEVICE`) | `d/skk.java:235-236` |

**Query parameters.** All of them are sent as URL query parameters.

| Name | Value | Evidence |
|---|---|---|
| `v` | `2.0` | `d/z0l.java:202` |
| `appid` | app id (numeric) | `d/z0l.java:203` |
| `lang`, `country`, `timezone`, `channel` | locale and app channel. `lang` is later overwritten with `<language>_<COUNTRY>`, using the device's language if the device reports one. | `d/z0l.java:204-207`; `d/xp4.java:255-261`; `d/skk.java:81-93` |
| `device` | `android_<SDK_INT>` | `d/z0l.java:208` |
| `device_type` | app platform string | `d/z0l.java:209`; `miui/bluetooth/ble/MiBleDeviceManager.java:35` |
| `cv` | `<versionCode>_<versionName>` of the app | `d/z0l.java:210` |
| `userid` and `userId` | account user id (both spellings are sent) | `d/z0l.java:211-213`; `d/xp4.java:254` |
| `appVersion` | `<versionName>_<versionCode>` | `d/xp4.java:247` |
| `deviceType` | literal `ALL` | `d/xp4.java:248` |
| `deviceSource` | `10289411` or `10289410` | `d/xp4.java:249` |
| `firmwareVersion` | the device firmware version string with any leading `V` removed | `d/xp4.java:250` |
| `gpsVersion` | device GPS version string (absent or empty for the strap) | `d/xp4.java:251` |
| `support8Bytes` | `true` | `d/xp4.java:252` |
| `firmwareFlag`, `fontVersion`, `fontFlag`, `resourceVersion`, `resourceFlag` | from the device's resource-info block (read over the transport; see doc 01/02) | `d/xp4.java:269-274` |
| `diagnosticCode` | only when the device reports a non-default diagnostic state | `d/xp4.java:280-283` |
| `baseResourceVersion`, `baseResourceFlag` | if the device reports a base-resource block | `d/xp4.java:284-290` |
| `extResourceVersion`, `extResourceFlag` | if the device reports an external-resource block. Otherwise `-1`/`-1` on device sources with ext-resource support. | `d/xp4.java:292-305` |
| `vendorId`, `vendorSource` | from device info, else `-1`/`-1` | `d/xp4.java:307-313` |
| `sn` | serial number (omitted if empty) | `d/xp4.java:314-319` |
| `hardwareVersion` | hardware version with any leading `V` removed | `d/xp4.java:320-324` |
| `productionSource` | device "production source" (two other device sources have special-cased values; not the strap) | `d/xp4.java:325-331` |
| `productId` | device product id (157 for this strap, per the task brief) | `d/xp4.java:332`; `com/amazon/alexa/avs/config/DeviceConfig.java:25` |

**Request headers.** These are the app's standard API headers: `appname`, `channel`, `cv`, `vn`, `vb`, `v: 2.0`, `appplatform`, `lang`, `country`, `timezone`, `hm-privacy-diagnostics: false`, `hm-privacy-ceip`, `User-Agent`, `X-Request-Id`. For authentication the app sends **`apptoken: <token>`**, or a `security` header in a special login mode (`d/z0l.java:138-184`; `d/ook.java:75-78`). So the version check **requires the user's Zepp app token**. Account login is out of scope here.

**Possible payload encryption — UNVERIFIED.** The path `/devices/ALL/hasNewVersion` appears in a list of "encrypted API" paths (`com/xiaomi/hm/health/init/coldlaunch/HttpInitTask.java:39-46`). For requests on that list, an OkHttp interceptor adds `X-HM-EKV` and encrypts and decrypts the body (`d/qxm.java:9-25`; `d/lba.java:105-126`; `d/m9k.java:173-189`). However, the code path this device uses sends the request through the legacy loopj/Apache client (`d/nok.java:23-41`; `d/sa2.java:79-127`), and that client has no such interceptor. Expect a plaintext request to work. If the server rejects it, this encryption layer is the reason.

### 1.2 Version check response (JSON)

| Field | Type | Meaning | Evidence |
|---|---|---|---|
| `ignore` | bool | if true, there is nothing to do | `d/okk.java:55-57` |
| `lang` | string | language of the change log | `d/okk.java:59` |
| `upgradeType` | int | `2` = **forced** upgrade | `d/okk.java:60, 92-95` |
| `deviceSource` | int | echoes the device source; used in the cache path | `d/okk.java:61, 90` |
| `productionSource` | int | default `-1` | `d/okk.java:62, 100` |
| `heartRateVersion` | string | (unused for the strap) | `d/okk.java:63` |
| `buildTime` | string `yyyyMMddhhmm` | converted to epoch seconds. Used in the change-log part (§2.4). | `d/okk.java:71-87` |
| `changeLog` | string | release notes. The text after `###summary###` is the short summary sent to the device. | `d/okk.java:91`; `com/xiaomi/hm/health/device/firmware/HMFwOnlineUpgradeInfo.java:30-40, 87-96` |
| `<p>Url`, `<p>Md5`, `<p>Version`, `<p>Length`, `<p>Flag` | string, string, string, long, int | one group for each **part prefix** `<p>`: `firmware`, `resource`, `baseResource`, `extResource`, `font`, `gps`. `Flag` defaults to `-1`. | `d/okk.java:65-70`; `d/skk.java:95-117`; `com/amazon/identity/auth/map/device/token/MAPCookie.java:45` |

A part is **valid** only if `Url`, `Md5` and `Version` are non-empty **and** `Length > 0` (`d/qkk.java:13-15`). A part with some fields set but not all of them invalidates the whole result (`d/skk.java:122-127`).

### 1.3 Download

* Each valid part is downloaded from its `<p>Url` with a plain GET. The app adds no extra headers to this request (`d/z6h.java:1218-1250`; `d/wsg0.java:539-566`). URLs normally point to a CDN host such as `huami-firmware-cdn.huami.com` (`d/fq9.java:10`). Whether the CDN needs auth is **UNVERIFIED**. The app sends none.
* The file is stored as `<cacheDir>/<deviceSource>/<deviceId>/<md5>` (`d/skk.java:115`).
* After download the app computes the **MD5 of the whole file** (hex, compared case-insensitively) and checks it against `<p>Md5`. On a mismatch it deletes the file and retries once. After two failures it gives up (`d/skk.java:27-57, 166`; `d/m6t.java:21, 39-44`).
* An already-cached file whose MD5 still matches is reused (`d/skk.java:128-131`).

### 1.4 File types

Each part is a **single opaque binary**, not a zip. Possible parts for a band are firmware, resource (or compressed resource), base resource, external resource, font, GPS and AGPS. The strap has no GPS or display. **Which parts the server returns for the strap is UNVERIFIED.** Most likely only `firmware`, possibly plus a resource or base-resource part. When the device supports "batch" upgrades, the phone **packs** all parts into one container before transfer (§2.3).

---

## 2. Firmware file format and validation

### 2.1 What the app validates (and what it does not)

The app performs **very little** content validation:

1. **MD5** of the download against the cloud value (§1.3).
2. **Length > 0** of the file (`d/zo10.java:214-217`).
3. **CRC32** (standard zlib/IEEE CRC32, as in `java.util.zip.CRC32`) of the **whole file that is transferred**. It is sent in the prepare command, and the device re-checks it (device error `5` = CRC error) (`d/zo10.java:219-220`; `d/n03.java:114-129`).
4. Reading a 32-byte **"HMFW…SIGN" trailer** (§2.2). This is used only to decide whether GPS goes before firmware in the update order, never as a device-match gate (`d/flk.java:66-136`).

The **target-device check happens on the device**. The device verifies a signed header and its PnP (product id and version) and rejects with codes `64`–`67` (`SIG_NO_HEAD`, `SIG_HEAD_FMT_ERR`, `SIG_PNP_NOT_MATCH`, `SIG_VERIFY_FAIL`) (`d/lsu.java`). The app's own guarantee that a file belongs to this device comes only from the cloud query being keyed by `deviceSource`, `productId`, `hardwareVersion` and `productionSource`.

### 2.2 The `HMFW`/`SIGN` trailer (32 bytes at offset `fileSize − 96`)

The app seeks to `fileSize − 96`, reads 32 bytes, and parses them (`d/flk.java:79-84`; `d/nkk.java:16-37`).

| Offset | Size | Field | Notes |
|---|---|---|---|
| 0 | 4 | magic L | must equal `0x57464D48` (ASCII `HMFW`) |
| 4 | 4 | magic H | must equal `0x4E474953` (ASCII `SIGN`) |
| 8 | 2 | headerSize | |
| 10 | 4 | fwSize | |
| 14 | 4 | fwType | |
| 18 | 4 | fwVersion | |
| 22 | 2 | pnpId | probably the product id (157) — **UNVERIFIED** |
| 24 | 2 | pnpVersion | probably the product version (258/259) — **UNVERIFIED** |
| 26 | 2 | fwOrder | compared with a value from device info. A match means "GPS first". |
| 28 | 4 | (unparsed) | |

Evidence: magic comparison at `d/flk.java:86`. `1464225096 = 0x57464D48`, `1313294675 = 0x4E474953`.

**Recommendation (brick safety).** Before flashing, the independent app **should** also check: (a) the magic is present, (b) `pnpId`/`pnpVersion` match the connected device's product id and version, and (c) `fwSize` + 96-byte trailer is consistent with the file length. The official app does not make these checks, so they are extra protection, not protocol requirements. Make the PnP check **advisory** until it has been confirmed against a real file.

### 2.3 "Batch" container (UIHH), used when the device supports batch upgrade

If device feature group 1, bit 0 is set ("batch upgrade", `d/flk.java:1291-1300`), the app builds **one** file containing all parts and transfers it as type `FIRMWARE_BATCH` (`d/flk.java:765-848`). The file is built like this:

**Step 1 — each part gets a 10-byte sub-header, followed by the part's bytes** (`d/xvt.java:19-40`):

| Offset | Size | Value |
|---|---|---|
| 0 | 1 | `0x01` (sub-header version) |
| 1 | 1 | part type byte (§3.6) |
| 2 | 4 | part length (u32) |
| 6 | 4 | CRC32 of the part (u32) |
| 10 | n | part bytes |

**Step 2 — order.** Parts are sorted by **ascending type byte** (`com/xiaomi/hm/health/device/firmware/HMFwOnlineUpgradeInfo.java:116-130`; `d/tkk.java:13-15`). A **change-log part of type `0x10`** is always added (§2.4).

**Step 3 — concatenate** all wrapped parts into `content` (`d/zvt.java:24-30`; `d/t8h0.java:941-982`).

**Step 4 — prepend a 32-byte `UIHH` header** (`d/zvt.java:31-58`):

| Offset | Size | Value |
|---|---|---|
| 0 | 4 | ASCII `UIHH` |
| 4 | 2 | `0x0004` |
| 6 | 5 | `00 00 00 00 00` |
| 11 | 1 | `0x01` |
| 12 | 4 | CRC32 of `content` |
| 16 | 2 | `0x0000` |
| 18 | 4 | `0x00000000` |
| 22 | 4 | length of `content` |
| 26 | 6 | `00 ×6` |
| 32 | … | `content` |

The DFU prepare command (§3.3) then carries the length and CRC32 of the **whole UIHH file**.

### 2.4 Change-log part (type `0x10`)

| Offset | Size | Value | Evidence |
|---|---|---|---|
| 0 | 4 | `buildTime` (epoch seconds, u32) | `d/izc.java:3778-3795` |
| 4 | n | UTF-8 summary text (the part of `changeLog` after `###summary###`). May be empty. No terminator. | `HMFwOnlineUpgradeInfo.java:100-115` |

The type value `16` is a literal in the source. That it names `FIRMWARE_CHANGE_LOG` is an inference (**UNVERIFIED**).

### 2.5 Version fields

Version comparison is entirely server-side: the app sends its versions and flags, and the server decides. Locally, the app only compares cached state (`d/flk.java:327-560, 586-704`). There is **no anti-downgrade check in the app**. The device may enforce one (**UNVERIFIED**).

---

## 3. DFU transfer protocol ("DFU V5")

### 3.1 Transport selection

| Condition | Path | Evidence |
|---|---|---|
| Device feature group 1, **bit 3** set | **DFU V5** (this section) | `d/no3.java:113-128` |
| Connector is BLE GATT (the strap's case) | GATT service `HUAMI(1530)`. Control/notify `HUAMI(1531)` ("cpt"), data `HUAMI(1532)` ("pkt"). | `d/fgc.java:25-31`; `d/e8v.java:33-35, 158-190`; `d/w4j.java:24, 280-283` |
| Connector is the BR/EDR "port" transport | same commands on named "ports" `00001531-…`/`00001532-…`. The numeric port ids come from the device's port table, not constants. | `d/fgc.java:32-35`; `d/n43.java:19-20, 211-233`; `d/j43.java:485-501`; `d/lnb0.java:18-37` |
| bit 3 not set | legacy Mi-Band DFU (out of scope) | `d/no3.java:130-138`; `d/akk.java` |

The feature bitmap is described in doc 01 (feature characteristic `HUAMI(0014)`, parser `d/qjk.java:12-58`). Group 1 = the first bitset. **Whether the strap sets bit 3 is UNVERIFIED**, but it almost certainly does.

Setup: enable notifications on `1531`. All commands are written to `1531`, and all responses are notifications on `1531`. Firmware bytes are written to `1532`. The app writes one GATT write at a time and waits for the write callback (30 s timeout) (`d/jv3.java:761-800`). Use **write-without-response** on `1532` only if throughput requires it — the write type the app uses is **UNVERIFIED** (it uses the characteristic default).

### 3.2 Response framing (notifications on `1531`)

```
10  <cmd>  <code>  <payload…>
```

`<cmd>` echoes the request opcode, and `<code>` = `0x01` means success (`d/srk.java:19-44`). Two notifications arrive **asynchronously** and are not tied to a request: `10 D4 …` (progress) and `10 D3 <code>` (a transfer error mid-stream) (`d/al4.java:355-396`; `d/g43.java:27-80`).

### 3.3 Commands

| Op | Request bytes | Response | Evidence |
|---|---|---|---|
| **D0** Query protocol | `D0` | `10 D0 code version:u8 maxChunkSize:u16 backgroundUpgrade:u8` | `d/e8v.java:133-145`; `d/rw3.java:74-77` |
| **D1** Query status | `D1` | `10 D1 code state:u8 [fwType:u8 fwSize:u32 doneSize:u32 — only when state=5] [operatingMode:u8 — when state≠0]` | `d/e8v.java:247-258`; `d/fch0.java:381-438` |
| **D2** Prepare | `D2 type:u8 fileLen:u32 fileCrc32:u32 maxChunkSize:u16 mode:u8 ext…` (see below) | `10 D2 code receivedSize:u32 receivedCrc32:u32` | `d/e8v.java:84-106`; `d/r0a.java:33-40` |
| **D3** Start transfer | `D3 01` = start from offset 0. `D3 00` = continue (resume). | `10 D3 code` | `d/e8v.java:116-124` |
| (data) | raw file bytes on `1532` | — | `d/e8v.java:153-155` |
| **D4** (notify only) | — | `10 D4 receivedSize:u32 retry:u8 receivedData:u32` | `d/al4.java:358-361`; `d/wjb0.java:31` |
| **D5** Validate | `D5` | `10 D5 code` (exactly 3 bytes) | `d/e8v.java:261-263`; `d/al4.java:363-376` |
| **D6** Upgrade (apply) | `D6` | `10 D6 code` (exactly 3 bytes) | `d/e8v.java:241-244`; `d/al4.java:378-383` |

**D2 detail:**

| Offset | Size | Field |
|---|---|---|
| 0 | 1 | `0xD2` |
| 1 | 1 | firmware type byte (§3.6) |
| 2 | 4 | file length (whole file to be sent) |
| 6 | 4 | CRC32 of the whole file |
| 10 | 2 | `maxChunkSize`, echoed from D0 |
| 12 | 1 | mode: `0` normal (transfer + apply). `1` **background / transfer-only** (no D6). `2` part *i* of a multi-file sequence. Evidence: `yjk.l − 1`, `d/lx6.java:143-148`; `d/elk.java:247`; `d/blk.java:177-178`. |
| 13 | 1 | sequence index. `0xFF` = not part of a sequence (the default object has index −1, `d/r0a.java:51-55`). |
| 14 | 1 | **only if index = 0**: total file count |
| 15 | 4 | **only if index = 0**: total byte count of all files |

A single-file update is therefore 14 bytes: `D2 tt LLLLLLLL CCCCCCCC SSSS mm FF`.

### 3.4 Sequence (byte-exact behaviour of the app)

From `d/zo10.java:186-401` and `d/ixk.java:390-447`:

1. **D0** → read `maxChunkSize` (`S`). Fail if there is no reply in 15 s.
2. **D1** → `code` must be 1, and `state` must be **0 (IDLE)** or **7 (WAITING_NEXT_FIRMWARE)**. Otherwise abort (`d/zo10.java:209-213`).
3. Compute `len` and `crc = CRC32(file)`. Send **D2**. `code` must be 1; otherwise report `code` as the error (§3.7).
4. **Resume decision.** If `receivedSize > 0` and `CRC32(file[0:receivedSize]) == receivedCrc32`, resume at `offset = receivedSize`. Otherwise `offset = 0` (`d/zo10.java:230-239`).
5. **D3** with `00` when resuming, `01` otherwise. `code` must be 1.
6. **Transfer loop**, while `offset < len`:
   * Read a **window** of up to `S` bytes from the file at `offset`.
   * Split the window into writes of at most `ATT_MTU − 3` bytes (default 20) and write each one to `1532` (`d/zo10.java:268-291`; `d/cfu.java:15-24`).
   * Wait up to **15 s** for `10 D4`. Require `receivedSize == offset + windowLen`. If it differs or times out → fail. A `10 D3 <code≠1>` notification during transfer → fail with that code (`d/zo10.java:292-302`; `d/e8v.java:216-225`).
   * `offset = receivedSize`. Report progress.
7. **D5** validate. Loop: send **D1**. Wait up to 15 s for `10 D5`. Repeat while the status says **3 (VALIDATING)** and no D5 has arrived. `code` must be 1 (`d/zo10.java:320-346`).
8. Set the "refresh GATT cache on next connect" flag (the services may change after the reboot) (`d/zo10.java:347-358`; `d/s5.java:589-599`).
9. If **mode = 1 (background)**: **stop here with success.** The device holds a validated image and applies it later on its own (§4, §5.3).
10. **D6** upgrade. Loop: **D1** (progress: `fwType`, `fwSize`, `doneSize` while state = **5 IN_UPGRADING**). Wait up to 15 s for `10 D6` (1 s for watch-face or lite-app types). `code` must be 1 (`d/zo10.java:359-400`).
11. Sleep 2 s. The device reboots for firmware parts.

### 3.5 Device states (D1 `state` byte)

| Raw | Name | Evidence |
|---|---|---|
| 0 | IDLE | `d/fch0.java:390-433`; `d/ikb0.java:191-214` |
| 1 | WAITING_TRANSFER | ″ |
| 2 | IN_TRANSFER | ″ |
| 3 | VALIDATING | ″ |
| 4 | WAITING_UPGRADE | ″ |
| 5 | IN_UPGRADING | ″ |
| 6 | BUSY | ″ |
| 7 | WAITING_NEXT_FIRMWARE | ″ |
| 0xFF | DFU_RUNNING | ″ |

### 3.6 Firmware type byte — **mostly UNVERIFIED**

The app's enum contains: FIRMWARE, FONT, RESOURCE, RESOURCE_COMPRESS, RESOURCE_BASE, FIRMWARE_GPS (+CEP/ALM/NMEA/GNS_ALM), FIRMWARE_CHANGE_LOG, FIRMWARE_MODEM, RESOURCE_EXTERNAL, OFFLINE_VOICE_ASSISTANT_RESOURCE, several Sony-LLE GPS types, FIRMWARE_AS7000, FIRMWARE_DIAL, FIRMWARE_MSG, FIRMWARE_EMOJI, FONT_LATIN, FIRMWARE_NB, FIRMWARE_LITE_APP, FIRMWARE_AGPS_BATCH, FIRMWARE_BATCH, FIRMWARE_LTO, FIRMWARE_VOICE, FIRMWARE_BOOTLOADER(_SAFE/_RESOURCE), FIRMWARE_RECOVERY, FIRMWARE_BACKUP, FIRMWARE_GPS_GLN_EPO, FIRMWARE_QUERY (`d/zjk.java:6-54`).

**Recovered from bytecode.** jadx's Java output dropped the per-constant byte values (`d/zjk.java:56-60`). Its fallback (bytecode) mode shows each constant built as `<init>(value, ordinal, name)`. That reading is consistent with the known literal: CHANGE_LOG has ordinal 10 and value 16. Unsigned values:

| Type | Value | Type | Value |
|---|---|---|---|
| FIRMWARE | `0x00` | FIRMWARE_CHANGE_LOG | `0x10` |
| FONT | `0x01` | FIRMWARE_MODEM | `0x11` |
| RESOURCE | `0x02` | RESOURCE_EXTERNAL | `0x12` |
| FIRMWARE_GPS | `0x03` | OFFLINE_VOICE_ASSISTANT_RESOURCE | `0x13` |
| FIRMWARE_GPS_CEP | `0x04` | FIRMWARE_BOOTLOADER_SAFE | `0x30` |
| FIRMWARE_GPS_ALM | `0x05` | FIRMWARE_RECOVERY | `0x31` |
| FIRMWARE_GPS_NMEA | `0x06` | FIRMWARE_BACKUP | `0x32` |
| FIRMWARE_AS7000 | `0x07` | FIRMWARE_BOOTLOADER_RESOURCE | `0x33` |
| FIRMWARE_DIAL | `0x08` | RESOURCE_COMPRESS | `0x82` |
| FIRMWARE_MSG | `0x09` | RESOURCE_BASE | `0x83` |
| FIRMWARE_EMOJI | `0x0A` | FIRMWARE_VOICE | `0x84` |
| FONT_LATIN | `0x0B` | FIRMWARE_GPS_SONY_LLE_* | `0x86`-`0x8A` |
| FIRMWARE_NB | `0x0C` | FIRMWARE_LTO | `0x8B` |
| FIRMWARE_GNS_ALM | `0x0F` | FIRMWARE_GPS_GLN_EPO | `0x8C` |
| FIRMWARE_LITE_APP | `0xA0` | FIRMWARE_AGPS_BATCH | `0xFC` |
| FIRMWARE_BATCH | `0xFD` | FIRMWARE_BOOTLOADER | `0xFE` |
| FIRMWARE_QUERY | `0xFF` | | |

Evidence: `defpackage/zjk` static initializer, read with `jadx --single-class defpackage.zjk --decompilation-mode fallback`.

The cloud part prefixes map to types as follows: `firmware` → `0x00`, `resource` → `0x02`, `baseResource` → `0x83`, `extResource` → `0x12`, `font` → `0x01`, `gps` → `0x03`.

### 3.7 Status and error codes (`code` in any response; also D1/D5/D6)

| Code | Meaning | Code | Meaning |
|---|---|---|---|
| 0 | unknown error | 1 | **success** |
| 2 | invalid parameter or state | 3 | not authorized |
| 4 | file size out of range | 5 | CRC error |
| 7 | packet lost in transfer | 8 | file format error |
| 9 | firmware busy | 10 | timeout (no data for a long time) |
| 11 | state-machine error | 14 | disconnected |
| 32 | in a workout | 33 | timer running |
| 34 | **battery low** | 35 | countdown running |
| 36 | eSIM activating | 37 | recorder active |
| 38 | BT phone call | 39 | HTTP OTA running |
| 40 | power-saving mode on | 41 | **fast-recharge mode on** |
| 48 | music playing | 49 | voice assistant active |
| 50 | ECG measuring | 51 | touch-panel upgrading |
| 64 | signed header missing / wrong type | 65 | header format error |
| 66 | **signature PnP mismatch (wrong device)** | 67 | signature verification failed |
| 68 | GPS upgrade failed | 69 | modem upgrade failed |
| 70 | external-resource upgrade failed | 71 | not enough storage |
| 80 | firmware internal error | 81 | unsupported file type |
| 82 | unsupported sub-file type | 83 | sub-file order error |
| 84 | open file failed | 85 | read/write file failed |
| 86 | decompress failed | 87 | open resource file failed |
| 88 | IAP (in-application programming) failed | | |

Negative codes are app-side only: −1 write failed, −2 no continue response, −3 chunk write failed, −4 length mismatch, −5 command send failed, −6 no validate/upgrade reply (usually a watchdog reboot), −7 file not found. Evidence: `d/lsu.java` (whole enum).

### 3.8 Resume after disconnect

* Resume is **device-driven**. After reconnect and re-auth, send D0, D1, D2 with the **same** file (same length and CRC). If the device returns `receivedSize > 0` and its `receivedCrc32` equals the CRC32 of that prefix of the local file, send `D3 00` and continue from `receivedSize`. Otherwise send `D3 01` and start over (§3.4 step 4).
* The app does not persist any offset itself.
* For a multi-file sequence, a failed file stops the sequence. The remaining files (starting with the failed one) are kept for a later retry (`d/blk.java:109-123`; `d/udd.java:57-73`).
* The app also aborts a **background** transfer when its own "interrupt" policy fires (`d/elk.java:168-180`; `d/zo10.java:256-259`).

---

## 4. Channel endpoint `0x000C` ("OtaModule")

Messages use the doc-01 channel transport. The reply convention is **cmd+1** (the reply's first byte is the request byte + 1). The response handler is keyed on the reply's first byte (`d/rsw.java:17`; `d/nsu.java:91-120`). Each request waits about 5 s for its reply.

| Req | Reply | Name in app | Format | Evidence |
|---|---|---|---|---|
| `01` | `02 version:u8 supportPresetFirmwareInfo:bool supportTriggerWifiOta:bool` | capability / version query (run once per connection) | | `d/rsw.java:107-163`; `d/nsw.java:81-109` |
| `03` | `04 fileExist:bool [fileType:u8 fileSize:u32 crc32:u32 buildTime:u32 log:utf8…]` | getOtaInfo: the package the device already holds | trailing fields only when `fileExist = 1` | `d/rsw.java:255-337`; `d/ssw.java:42-51` |
| `09 version\0 length:u32 crc32:u32 changeLog\0` | `0A result:bool` | write "preset firmware info": announce the package that is about to be transferred | strings are UTF-8, NUL-terminated (an empty string is a single `00`) | `d/rsw.java:166-245`; `d/vwv.java:172-175`; `d/fhc.java:36-84` |
| `0B` | `0C result:bool` | trigger Wi-Fi OTA (not relevant for the strap) | | `d/rsw.java:45-97` |
| — | `05 …` (unsolicited) | "package unpacked / ready" notice. The app then **restores alarms** to the device and may show its upgrade UI. | | `d/nsu.java:115-121`; `d/eyi.java:70-98`; `d/ip0.java:16-60` |

When it is used: if `supportPresetFirmwareInfo = 1`, the app sends `09` immediately before starting DFU. The payload is the cloud version string, the file length, the file CRC32, and the change-log summary (`d/elk.java:257`; `d/fhc.java:36-84`). On devices that report this capability, the app also prefers a single prioritized package over the batch container (`d/flk.java:1272-1306`, `z4` → `u()`).

---

## 5. Preconditions and policy enforced by the app

### 5.1 Before checking or starting (`d/flk.java:950-1023`)

* The device is connected, and battery info has been read.
* **Fast-recharge mode is off** (the device setting). Otherwise the app blocks the update with error 41 (`d/no3.java:82-94`; `d/flk.java:957-961`).
* No other upgrade is in progress, and no AGPS upgrade is in progress.
* For automatic (non-user) checks: at most one automatic upgrade per device per **calendar day** (pref `UPGRADE_FW_TIME_SOURCE_<source>_<mac>`) (`d/flk.java:976-988`; `d/xp4.java:388-392`).

### 5.2 Battery

| Flow | Threshold (MILI family) | Evidence |
|---|---|---|
| User-initiated / foreground | battery **> 10 %**, else a "low battery" screen | `d/flk.java:1183-1207, 1066-1081` |
| Silent background transfer (mode 1) | battery **> 30 %** | `d/xkk.java:116, 143` |

The app does **not** require the phone or the strap to be charging. There is no Wi-Fi check for BLE OTA. The device enforces its own battery limit as well (code 34).

### 5.3 Background ("silent") mode and auto-update at night

* If the device supports batch upgrade **and** the cloud did not mark the update as forced, the app transfers in **mode 1** (transfer + validate only, no D6) without asking the user (`d/flk.java:1313-1321`; `d/elk.java:247`; `d/zo10.java:352-354`).
* The device then applies the image itself. The device setting **`autoOtaAtNightSwitch`** (settings item id 30, boolean) controls night-time auto-install (`d/c6j.java:63, 96`). The settings protocol is in doc 01/02. **When exactly the device applies the image is UNVERIFIED** (likely at night if enabled, or after confirmation on the device).
* For forced or user-initiated updates, the app uses mode 0 (apply immediately).

### 5.4 After reboot

* The device drops the BLE link. The app has already set "refresh GATT cache" (§3.4 step 8), so on reconnect it re-discovers services.
* Reconnect, **full re-auth** and normal init (doc 01): supported-services list, device info, time sync and so on. Do not assume any state survived.
* After a successful resource, font or batch update, the app re-reads device info (versions) (`d/no3.java:145-166`).
* After the device's `05` notice on endpoint 0x000C, the app **re-pushes alarms** (`d/ip0.java:30-60`).

---

## 6. Ordering for multi-part updates

* **Batch-capable device (feature bit 0):** one UIHH file whose parts are sorted by ascending type byte, including change-log `0x10` (§2.3). One DFU session.
* **Multi-file-capable device without batch (feature group 1, bit 1):** separate DFU sessions in list order. The order is GPS (if any), then font, base resource, resource, external resource, and **firmware last**, cut off after firmware (`d/flk.java:848-908`). Each D2 uses mode 2 with index `i`, and index 0 carries the count and total size (`d/blk.java:147-190`). The device sits in state 7 (WAITING_NEXT_FIRMWARE) between files.
* **Neither:** one part at a time, by priority. Firmware first, unless the HMFW trailer's `fwOrder` says GPS first. Then font, base resource, external resource, resource, and finally GPS (`d/flk.java:282-316, 750-763`).
* For the strap (no GPS, no font), expect **firmware (+ resource/base resource)**. Batch support is likely but **UNVERIFIED**.

---

## Implementation checklist

1. Log in to the Zepp account (out of scope) and obtain `apptoken`. Call `GET devices/ALL/hasNewVersion` with the §1.1 parameters, using live values from device info.
2. Parse the §1.2 JSON. Honour `ignore`. Keep only parts that are complete and valid.
3. Download each part. Verify MD5 (retry once). Cache by MD5.
4. Read the feature bitmap (doc 01). Decide between the batch, multi-file and single paths (§6).
5. If batch: build the UIHH container (§2.3, §2.4) with the correct type bytes (§3.6 — measure them first).
6. Run the precondition checks (§5): battery, fast-recharge off, device not busy.
7. On endpoint 0x000C: send `01`. If `supportPresetFirmwareInfo`, send `09` with version, length, CRC32 and summary.
8. Enable notifications on `HUAMI(1531)`. Then D0 → D1 (IDLE/7) → D2 → resume decision → D3 → windowed data on `1532` with a D4 check per window → D5 + D1 polling → (mode 0) D6 + D1 polling.
9. Use 15 s timeouts per command, per window ack and per validate/upgrade wait.
10. Map every non-1 `code` through §3.7 and show it to the user.
11. After success: expect a disconnect. Reconnect with service re-discovery, re-auth, re-read device info, re-push alarms and time.
12. Resume: always start with D0/D1/D2 using the same file, and let the device's `receivedSize`/`receivedCrc32` decide.

## Brick-safety checklist

* [ ] Only flash files obtained from the cloud for **this** `deviceSource`/`productId`/`hardwareVersion` (or the user's explicit choice), and **verify MD5**.
* [ ] Check the `HMFW`/`SIGN` trailer magic. Compare `pnpId`/`pnpVersion` with the device. Refuse on mismatch unless the user overrides (extra check beyond the official app).
* [ ] Use the firmware type bytes from §3.6. Never invent others.
* [ ] Use the exact length and CRC32 of the bytes you will actually send (the whole UIHH file in batch mode).
* [ ] Require D1 state IDLE (0) or WAITING_NEXT_FIRMWARE (7) before D2. Never send D6 unless D5 returned code 1.
* [ ] Enforce battery > 10 % (> 30 % for unattended transfers) and that fast-recharge mode is off.
* [ ] Do not disconnect, re-auth or send other traffic between D5 and the D6 response. Keep the phone awake (wake lock) during transfer.
* [ ] Treat a missing D5/D6 reply (−6) as "probably rebooting". Reconnect and query D1 and the version before retrying. **Never re-flash blindly**.
* [ ] Respect device refusals 32–51 (busy states). Back off, do not retry in a loop.
* [ ] Prefer mode 1 (transfer-only) for unattended runs. The device applies the image itself, under its own safety logic.

## What could not be determined (summary)

* Whether the strap sets feature bits 0, 1 and 3, and therefore whether it uses the batch container, multi-file or single path.
* Which parts the cloud actually serves for the strap, and whether the CDN needs auth.
* The meaning of `pnpId`/`pnpVersion` in the trailer (assumed to be product id and version) and trailer bytes 28–31.
* Exactly when the device self-applies a mode-1 (background) image. The trigger condition of the `05` notice.
* The GATT write type on `1532`. Whether the server requires the `X-HM-EKV` encrypted form of `hasNewVersion`.
