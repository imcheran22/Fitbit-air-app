# Phase 4: Upload Status Feedback - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-03
**Phase:** 4-Upload Status Feedback
**Areas discussed:** Health check display, Health check timing

---

## Health Check Display

| Option | Description | Selected |
|--------|-------------|----------|
| Status inline no ecrã Remote Server (Recomendado) | Label 'Servidor acessível ✅' ou 'Servidor inacessível ❌' dentro do ecrã de settings. | ✓ |
| Route status indicator na More list | A row 'Remote Server' na More list mostra ícone de estado (verde/vermelho). | |

**User's choice:** Status inline no ecrã Remote Server
**Notes:** Sem banners ou alerts. O utilizador vê ao abrir Remote Server.

---

## Health Check Timing

| Option | Description | Selected |
|--------|-------------|----------|
| Só ao arrancar a app (Recomendado) | Simples. Utilizador reabre a app para verificar se servidor voltou. | ✓ |
| Periodicamente (a cada 5 min) | Estado actualiza enquanto app está aberta. Requer timer. | |

**User's choice:** Só ao arrancar a app
**Notes:** Uma verificação por sessão de app — suficiente para servidor de backup local.

---

## Claude's Discretion

- Formato timestamp: RelativeDateTimeFormatter ("Último upload: há 2 min")
- Estado inicial: "A verificar..." com ProgressView inline
- Subsecção "Status" só visível quando upload habilitado e URL configurada
- Batches pendentes em v1: sempre 0 excepto durante retry ativo (in-memory)

## Deferred Ideas

None.
