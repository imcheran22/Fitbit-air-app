// Push notifications for the coach (spec section 6).
//
// PUSH CONTENT IS GENERIC. For the coach and recap kinds the title and body are fixed strings
// chosen from the small server-side table below by a KIND. They are never model-generated and
// never contain a score, factor, habit name or any number, because push text is visible on the
// lock screen and passes through the OS push provider (APNs/FCM), a third party this design does
// not want holding health data. The digest itself is fetched in-app after the user opens it.
//
// BUDDY KINDS ARE TEMPLATES WITH TYPED SLOTS (buddies spec 2026-10-06 §6, which amends the rule
// above for these kinds only). Their text may contain a buddy's sanitised display name and a
// closed sticker or badge-level label, never a number, score or other health value, never model
// output. The Expo sender re-renders the expected text from the template and the slots and throws
// unless the payload matches exactly, so the closed-table guarantee still holds.
//
// DM_MESSAGE (spec 2026-10-07 social §10) amends the rule above for one kind: with the RECIPIENT's previews on, its body
// is the sender's own message on one line (at most 80 code points plus "…", checked by isPushPreview), the only free
// text a push may ever carry; never a health value, never model output. Without previews it is a fixed template.
//
// DATA IS ID-ONLY. A payload may carry `data` only as { kind: 'recap', recapId: <uuid> } on a recap
// kind, or { kind: <the buddy kind>, refId: <uuid> } on a buddy kind: a fixed kind and an opaque id,
// never content. The Expo sender re-validates data against that allowlist exactly as it re-checks
// title and body.
//
// Structurally, nothing here can carry other text: sendGenericPush() takes a
// kind (a closed union), not a string, and builds the payload by looking that
// kind up. Buddy payloads are built only by buddyPushPayload(), which renders the
// kind's template from typed slots (a name that passes isPushName, a sticker or
// badge label from a closed table) and attaches id-only data. There is no
// parameter through which model output or a health value could be interpolated. Any future proactive nudge (threshold-triggered or
// daily check-in) must go through this same function, by way of
// sendCoachPush() (coachPush.ts), which also checks the coach flag and consent.
// The recap push (sendRecapPush below) builds its payload the same way.
//
// Two senders exist: the no-op default, and ExpoPushSender, selected with
// PUSH_PROVIDER=expo (config.ts). The Expo sender re-checks every title and body
// against the fixed table (or a buddy kind's re-rendered template) before it builds a request, so even a future caller
// that bypassed sendGenericPush() could not put other text on the wire.

import { prisma } from '../db/client';
import type { AchievementFamily, StickerKind } from '@prisma/client';
import { checkDisplayName } from '../buddies/identity';

export type PushKind = 'weekly_digest' | 'insight' | 'monthly_recap';
export type BuddyPushKind = 'buddy_sticker' | 'buddy_request' | 'buddy_paired' | 'buddy_badge' | 'dm_message';
export const BUDDY_PUSH_KINDS: readonly BuddyPushKind[] = ['buddy_sticker', 'buddy_request', 'buddy_paired', 'buddy_badge', 'dm_message'];
export type AnyPushKind = PushKind | BuddyPushKind;

export const isBuddyPushKind = (kind: unknown): kind is BuddyPushKind => (BUDDY_PUSH_KINDS as readonly unknown[]).includes(kind);

export interface RecapPushData {
  kind: 'recap';
  recapId: string;
}

/** refId: the actor's user id (sticker, paired, badge, dm_message) or the request id (request). */
export interface BuddyPushData {
  kind: BuddyPushKind;
  refId: string;
}

export type PushData = RecapPushData | BuddyPushData;

export interface BuddyPushSlots {
  buddy_sticker: { name: string; sticker: StickerKind };
  buddy_request: Record<string, never>;
  buddy_paired: { name: string };
  buddy_badge: { name: string; family: AchievementFamily; level: number };
  dm_message: { name: string; preview?: string };
}

export interface GenericPushPayload {
  kind: AnyPushKind;
  title: string;
  body: string;
  /** Id-only (isAllowedPushData): recap kinds may carry recap data, buddy kinds must carry their own. */
  data?: PushData;
  /** Buddy kinds only: the typed slots the sender re-renders the text from. Never put on the wire. */
  slots?: BuddyPushSlots[BuddyPushKind];
}

export const GENERIC_PUSH_PAYLOADS: Readonly<Record<PushKind, Readonly<{ title: string; body: string }>>> = Object.freeze({
  weekly_digest: Object.freeze({ title: 'Your weekly recap is ready', body: 'Open the app to read it.' }),
  insight: Object.freeze({ title: 'You have a new insight', body: 'Open the app to see it.' }),
  monthly_recap: Object.freeze({ title: 'Your monthly recap is ready', body: 'Open the app to see it.' }),
});

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const own = (table: object, key: unknown): boolean => typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key);

