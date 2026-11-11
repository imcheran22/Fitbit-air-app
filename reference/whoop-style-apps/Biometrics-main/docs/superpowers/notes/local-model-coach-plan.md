# Local model as the AI coach: spike results and future plan

## Update 2026-09-22: shipped as a provider

`COACH_PROVIDER=ollama` now selects `src/coach/model/ollama.ts` (loopback-only by
default; see `backend/.env.example`). The spike probe became `npm run eval:coach:local`.
Same 34 fixtures, 300 s budget, on the M1 Pro:

| | **`qwen3.6:35b`** (MoE, ~3B active) | `qwen3.8:27b` | `richardyoung/qwen2.5-7b-instruct-abliterated` | `feadxus/flux2-klein-4b-uncensored` (Qwen3 4B) |
|---|---|---|---|---|
| Model replies | **33/34** (1 safe fallback) | 32/34 (2 safe fallbacks) | 11/34 | 34/34 |
| First-try guardrail rejects | **3** | 5 | 34 (writes raw digits instead of `{{ref}}`) | 11 |
| Tool use | right tool when needed | right tool every time | calls tools | **never called a tool** |
| Median / p90 latency | **3.1 s / 5.0 s** | 30 s / 72 s | 14 s / 14 s | 3.4 s / 5.3 s |
| Within 12 s | 32/34 (max 16 s) | 0/34 | 3/34 | 34/34 |

Recommended setup: `OLLAMA_MODEL=qwen3.6:35b` (pinned tag; 22 GB, fits the 32 GB M1 Pro
when it is the only model loaded), `COACH_FAST_BUDGET_MS=30000`, and the app's
`EXPO_PUBLIC_COACH_TIMEOUT_MS=35000`. Reading its replies: the eight direction-check
flags are all false positives (each says "lower", which is right), and it declined to
store a health fact as a memory. Remaining weaknesses, shared with the 27B: awkward
wording around the signed delta and direction word ("a lower change from yesterday",
"by -2.6 points"; see Formatting below), an occasional guess from missing data ("Sleep
Score isn't available... you might not have had enough rest"), and one case describing
a positive factor contribution as pulling the score down. The 7B abliterated and 4B
uncensored models are refusal-stripped fine-tunes and fail tool use or grounding; do
not use them. Re-run `npm run eval:coach:local` before changing the model. The
original spike write-up follows.

Status: **spike done, follow-up parked** (2026-09-21). Nothing here ships; the coach is
still dark by default (`COACH_ENABLED=false`) with only `UnconfiguredProvider` and
`ScriptedProvider` in the tree.

## Question

Can a local open-weight model (optionally fine-tuned) meet the coach's real contract well
enough to pass our existing guardrails and evals: correct tool calls, replies that use
only `{{tool.path}}` references (no unwrapped digits), correct direction wording, and an
answer inside the 12 s fast-tier budget on the development Mac (M1 Pro, 32 GB, about
12 GB free disk)?

Why it matters: a local model would remove the spec section 5 blocker ("health data leaves
the device"), which no hosted provider has cleared.

## What was run

The 34 model-bound eval fixtures (the safety fixture bypasses the model) went through the
**real orchestrator** with `qwen3.8:27b` (Q4_K_M) on Ollama, using the fixtures' snapshot
and question and ignoring their scripted outputs. Time budget relaxed to 300 s so quality
could be measured apart from speed. One sample per fixture, temperature 0.3, thinking off,
test database only. Probe script: `local-model-probe/localModelProbe.ts.txt`.

## Results (qwen3.8:27b)

| | |
|---|---|
| Valid model replies | 33 / 34 (the one fallback was the fixture built to provoke bad output; it degraded safely to the preamble text) |
| Rejected by grounding on first attempt | 3 / 34, each fixed by the single regenerate |
| Tool use | right tool every time; never misused `proposeMemory`; declined health-fact "memories" and pointed to a professional |
| Wrong direction stated | none found by reading the replies |
| **Latency** | **0 / 34 under 12 s.** min 15 s, median 30 s, p90 49 s, max 72 s. About 4-8 generated tokens/s, about 1,500 prompt tokens per turn |

Caveats: one sample per fixture (3 / 34 has a wide interval), and the eval scores guardrail
compliance, not helpfulness or tone.

Findings that hold for any local model:

- **Adapter:** the provider interface allows a `system` message mid-conversation (the
  corrective retry). Qwen-family templates accept only a leading system message, so the
  adapter sent it as a `user` message prefixed `[system notice]`.
- **The direction checker over-flags free prose.** 20 of 32 replies were flagged, almost
  all false positives ("set yourself up", "flared up", "pulled the score down"). It was
  built for scripted replies. Any real-model eval needs a narrower matcher (only words
  attached to the score or the comparison with yesterday) or a human read.
- **Trend claims are invisible to the guardrail.** In a weekly recap the model said "the
  overall trend this week is upward" about a history that ended flat; every number was
  grounded. Section 4 of the coach spec already says the runtime guardrail cannot catch
  this class; a model that gets more freedom will do it more.
- **Formatting:** deltas render as "-3 points lower" (a double negative) because the
  precomputed `deltaFromYesterday` is signed and `direction` is a word. That is a
  prompt/tool-shape issue, not a model issue.

## Recommendation

1. **Do not fine-tune yet.** The 27B already passes the guardrails about 91 % of the time
   on the first try; quality is not the bottleneck.
2. **The 27B is the wrong size for this Mac.** Probe a 4-8B model next; it should be
   roughly three times faster. Decide whether it clears 12 s and still passes.
3. **Fine-tune only if the small model fails on format or tool discipline.** Plan: a LoRA
   (MLX, 4-bit) on the small model, trained on synthetic conversations generated by the
   27B from fixture-like snapshots and **filtered with our own guardrails and direction
   check** as the rejection sampler. It would teach style, `{{ref}}` discipline and tool
   use, never health facts. There are no real coaching transcripts to train on.

## Next steps (parked)

1. Get `granite4.1:8b` (IBM Granite 4.1, Apache 2.0, tool-capable, about 5 GB at Q4). The
   first attempt failed: the Ollama daemon could not resolve the model storage host
   (`*.r2.cloudflarestorage.com: no such host`) while `nslookup` against 8.8.8.8 resolved
   it fine, so it is the daemon's resolver (VPN, DNS filter or stale state), not the
   network. `qwen3.8` has no small size (27B variants only). Alternatives if Granite stays
   blocked: `granite4.1:3b`, `lfm2.5`.
2. Rerun: copy the probe to `backend/scripts/spikes/localModelProbe.ts`, then from
   `backend/`:
   `DATABASE_URL=postgresql://postgres:postgres@localhost:5434/biometrics_test PROBE_MODEL=granite4.1:8b PROBE_OUT=/tmp/results-8b.jsonl npx ts-node --transpile-only --project tsconfig.json scripts/spikes/localModelProbe.ts`
   The probe refuses to run unless `DATABASE_URL` names a `*_test` database.
3. Compare against the table above; also measure with the real 12 s budget (drop the
   `budgets` override) to get the true fallback rate.
4. Narrow the direction checker for free prose before trusting its numbers.
5. Open decision: "local" means the developer's Mac or a self-hosted server. On-device on
   users' phones would mean a model of about 3B or smaller and changes this whole analysis.
6. Only then decide on fine-tuning (step 3 of the recommendation), and check disk first:
   it was 99 % full with 12 GB free.
