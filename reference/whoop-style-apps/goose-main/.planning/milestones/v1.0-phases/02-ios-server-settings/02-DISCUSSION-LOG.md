# Phase 2: iOS Server Settings - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-03
**Phase:** 2-iOS Server Settings
**Areas discussed:** Navigation placement, Upload toggle, URL validation

---

## Navigation Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Secção Settings (junto de Privacy) | Remote Server aparece na lista existente de Settings. Simple, sem nova secção. | ✓ |
| Nova secção 'Server' (Recomendado) | Secção própria 'Server' ou 'Remote' antes ou depois de Settings. Separa visualmente o conceito. | |

**User's choice:** Secção Settings (junto de Privacy)
**Notes:** Manter simplicidade sem nova secção separada.

---

## Upload Toggle

| Option | Description | Selected |
|--------|-------------|----------|
| Só dentro do ecrã Remote Server | Toggle junto com URL e API key no detail screen. | ✓ |
| Quick toggle na More list (Recomendado) | Toggle visível na row da More list + dentro do detail screen. | |

**User's choice:** Só dentro do ecrã Remote Server
**Notes:** Configurações completas acessíveis num único ecrã dedicado.

---

## URL Validation

| Option | Description | Selected |
|--------|-------------|----------|
| Ao gravar (tap Save) | Utilizador preenche URL, toca Save, e só então vê o erro inline. | ✓ |
| Real-time enquanto escreve | Erro aparece assim que o URL é claramente inválido. | |

**User's choice:** Ao gravar (tap Save)
**Notes:** Fluxo menos interruptivo; erro inline sob o TextField.

---

## Claude's Discretion

- SF Symbol para o route
- Label "Remote Server" para o ecrã
- Estrutura do Keychain wrapper (reutilizar padrão CodexEmbeddedAuth)
- Chaves UserDefaults específicas (`goose.remote.*`)

## Deferred Ideas

None — discussão manteve-se dentro do scope da Phase 2.