/** The data allowlist: exactly { kind: 'recap', recapId: uuid } or { kind: <buddy kind>, refId: uuid }. */
export function isAllowedPushData(data: unknown): data is PushData {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return false;
  const keys = Object.keys(data).sort();
  if (keys.length !== 2 || keys[0] !== 'kind') return false;
  const d = data as Record<string, unknown>;
  if (d.kind === 'recap') return keys[1] === 'recapId' && typeof d.recapId === 'string' && UUID_RE.test(d.recapId);
  if (isBuddyPushKind(d.kind)) return keys[1] === 'refId' && typeof d.refId === 'string' && UUID_RE.test(d.refId);
  return false;
}

export const STICKER_LABELS: Readonly<Record<StickerKind, string>> = Object.freeze({ CHEER: 'Cheer', HEART: 'Heart', REST_UP: 'Rest up', STAR: 'Star' });

/** Family names as the app shows them (mobile src/lib/badges.ts FAMILY_NAMES). */
export const BADGE_FAMILY_LABELS: Readonly<Record<AchievementFamily, string>> = Object.freeze({
  SLEEP_GOAL: 'Sleep goal streak',
  STEADY_BEDTIME: 'Steady bedtime',
  STEP_GOAL: 'Step goal streak',
  CHECK_IN: 'Daily check-in',
  BEST_RECOVERY_WEEK: 'Best recovery week',
  EVERY_DAY_LOGGED: 'Every day logged',
  STEADIEST_MONTH: 'Steadiest month',
});

export const LEVEL_NUMERALS = ['I', 'II', 'III', 'IV', 'V'] as const;

function slotInvalid(): never {
  throw new Error('push_slot_invalid');
}

/** "Sleep goal streak II": a level, never a value. */
export function badgeLabel(family: unknown, level: unknown): string {
  if (!own(BADGE_FAMILY_LABELS, family) || typeof level !== 'number' || !Number.isInteger(level) || level < 1 || level > 5) slotInvalid();
  return `${BADGE_FAMILY_LABELS[family as AchievementFamily]} ${LEVEL_NUMERALS[(level as number) - 1]}`;
}

/**
 * A name that would be saved exactly as it is: checkDisplayName accepts it (1-30 code points, a visible
 * character, no reserved word) and sanitising leaves it unchanged. Names may contain digits: they are
 * user-chosen text, never a health value.
 */
export function isPushName(name: unknown): name is string {
  const check = checkDisplayName(name);
  return check.ok && check.displayName === name;
}

/**
 * A dm_message preview: one trimmed line, no control or format characters, 1-80 code points, or 81 ending in "…".
 * The one exception is what message sanitising keeps inside emoji (text.ts in the chats module): the zero-width joiner and the tag
 * characters of a subdivision flag, so a joined emoji in the text never makes the push fail.
 */
export function isPushPreview(text: unknown): text is string {
  if (typeof text !== 'string' || text.length === 0 || text !== text.trim()) return false;
  if (/(?![\u200D\u{E0020}-\u{E007F}])[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]/u.test(text)) return false;
  const length = [...text].length;
  return length <= 80 || (length === 81 && text.endsWith('…'));
}

const BUDDY_BODIES: Readonly<Record<BuddyPushKind, string>> = Object.freeze({
  buddy_sticker: 'Open the app to send one back.',
  buddy_request: 'Open the app to see who.',
  buddy_paired: 'Open the app to say hi.',
  buddy_badge: 'Open the app to cheer them on.',
  dm_message: 'Open the app to read it.',
});

/** The text of a buddy push from its template and typed slots; any other slot shape throws. */
export function renderBuddyPush<K extends BuddyPushKind>(kind: K, slots: BuddyPushSlots[K]): { title: string; body: string } {
  if (!slots || typeof slots !== 'object' || Array.isArray(slots)) slotInvalid();
  const s = slots as unknown as Record<string, unknown>;
  const keys = Object.keys(s).sort().join(',');
  const name = (): string => {
    const n = s.name;
    return isPushName(n) ? n : slotInvalid();
  };
  const body = BUDDY_BODIES[kind];
  switch (kind as BuddyPushKind) {
    case 'buddy_sticker':
      if (keys !== 'name,sticker' || !own(STICKER_LABELS, s.sticker)) slotInvalid();
      return { title: `${name()} sent you a ${STICKER_LABELS[s.sticker as StickerKind]}`, body };
    case 'buddy_request':
      if (keys !== '') slotInvalid();
      return { title: 'Someone wants to be your buddy', body };
    case 'buddy_paired':
      if (keys !== 'name') slotInvalid();
      return { title: `You and ${name()} are now buddies`, body };
    case 'buddy_badge':
      if (keys !== 'family,level,name') slotInvalid();
      return { title: `${name()} reached ${badgeLabel(s.family, s.level)}`, body };
    case 'dm_message':
      if (keys === 'name') return { title: `${name()} sent you a message`, body };
      if (keys === 'name,preview' && isPushPreview(s.preview)) return { title: name(), body: s.preview };
      return slotInvalid();
    default:
      return slotInvalid();
  }
}

