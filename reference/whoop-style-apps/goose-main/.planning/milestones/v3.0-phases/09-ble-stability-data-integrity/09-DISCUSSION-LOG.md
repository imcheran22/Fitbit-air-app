# Phase 9: BLE Stability & Data Integrity - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-04
**Phase:** 9-BLE Stability & Data Integrity
**Areas discussed:** device_id por linha (FIX-01), UI do backoff de reconexão (FIX-02/FIX-03), Estrutura do código de backoff (FIX-02/FIX-03), Retenção de storage (FIX-05)

---

## device_id por linha (FIX-01 / CR-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Opção A — passar UUID do lado Swift | Swift passa peripheral.identifier UUID como active_device_id nos bridge args que acionam capture_import. Fix no INSERT side — zero JOIN necessário. | ✓ |
| Opção B — JOIN na query de upload | Bridge upload.get_recent_decoded_streams faz JOIN a ble_raw_notifications para obter device_id por linha antes de filtrar. Fix na query side. | |

**User's choice:** Confirmou Opção A (recomendação de Claude)
**Notes:** User perguntou "o que recomendas?" em ambas as perguntas. Claude recomendou: (1) Opção A para o INSERT por ser a única que satisfaz o critério "non-NULL device_id per row" nas REQUIREMENTS; (2) filtrar por device_type na query de upload (decoded_frames.device_type = "HrMonitor"/"Goose") em vez de JOIN a capture_sessions — mais simples e suficiente para Fase 9 single-device.

---

## UI do backoff de reconexão (FIX-02/FIX-03)

### Localização dos controlos

| Option | Description | Selected |
|--------|-------------|----------|
| DeviceView | Mostra estado inline na vista do dispositivo com botões Retry/Stop | |
| ConnectionView | Ecrã de debug/diagnóstico já com connectionState e reconnectState | ✓ |
| Banner/overlay | Toast flutuante no topo durante reconexão activa | |

**User's choice:** ConnectionView

### Comportamento ao esgotar 10 tentativas

| Option | Description | Selected |
|--------|-------------|----------|
| Mensagem de falha + botão Retry manual | "Failed after 10 attempts" + "Try again" que reinicia do zero | ✓ |
| Volta ao estado disconnected silenciosamente | reconnectState volta a idle sem mensagem | |

**User's choice:** Mensagem de falha + botão Retry manual

### Comportamento do botão Stop

| Option | Description | Selected |
|--------|-------------|----------|
| Abortar reconexão e voltar a idle | Para backoff, remembered device mantido, utilizador pode retry manual | ✓ |
| Abortar e esquecer o dispositivo | Para backoff E limpa remembered device | |

**User's choice:** Abortar reconexão e voltar a idle

---

## Estrutura do código de backoff (FIX-02/FIX-03)

### Tipo partilhado vs paralelo

| Option | Description | Selected |
|--------|-------------|----------|
| Tipo ReconnectBackoff partilhado | Struct usada por GooseBLEClient+Commands e GooseBLEHRMonitorManager | ✓ |
| Implementações paralelas em cada classe | Cada classe implementa a sua lógica de backoff independentemente | |

**User's choice:** Confirmou recomendação de Claude (struct partilhada)
**Notes:** User perguntou "o que recomendas?". Claude recomendou struct partilhada para evitar duplicação da lógica de parâmetros idênticos.

### Ficheiro do ReconnectBackoff

| Option | Description | Selected |
|--------|-------------|----------|
| GooseBLETypes.swift | Agrupa com tipos BLE existentes | |
| GooseBLEReconnect.swift (novo) | Ficheiro dedicado à lógica de reconexão | ✓ |

**User's choice:** GooseBLEReconnect.swift (novo ficheiro)

### Gestão do backoff do HR monitor

| Option | Description | Selected |
|--------|-------------|----------|
| GooseBLEHRMonitorManager gere o seu próprio backoff | Self-contained, didDisconnect já lá está | ✓ |
| GooseBLEClient (owner) gere o backoff do HR monitor | Via callback chain owner? | |

**User's choice:** Confirmou recomendação de Claude (GooseBLEHRMonitorManager self-contained)

---

## Retenção de storage (FIX-05)

### Quando podar

| Option | Description | Selected |
|--------|-------------|----------|
| Após cada batch de escrita (per-write) | CaptureFrameWriteQueue chama compact após cada batch | |
| No arranque da app (on-launch) | GooseAppModel chama compact uma vez na inicialização | |
| Ambos (arranque + per-write) | On-launch + per-write — máxima protecção | ✓ |

**User's choice:** Confirmou recomendação de Claude (ambos)
**Notes:** User perguntou "o que recomendas?". Claude recomendou ambos: on-launch apanha excesso de sessões anteriores, per-write protege durante history syncs activos.

### Visibilidade da poda

| Option | Description | Selected |
|--------|-------------|----------|
| Silenciosa (só log de debug) | ble.record() com resultado, nada visível na UI | |
| Visivel no ConnectionView | Linha com rows e MB libertados no ecrã de debug | ✓ |

**User's choice:** Visivel no ConnectionView

---

## Claude's Discretion

- **FIX-04 (FFI panic safety):** Nenhuma preferência do utilizador necessária. Claude implementa: `panic = "unwind"` no perfil release do Cargo.toml + `catch_unwind(AssertUnwindSafe(|| { ... }))` em `goose_bridge_handle_json`, retornando JSON estruturado de erro em caso de panic.

## Deferred Ideas

- JOIN-based device_id filter em upload bridge para cenários multi-device: deferred para fase futura
- Compaction status no Home tab ou como toast: deferred; ConnectionView é suficiente por agora
