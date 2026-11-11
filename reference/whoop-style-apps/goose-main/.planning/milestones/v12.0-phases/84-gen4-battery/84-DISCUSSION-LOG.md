# Phase 84: Gen4 Battery - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-14
**Phase:** 84-Gen4 Battery
**Areas discussed:** Cmd 26 trigger timing

---

## Cmd 26 Trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-send na ligação | Imediatamente após connectedCapabilities ser set para Gen4, a app envia Cmd 26 automaticamente. O utilizador vê bateria imediatamente sem ter de tocar em nada. Event-48 substitui o valor quando chegar. | ✓ |
| Só manual (More tab) | Cmd 26 só é enviado quando o utilizador toca em READ_BATTERY na More tab. A bateria fica a '--' até o primeiro Event-48 chegar passivamente (pode demorar vários minutos). | |

**User's choice:** Auto-send na ligação
**Notes:** Phase is otherwise fully specified in ROADMAP with exact byte offsets and guards. Only behavioural decision was timing of Cmd 26.

---

## Claude's Discretion

- Naming of Rust bridge methods
- Whether battery parsing lives in a new `battery.rs` or inline in `bridge.rs`
- Rust test structure (unit vs integration, placement)
- Whether Cmd 26 auto-send is in `processDiscoveredCharacteristics` or a helper

## Deferred Ideas

None — discussion stayed within phase scope.
