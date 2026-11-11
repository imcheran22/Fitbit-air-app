// Model output contract (spec 2026-09-30, section 2.3): the conversational
// reply, optionally followed by fenced ```card {json}``` and ```memory {json}```
// blocks. Everything from the first fence on is data, never shown as text.
// Parsing is forgiving (a ```json or untagged block is recognised by its shape,
// an unterminated last block is read if its JSON is complete) and never throws:
// anything malformed is simply absent.

export interface RawCard {
  headline?: unknown;
  tiles?: unknown;
  ranked?: unknown;
  tip?: unknown;
  source?: unknown;
}

export interface ParsedOutput {
  reply: string;
  card?: RawCard;
  memory?: unknown[];
}

const BLOCK_RE = /```[ \t]*([A-Za-z]*)[ \t]*\r?\n?([\s\S]*?)(?:```|$)/g;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function kindOf(tag: string, json: unknown): 'card' | 'memory' | null {
  const t = tag.toLowerCase();
  if (t === 'card' || t === 'memory') return t;
  if (isObject(json) && 'headline' in json) return 'card';
  if (Array.isArray(json) || (isObject(json) && 'category' in json)) return 'memory';
  return null;
}

export function parseModelOutput(raw: string): ParsedOutput {
  const fence = raw.indexOf('```');
  const out: ParsedOutput = { reply: (fence === -1 ? raw : raw.slice(0, fence)).trim() };
  if (fence === -1) return out;

  for (const m of raw.slice(fence).matchAll(BLOCK_RE)) {
    const body = (m[2] ?? '').trim();
    if (body.length === 0) continue;
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      continue;
    }
    const kind = kindOf(m[1] ?? '', json);
    if (kind === 'card') {
      if (out.card === undefined && isObject(json)) out.card = json as RawCard;
    } else if (kind === 'memory') {
      out.memory = [...(out.memory ?? []), ...(Array.isArray(json) ? json : [json])];
    }
  }
  return out;
}
