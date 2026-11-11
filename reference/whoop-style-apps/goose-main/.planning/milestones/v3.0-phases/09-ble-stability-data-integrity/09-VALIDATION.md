---
phase: 09
slug: ble-stability-data-integrity
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-04
---

# Phase 09 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `cargo test` (Rust integration tests em `Rust/core/tests/`) |
| **Config file** | `Rust/core/Cargo.toml` |
| **Quick run command** | `cd Rust/core && cargo test --test bridge_tests 2>&1 \| tail -20` |
| **Full suite command** | `cd Rust/core && cargo test 2>&1 \| tail -30` |
| **Estimated runtime** | ~30 segundos (Rust); Swift validation é manual (sem XCTest target) |

---

## Sampling Rate

- **After every task commit:** Run `cd Rust/core && cargo test --test bridge_tests 2>&1 | tail -20`
- **After every plan wave:** Run `cd Rust/core && cargo test 2>&1 | tail -30`
- **Before `/gsd-verify-work`:** Full Rust suite green + manual BLE reconnect smoke test
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|---device_id` non-NULL após batch import | unit (Rust) | `cargo test --test capture_import_tests -- device_id` | ✅ `tests/capture_import_tests.rs` | ⬜ pending |
| 09-01-02 | 01 | 1 | FIX-01 | — | Upload bridge filtra HR frames por `device_type` | unit (Rust) | `cargo test --test bridge_tests -- upload` | ✅ `tests/bridge_tests.rs` | ⬜ pending |
| 09-02-01 | 02 | 1 | FIX-04 | T-09-01 | Panic retorna JSON `{"ok":false,"error":{"code":"panic"}}` em vez de crash | unit (Rust) | `cargo test --test bridge_tests -- panic` | ❌ Wave 0 | ⬜ pending |
| 09-02-02 | 02 | 1 | FIX-04 | T-09-01 | `panic = "unwind"` activo no perfil release | unit (Rust) | `cargo test --test bridge_tests -- panic` | ❌ Wave 0 | ⬜ pending |
| 09-03-01 | 03 | 1 | FIX-05 | — | `storage.compact_raw_evidence` bridge method existe e retorna relatório | unit (Rust) | `cargo test --test bridge_tests -- compact` | ❌ Wave 0 | ⬜ pending |
| 09-03-02 | 03 | 1 | FIX-05 | — | Compaction é no-op quando abaixo do limite | unit (Rust) | `cargo test --test bridge_tests -- compact` | ❌ Wave 0 | ⬜ pending |
| 09-04-01 | 04 | 2 | FIX-02 | — | `ReconnectBackoff.nextDelay()` retorna delays correctos e capped a 60s | manual | — | manual | ⬜ pending |
| 09-04-02 | 04 | 2 | FIX-02 | — | UI mostra "reconnecting (attempt N/10)" após WHOOP disconnect | manual | — | manual | ⬜ pending |
| 09-05-01 | 05 | 2 | FIX-03 | — | HR monitor mostra estado de reconexão após disconnect | manual | — | manual | ⬜ pending |
| 09-05-02 | 05 | 2 | FIX-03 | — | Botão Stop aborta ciclo e volta a `idle`; device não é esquecido | manual | — | manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `Rust/core/tests/bridge_tests.rs` — novo teste FIX-04: trigger panic via args inválidos (e.g., `method: "panic_test"` ou malformed JSON), verifica retorno `{"ok":false,"error":{"code":"panic",...}}`
- [ ] `Rust/core/tests/bridge_tests.rs` — novo teste FIX-05: `storage.compact_raw_evidence` com `limit_bytes=25165824`, verifica campos `before_bytes`, `after_bytes`, `compacted_rows`, `freed_bytes`
- [ ] `Rust/core/tests/capture_import_tests.rs` — novo teste FIX-01: import com `active_device_id = "test-uuid"`, verifica que `ble_raw_notifications.device_id` é `"test-uuid"` (não NULL)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| WHOOP reconnect backoff com UI counter | FIX-02 | Sem XCTest target; requer device/simulator BLE real | 1. Ligar app ao WHOOP. 2. Forçar disconnect. 3. Verificar que `ConnectionView` mostra "reconnecting (attempt N/10)". 4. Aguardar 10 tentativas → mensagem de falha + botão "Try again". 5. Tap "Try again" → ciclo reinicia. |
| Stop button aborta reconexão | FIX-02 | Requer interacção manual | Durante reconexão activa, tap "Stop" → estado volta a `idle`, dispositivo permanece na lista. |
| HR monitor reconnect backoff | FIX-03 | Requer 2 dispositivos BLE | 1. Ligar HR monitor. 2. Forçar disconnect. 3. Verificar `ConnectionView` mostra estado de reconexão. 4. Mesmo flow de FIX-02. |
| Storage compaction log em ConnectionView | FIX-05 | Requer dados suficientes em DB | Injectar >24 MB em `raw_evidence`, lançar app → verificar que `ConnectionView` mostra "Storage compacted: N rows, X MB freed". |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
