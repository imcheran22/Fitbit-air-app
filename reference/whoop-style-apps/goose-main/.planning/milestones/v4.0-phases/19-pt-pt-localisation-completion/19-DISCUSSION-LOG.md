# Phase 19: pt-PT Localisation Completion (Coach + Startup Fixes) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-06
**Phase:** 19-pt-pt-localisation-completion
**Areas discussed:** Scope das strings, Estrutura de planos, Verificação

---

## Scope das strings

| Option | Description | Selected |
|--------|-------------|----------|
| Gaps da Phase 14 (incluir tudo) | Traduzir todas as 132 strings, independentemente da fase em que foram adicionadas | |
| Só Phase 16-18 (focar no escopo) | Traduzir apenas as strings introduzidas pelas fases v4.0 | |
| Não sei — traduzir tudo na mesma | Não vale a pena investigar a origem. Traduzir todas as que faltam. | ✓ |

**User's choice:** Traduzir tudo na mesma — não investigar origem
**Notes:** 132 strings não-triviais sem pt-PT. Todas a traduzir independentemente de quando foram adicionadas.

---

## Nomes de modelos de IA (área não selecionada, confirmação rápida)

| Option | Description | Selected |
|--------|-------------|----------|
| Manter em inglês | Nomes de produto e versão ficam sem tradução pt-PT. Brand names, convencionalmente não se traduzem. | ✓ |
| Traduzir qualificadores | 'High'/'Low'/'Medium' ficam 'Alto'/'Baixo'/'Médio' | |

**User's choice:** Manter em inglês
**Notes:** Claude Sonnet 4.6, GPT-5.5 High, Gemini 2.5 Flash, Google Client ID — ficam todos sem pt-PT.

---

## Estrutura de planos

| Option | Description | Selected |
|--------|-------------|----------|
| 1 plano único | Todas as 132 traduções num só plano. Infraestrutura já existe desde Phase 14. | ✓ |
| 2 waves | Wave 1: Coach (~40 strings). Wave 2: health/general (~90 strings). | |

**User's choice:** 1 plano único
**Notes:** Mais simples dado que a infraestrutura já existe.

---

## Gate de verificação das correções de startup

| Option | Description | Selected |
|--------|-------------|----------|
| Sim — incluir gate de verificação | O plano confirma que os critérios de sucesso das 3 correções estão satisfeitos. | ✓ |
| Não — já estão feitas | As correções foram comitadas, não precisam de gate adicional. | |

**User's choice:** Incluir gate de verificação
**Notes:** As 3 correções já foram comitadas mas o plano deve confirmar xcodebuild passa.

---

## Verificação das traduções

| Option | Description | Selected |
|--------|-------------|----------|
| Script Python + troca de idioma no simulador | Script conta strings sem pt-PT + verificação visual no simulador | |
| Apenas build verde | xcodebuild passa = fase completa | ✓ |
| Scan programático only | Script confirma 0 strings reais sem pt-PT, sem teste de simulador | |

**User's choice:** Apenas build verde (xcodebuild passa)
**Notes:** Verificação simples — build verde confirma que o xcstrings é válido e as traduções estão registadas.

---

## Claude's Discretion

- Grouping of translations within the single plan (Coach group vs health group) — Claude decides the order
- Which format-only strings to skip (trivial strings like `%lld`, empty, single digits) — Claude applies common sense

## Deferred Ideas

None — discussion stayed within phase scope.