/** The only way to build a buddy payload: rendered text, the slots, and id-only data. */
export function buddyPushPayload<K extends BuddyPushKind>(kind: K, slots: BuddyPushSlots[K], refId: string): GenericPushPayload {
  if (!UUID_RE.test(refId)) throw new Error('push_data_not_allowed');
  return { kind, ...renderBuddyPush(kind, slots), data: { kind, refId }, slots };
}

export const RECAP_PUSH_KIND: Readonly<Record<'WEEK' | 'MONTH', PushKind>> = Object.freeze({ WEEK: 'weekly_digest', MONTH: 'monthly_recap' });
const RECAP_KINDS_WITH_DATA: ReadonlySet<PushKind> = new Set(['weekly_digest', 'monthly_recap']);

export function genericPushPayload(kind: PushKind): GenericPushPayload {
  // Own-property lookup: an unknown kind is a bug, never a fallthrough to some other text.
  if (!Object.prototype.hasOwnProperty.call(GENERIC_PUSH_PAYLOADS, kind)) throw new Error('unknown_push_kind');
  const fixed = GENERIC_PUSH_PAYLOADS[kind];
  return { kind, title: fixed.title, body: fixed.body };
}

export interface PushTarget {
  token: string;
  platform: 'ios' | 'android';
}

export interface PushSender {
  send(targets: PushTarget[], payload: GenericPushPayload): Promise<void>;
}

/** The only sender that ships: delivers nothing. */
export class NoopPushSender implements PushSender {
  async send(): Promise<void> {}
}

/**
 * Sends the generic notification for `kind` to every registered device of the
 * user. Returns how many devices it was handed to (0 when the user has none, in
 * which case the sender is not called at all).
 */
export async function sendGenericPush(sender: PushSender, userId: string, kind: PushKind): Promise<number> {
  const rows = await prisma.pushToken.findMany({ where: { userId }, select: { token: true, platform: true } });
  if (rows.length === 0) return 0;
  await sender.send(
    rows.map((r) => ({ token: r.token, platform: r.platform })),
    genericPushPayload(kind),
  );
  return rows.length;
}

/**
 * The "recap ready" push (spec 2026-10-04 §2). App-level: it does not need the coach, only a
 * registered device and User.recapPushEnabled. Returns how many devices it was handed to.
 */
export async function sendRecapPush(sender: PushSender, userId: string, recapKind: 'WEEK' | 'MONTH', recapId: string): Promise<number> {
  if (!UUID_RE.test(recapId)) throw new Error('push_data_not_allowed');
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { recapPushEnabled: true } });
  if (!user?.recapPushEnabled) return 0;
  const rows = await prisma.pushToken.findMany({ where: { userId }, select: { token: true, platform: true } });
  if (rows.length === 0) return 0;
  await sender.send(
    rows.map((r) => ({ token: r.token, platform: r.platform })),
    { ...genericPushPayload(RECAP_PUSH_KIND[recapKind]), data: { kind: 'recap', recapId } },
  );
  return rows.length;
}

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
export const EXPO_PUSH_CHUNK_SIZE = 100;
const EXPO_REQUEST_TIMEOUT_MS = 15_000;

const EXPO_TOKEN_SHAPE = /^Expo(?:nent)?PushToken\[[^\]\s]+\]$/;

/** True for `ExponentPushToken[...]` and `ExpoPushToken[...]`. */
export function isExpoPushToken(token: string): boolean {
  return EXPO_TOKEN_SHAPE.test(token);
}

/** For logs: keeps the wrapper and the first four characters, e.g. `ExponentPushToken[abcd…]`. A token is a device credential. */
export function maskPushToken(token: string): string {
  const m = /^(Expo(?:nent)?PushToken)\[([^\]]*)\]?$/.exec(token);
  if (m) return `${m[1]}[${m[2]!.slice(0, 4)}…]`;
  return `${token.slice(0, 4)}…`;
}

