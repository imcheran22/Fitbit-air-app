---
date: "2026-06-14 00:00"
promoted: false
---

nota de investigação: NoopApp/noop PR#307 — WHOOP v25 PPG→FC fabricação de dados. O PR descobre que autocorrelação no byte offset 15 de frames packet_k=25 retorna 1440/N (período de registo) em vez de fisiologia real. Actualmente não somos vulneráveis — packet_k=25 cai no braço `_ => (None, vec![])` em parse_data_packet_body_summary() em Rust/core/src/protocol.rs e history_hr_marker_offset() não tem case para 25. Relevante quando adicionarmos suporte a v25: não usar autocorrelação no offset 15 como fonte de FC. Referência: https://github.com/NoopApp/noop/pull/307
