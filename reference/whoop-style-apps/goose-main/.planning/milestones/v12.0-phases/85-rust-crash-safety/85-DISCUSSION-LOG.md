# Phase 85: Rust Crash Safety - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-14
**Phase:** 85-rust-crash-safety
**Areas discussed:** Decomposição dos planos, Variantes de GooseError, Posição do deny attribute

---

## Decomposição dos planos

| Option | Description | Selected |
|--------|-------------|----------|
| 2 waves: ficheiros grandes + ficheiros pequenos | Wave 1: bridge.rs + store.rs. Wave 2: restantes + gate. 3 planos total. | |
| 3 waves: bridge.rs / store.rs / resto | Wave separada por cada ficheiro grande. 4-5 planos total. | |
| 1 plano por módulo (granular) | Plano dedicado por ficheiro. 6-8 planos total. | ✓ |

**User's choice:** 1 plano por módulo — mais fácil de rever cada diff.

**Q2 — Plano gate:**

| Option | Description | Selected |
|--------|-------------|----------|
| Deny attribute + cargo clippy + cargo test --locked | Plano dedicado só para verificação. | ✓ |
| Deny attribute inline no último plano de módulo | Misturar verificação com conversão. | |

---

## Variantes de GooseError

| Option | Description | Selected |
|--------|-------------|----------|
| GooseError::message(...) para tudo o resto | Usar variante genérica Message(String) com mensagens descritivas. | ✓ |
| Adicionar variantes específicas novas | Ex: GooseError::Parse, GooseError::Index. | |
| Usar ok_or / ok_or_else inline | Conversão explícita Option→Result no próprio site. | |

**User's choice:** GooseError::message para tudo o que não é Io/Json/Hex/Sqlite.

**Q2 — Testes:**

| Option | Description | Selected |
|--------|-------------|----------|
| Não — preservar unwrap() em testes | O deny exclui testes por cfg_attr. | |
| Sim — converter testes também | Usar .expect("mensagem") para panics mais claros. | ✓ |

**Notes:** Test code converted to `.expect("descriptive message")` for clearer test failure output.

---

## Posição do deny attribute

| Option | Description | Selected |
|--------|-------------|----------|
| lib.rs no topo (crate-wide) — apenas no plano gate | Adicionado só no plano final depois de tudo limpo. | |
| lib.rs desde o início + #[allow] por módulo | deny em Plan 1; allows progressivamente removidos. | ✓ |

**User's choice:** Adicionar deny em Plan 1 com allows por módulo — mais disciplinado.

**Q2 — unnecessary_unwrap:**

| Option | Description | Selected |
|--------|-------------|----------|
| Manter o unnecessary_unwrap no allow | São lints diferentes. Manter separado. | ✓ |
| Remover o unnecessary_unwrap do allow | Limpar o allow list ao mesmo tempo. | |

---

## Claude's Discretion

- Exact error message text for each `.unwrap()` site
- `ok_or_else` vs `ok_or` per-site based on performance context
- `?` propagation vs explicit `map_err` chains per site
- Module-level allow placement (file-top vs. specific impl blocks)

## Deferred Ideas

- New GooseError variants (ParseError, IndexError) — not needed; GooseError::message sufficient
- cargo clippy -D warnings for CI enforcement — out of scope for Phase 85