/** Throws unless the text is exactly what the kind's table entry or template gives, and any data is allowlisted for that kind. */
function assertGenericPayload(payload: GenericPushPayload): void {
  const kind = payload?.kind;
  if (isBuddyPushKind(kind)) {
    let expected: { title: string; body: string };
    try {
      expected = renderBuddyPush(kind, payload.slots as never);
    } catch {
      throw new Error('push_text_not_generic');
    }
    if (payload.title !== expected.title || payload.body !== expected.body) throw new Error('push_text_not_generic');
    if (!isAllowedPushData(payload.data) || payload.data.kind !== kind) throw new Error('push_data_not_allowed');
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(GENERIC_PUSH_PAYLOADS, kind)) throw new Error('push_text_not_generic');
  const fixed = GENERIC_PUSH_PAYLOADS[kind as PushKind];
  if (payload.title !== fixed.title || payload.body !== fixed.body) throw new Error('push_text_not_generic');
  if (
    payload.data !== undefined &&
    (!isAllowedPushData(payload.data) || payload.data.kind !== 'recap' || !RECAP_KINDS_WITH_DATA.has(kind as PushKind))
  ) {
    throw new Error('push_data_not_allowed');
  }
}

/** Logs the event and masked tokens only: never a full token, the access token, a provider message or any health data. */
function logPush(event: string, fields: Record<string, unknown>): void {
  console.error(JSON.stringify({ event, ...fields }));
}

interface ExpoTicket {
  status?: unknown;
  details?: { error?: unknown } | null;
}

export interface ExpoPushSenderOptions {
  /** Test seam; defaults to the global fetch. */
  fetchFn?: typeof fetch;
}

/**
 * Delivers the generic push through the Expo push service. A failed request is
 * logged and skipped (never thrown), so one bad chunk neither loses the other
 * chunks' results nor fails the digest job. The only throw is the refusal of
 * non-generic text or non-allowlisted data, which is a programming error.
 */
export class ExpoPushSender implements PushSender {
  private readonly fetchFn: typeof fetch;

  constructor(options: ExpoPushSenderOptions = {}) {
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
  }

  async send(targets: PushTarget[], payload: GenericPushPayload): Promise<void> {
    assertGenericPayload(payload);
    for (let i = 0; i < targets.length; i += EXPO_PUSH_CHUNK_SIZE) {
      await this.sendChunk(targets.slice(i, i + EXPO_PUSH_CHUNK_SIZE), payload);
    }
  }

  private async sendChunk(chunk: PushTarget[], payload: GenericPushPayload): Promise<void> {
    const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
    const accessToken = process.env.EXPO_ACCESS_TOKEN?.trim();
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const messages = chunk.map((t) => ({
      to: t.token,
      title: payload.title,
      body: payload.body,
      sound: 'default',
      // Rebuilt from the validated fields, never spread; slots never leave the server.
      data: payload.data === undefined
        ? { kind: payload.kind }
        : payload.data.kind === 'recap'
          ? { kind: payload.data.kind, recapId: payload.data.recapId }
          : { kind: payload.data.kind, refId: payload.data.refId },
    }));

    let tickets: ExpoTicket[];
    try {
      const res = await this.fetchFn(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(messages),
        signal: AbortSignal.timeout(EXPO_REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        logPush('coach.push_chunk_failed', { status: res.status, size: chunk.length });
        return;
      }
      const body = (await res.json()) as { data?: unknown } | null;
      if (!body || !Array.isArray(body.data) || body.data.length !== chunk.length) {
        logPush('coach.push_chunk_failed', { reason: 'unexpected_response', size: chunk.length });
        return;
      }
      tickets = body.data as ExpoTicket[];
    } catch (err) {
      // The error class only: a fetch error message can echo request values.
      logPush('coach.push_chunk_failed', { error: err instanceof Error ? err.name : 'unknown', size: chunk.length });
      return;
    }

    const dead: string[] = [];
    tickets.forEach((ticket, i) => {
      if (ticket?.status !== 'error') return;
      const token = chunk[i]!.token;
      const code = typeof ticket.details?.error === 'string' ? ticket.details.error : 'unknown';
      if (code === 'DeviceNotRegistered') dead.push(token);
      else logPush('coach.push_ticket_error', { error: code, token: maskPushToken(token) });
    });
    if (dead.length > 0) {
      try {
        await prisma.pushToken.deleteMany({ where: { token: { in: dead } } });
        logPush('coach.push_token_removed', { count: dead.length, tokens: dead.map(maskPushToken) });
      } catch (err) {
        logPush('coach.push_token_cleanup_failed', { error: err instanceof Error ? err.name : 'unknown', count: dead.length });
      }
    }
  }
}
