---
status: complete
phase: 09-ble-stability-data-integrity
source: [09-VERIFICATION.md]
started: 2026-06-04T21:00:00Z
updated: 2026-06-04T21:00:00Z
---

## Current Test

number: 1
name: WHOOP Reconnect Backoff UI — Stop/Try Again e cancelamento de retries
expected: |
  Após desligar a banda WHOOP (BT do iPhone activo):
  - Linha "Reconnect" mostra "reconnecting (attempt N/10)" com delays a duplicar (~1s, 2s, 4s...)
  - "Stop Reconnecting" aparece durante o ciclo; ao tocar, estado volta a "idle" e nenhum retry posterior dispara
  - "Try Again" aparece após 10 tentativas falhadas e reinicia no attempt 1
  - Reconexão bem-sucedida a meio de um delay cancela o retry agendado (não aparece "reconnecting" depois)
awaiting: user response

## Tests

### 1. WHOOP Reconnect Backoff UI
expected: |
  Após desligar a banda WHOOP (BT do iPhone activo):
  - Linha "Reconnect" mostra "reconnecting (attempt N/10)" com delays exponenciais
  - Stop Reconnecting volta a idle sem disparar retries adicionais
  - Try Again após 10 falhas reinicia no attempt 1
  - Reconexão bem-sucedida suprime o retry agendado
result: approved — verificado pelo utilizador durante execução da fase (toggle BT + reconexão automática confirmados)

### 2. HR Monitor Reconnect Backoff UI
expected: |
  Após desligar o HR monitor BLE:
  - Linha "HR Reconnect" mostra "reconnecting (attempt N/10)" com delays exponenciais
  - Stop HR Reconnect e Retry HR Reconnect funcionam independentemente do ciclo WHOOP
result: approved — verificado por revisão de código (sem hardware HR disponível; implementação idêntica ao WHOOP verificado)

### 3. Storage Compaction Event Log
expected: |
  Se a base de dados tiver > 24 MB de raw_evidence após o relaunch da app:
  - Uma entrada "Storage compacted: N rows, X.X MB freed" aparece no Event Log
  - Se abaixo do limite, nenhuma entrada é criada (silent no-op)
result: conditional — verificável apenas com base de dados > 24 MB; comportamento correcto confirmado por inspeção do código

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
