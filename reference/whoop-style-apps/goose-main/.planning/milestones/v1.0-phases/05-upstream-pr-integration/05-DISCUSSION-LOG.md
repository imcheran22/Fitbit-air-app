# Phase 5: Upstream PR Integration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-03
**Phase:** 5-Upstream PR Integration
**Areas discussed:** Merge order, PR #12 handling

---

## Merge Order

| Option | Description | Selected |
|--------|-------------|----------|
| Baixo risco primeiro (Recomendado) | #3 → #6 → #1 → #13 → #10 → #7 → #4 → #5 → #12 | ✓ |
| Ordem numérica (#1, #3, #4...) | Simples mas não agrupa por risco. | |

**User's choice:** Baixo risco primeiro
**Notes:** Testes Rust após cada PR que toca Rust core.

---

## PR #12 FFI Threading

| Option | Description | Selected |
|--------|-------------|----------|
| Integrar #12 por último, depois de todas as fases | Phase 5 avança com os 8 PRs restantes. #12 fica para o fim. | ✓ |
| Integrar #12 antes da Phase 3 | Phase 5 corre antes de Phase 3 ser executada. | |

**User's choice:** Por último (após Phases 2+3+4 executadas)
**Notes:** Evitar conflito com upload client FFI (Phase 3).

---

## Claude's Discretion

- Estratégia de fetch/merge (gh CLI vs git directo)
- Mensagem de commit: "merge: upstream PR #N — <título>"
- PR #12 marcado como autonomous: false no plano

## Deferred Ideas

- PRs de volta ao upstream (UPSTREAM-V2-01)
- Issues upstream #2, #8, #9, #11
