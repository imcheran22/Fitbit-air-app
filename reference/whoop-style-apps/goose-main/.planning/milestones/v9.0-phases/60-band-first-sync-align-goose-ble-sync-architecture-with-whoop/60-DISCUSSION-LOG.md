# Phase 60: Band-First Sync - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-11
**Phase:** 60-band-first-sync-align-goose-ble-sync-architecture-with-whoop
**Areas discussed:** Overnight guard removal, Foreground trigger + cooldown, BGTask/push when disconnected, Push payload (goose-daily-ready)

---

## Overnight Guard: o que sobra

| Option | Description | Selected |
|--------|-------------|----------|
| Remove só o range poll | Overnight guard continua como feature manual sem polling histórico | |
| Marcar como legacy/depreciado | Manter código, esconder UI atrás de #if DEBUG | |
| Remover completamente | Delete OvernightRun.swift e toda a UI overnight | ✓ |

**User's choice:** Remover completamente

| Option | Description | Selected |
|--------|-------------|----------|
| Remover o card/secção overnight do More tab | More tab sem a secção overnight | ✓ |
| Substituir por status de sync ativo | Espaço passa a mostrar estado do foreground sync | |

**User's choice:** Remover o card do More tab

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, remover OvernightSQLiteMirrorQueue | Era exclusivamente para o overnight guard | |
| Manter por precaução | Pode ter utilidade futura para inserts em background | ✓ |

**User's choice:** Manter OvernightSQLiteMirrorQueue (sem callers activos)

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, remover overnightRawSpool | Sem o overnight guard, não tem consumidor | ✓ |
| Manter como arquivo passivo | — | |

**User's choice:** Remover overnightRawSpool

| Option | Description | Selected |
|--------|-------------|----------|
| Não afeta — fluxos independentes | maybeScheduleMorningSleepSync é independente | |
| Precisa de revisão | handleBLEConnectionStateChange tem dependências em overnightGuardActive | ✓ |

**User's choice:** Precisa de revisão — limpar dependências de overnightGuardActive

**Notes:** Utilizador perguntou sobre sleep stages durante esta área. Esclarecimento dado: os sleep stages (Cole-Kripke) são calculados no Rust core a partir de dados IMU gravity (K18/K24) vindos do sync histórico normal — completamente independentes do overnight guard. Remover o overnight guard não afeta o pipeline de sleep staging.

---

## Trigger de foreground + cooldown

| Option | Description | Selected |
|--------|-------------|----------|
| Só se já conectado (connectionState == 'ready') | Comportamento mais seguro, sem tentativa de reconexão | ✓ |
| Conecta se houver device previamente emparelhado | Mais agressivo, tenta reconexão automática | |

**User's choice:** Só se já conectado

| Option | Description | Selected |
|--------|-------------|----------|
| 15 minutos | Agressivo | |
| 30 minutos | Equilíbrio bateria/frescura | ✓ |
| 60 minutos | Conservador | |

**User's choice:** 30 minutos

| Option | Description | Selected |
|--------|-------------|----------|
| UserDefaults | Padrão do projeto, persiste entre lançamentos | ✓ |
| Propriedade em memória | Reset a cada kill+restart | |

**User's choice:** UserDefaults ("goose.swift.lastHistorySyncAt")

| Option | Description | Selected |
|--------|-------------|----------|
| Novo método dedicado (triggerForegroundBLESync) | Mais limpo, sem afetar maybeScheduleMorningSleepSync | ✓ |
| Generalizar maybeScheduleMorningSleepSync | Requer refactor e remoção do gate de hora do dia | |

**User's choice:** Novo método dedicado (delegou a Claude a recomendação)
**Notes:** Claude recomendou método novo em GooseAppModel+BandFirstSync.swift. Utilizador aceitou.

---

## BGTask + push quando desconectado

| Option | Description | Selected |
|--------|-------------|----------|
| Skip silencioso + chamar completionHandler | Sem BLE conectado, upload de dados SQLite existentes | |
| Tentar scan + connect BLE | Background BLE possível com bluetooth-central declarado | ✓ |
| Só chamar completionHandler | Puro skip | |

**User's choice:** Tentar scan + connect BLE

| Option | Description | Selected |
|--------|-------------|----------|
| Timeout + completionHandler, sem crash | 20s timeout, cancela scan, agenda próximo refresh | ✓ |
| Deixar o OS revogar | Registar expirationHandler | |

**User's choice:** 20s timeout + completionHandler

| Option | Description | Selected |
|--------|-------------|----------|
| Mesmo comportamento: scan+connect+timeout | Consistência entre BGTask e push | ✓ |
| Push apenas aciona upload (sem BLE) | — | |

**User's choice:** Mesmo comportamento para ambos os paths

---

## Payload do push 'goose-daily-ready'

| Option | Description | Selected |
|--------|-------------|----------|
| Trigger vazio (só content-available: 1) | App vai buscar ao SQLite no próximo foreground | ✓ (Claude) |
| JSON compacto com métricas-chave | Cache em UserDefaults para UI sem abrir app | |

**Claude's choice:** Trigger vazio (recomendado por Claude, sem widget de métricas no projeto)

| Option | Description | Selected |
|--------|-------------|----------|
| Skip silencioso se GOOSE_APNS_KEY_P8 não definida | compute_day completa, push opcional | ✓ |
| Erro fatal no arranque | Push obrigatório | |

**User's choice:** Skip silencioso (APNs opcional)

| Option | Description | Selected |
|--------|-------------|----------|
| Conteúdo raw da chave .p8 como env var | Sem ficheiros extra no container | ✓ |
| Path para ficheiro .p8 montado no container | Bind mount em docker-compose | |

**User's choice:** Conteúdo raw como env var

| Option | Description | Selected |
|--------|-------------|----------|
| Production APNs | Para builds App Store/ad-hoc | |
| Sandbox APNs | Para builds Xcode dev | |
| GOOSE_APNS_ENV=sandbox\|production | Flexível, default sandbox | ✓ (Claude) |

**Claude's choice:** GOOSE_APNS_ENV configurável, default sandbox

---

## Decisão Arquitetural: Papel do Servidor

| Option | Description | Selected |
|--------|-------------|----------|
| Servidor só para backup — sem APNs | Fase 60 fica 100% iOS, sem server changes | ✓ |
| Manter APNs do servidor | Requer .p8 key, device_tokens table, apns.py | |

**User's choice:** Servidor só para backup — toda a parte APNs do servidor adiada indefinidamente

**Notes:** Utilizador perguntou "é possível tirar a dependência do servidor, e o servidor ser só para backup de dados?" — questão legítima que mudou o scope. Claude explicou que `start-sync-data` é circular num setup single-device (servidor recebe dados DO app, não tem informação independente para empurrar). Utilizador decidiu remover APNs do servidor desta fase.

---

## Claude's Discretion

- **triggerForegroundBLESync logging:** seguir padrões existentes em BandFirstSync.swift (ble.record vs OSLog)
- **BGAppRefreshTask scheduling interval:** iOS impõe mínimo de 15 min; valor prático ~30 min
- **APNs environment:** recomendado GOOSE_APNS_ENV configurável (default sandbox) — mas APNs removido do scope desta fase

## Deferred Ideas

- **Server-side APNs:** `goose-daily-ready` + `start-sync-data` do servidor. `start-sync-data` avaliado como circular em single-device. Adiar indefinidamente; revisitar se widget de métricas for adicionado.
- **Watermark-based upload:** mais eficiente que synced flag, mencionado no ROADMAP como stretch goal.
- **BTHR (Background Tracked Heart Rate):** documentado no ROADMAP, não relevante para esta fase.
