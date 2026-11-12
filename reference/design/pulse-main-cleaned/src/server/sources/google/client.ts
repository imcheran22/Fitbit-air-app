// Google Health API v4 client: local-day windows, pagination, a 4 req/s limiter, retries, and the
// raw archive. Pattern from Hælan's api/client.ts, store/rawArchive.ts and sync/windows.ts (AGPL-3.0).
//
// Times are unix seconds and days are local `YYYY-MM-DD`, as in the schema. Errors carry status and
// code only (see oauth.ts), never a token or a body.
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { and, eq, lt } from "drizzle-orm";
import type { Db } from "../../db";
import { rawPayloads } from "../../db/schema";
import { addDays, localDay, localMidnight, wall } from "../../time";
import { DATA_TYPES, type DataType, type DataTypeId, type FilterMember } from "./catalogue";
import { errorCode, FETCH_TIMEOUT_MS, getAccessToken, GoogleError, markRevoked, parseJson } from "./oauth";

const API = "https://health.googleapis.com/v4/users/me/dataTypes";
const DEVICES_API = "https://health.googleapis.com/v4/users/me/pairedDevices";
const MIN_GAP_MS = 250; // 4 req/s, under the documented 5 QPS per user
const MAX_TRIES = 5; // per request, for 429, 5xx and network failures
const BACKOFF_MS = 1000;
// Longest Retry-After waited out inside a run. A longer one fails the job now; the next run (15 min) tries again,
// so a quota hit can't hold one run for hours (5 tries x many requests x a long wait).
const MAX_WAIT_MS = 60_000;
const MAX_PAGES = 1000; // a nextPageToken that never advances must not loop forever
/** Longest dailyRollUp range: every roll-up-only type uses 14 days (Hælan's probe); a daily type's 90-day list window is not assumed. */
const ROLLUP_MAX_DAYS = 14;

// --- Local days ---------------------------------------------------------------------------------

/** The first local midnight at or after `s`. */
function ceilMidnight(s: number, tz: string): number {
  const m = localMidnight(localDay(s, tz), tz);
  return m >= s ? m : localMidnight(addDays(localDay(s, tz), 1), tz);
}

export type TimeWindow = { start: number; end: number };

/** Splits [from, to) at local midnights into windows of at most `maxDays` local days, with no gap or overlap. */
export function localWindows(from: number, to: number, maxDays: number, tz: string): TimeWindow[] {
  const out: TimeWindow[] = [];
  let day = localDay(from, tz);
  for (let start = from; start < to; ) {
    day = addDays(day, maxDays);
    const end = Math.min(to, localMidnight(day, tz));
    if (end <= start) continue; // only in a zone whose midnight falls in a DST gap
    out.push({ start, end });
    start = end;
  }
  return out;
}

const civilDate = (day: string) => {
  const [year, month, d] = day.split("-").map(Number);
  return { date: { year, month, day: d } };
};

/** `<snake_type>.<member> >= X AND < Y`. Civil members are written in `tz`; `date` rounds the end up to a whole day. */
export function buildFilter(type: DataTypeId, member: FilterMember, w: TimeWindow, tz: string): string {
  const field = `${type.replaceAll("-", "_")}.${member}`;
  const [lo, hi] =
    member === "date"
      ? [localDay(w.start, tz), localDay(ceilMidnight(w.end, tz), tz)]
      : member === "interval.civil_start_time"
        ? [w.start, w.end].map((s) => {
            const { day, time } = wall(s, tz);
            return `${day}T${time}`;
          })
        : [w.start, w.end].map((s) => new Date(s * 1000).toISOString());
  // "Only filtering by start time is supported for ECG", and only with >= (dataPoints.list reference).
  if (type === "electrocardiogram") return `${field} >= "${lo}"`;
  return `${field} >= "${lo}" AND ${field} < "${hi}"`;
}

// --- Raw archive --------------------------------------------------------------------------------

/**
 * Stores a page gzipped, keyed by (user, type, range, sha256 of the body). Re-storing an unchanged page is a
 * no-op. Returns true when a row was inserted.
 */
export async function archivePage(
  db: Db,
  userId: number,
  p: { type: string; rangeStart: number; rangeEnd: number; body: string; fetchedAt: number },
): Promise<boolean> {
  const bodyHash = createHash("sha256").update(p.body).digest("hex");
  const ins = await db
    .insert(rawPayloads)
    .values({
      userId,
      type: p.type,
      rangeStart: p.rangeStart,
      rangeEnd: p.rangeEnd,
      bodyHash,
      gzBody: gzipSync(p.body),
      fetchedAt: p.fetchedAt,
    })
    .onConflictDoNothing()
    .returning({ id: rawPayloads.id });
  return ins.length > 0;
}

// --- Paired devices -----------------------------------------------------------------------------

export type DeviceCheck = "some" | "none" | "unknown";

/**
 * A `pairedDevices.list` body as "some", "none" or "unknown". The documented shape is
 * `{ pairedDevices: [...], nextPageToken? }`, and proto3 JSON drops an empty list, so `{}` is "none".
 * Anything else (not an object, `pairedDevices` not an array, fields we don't know) is "unknown",
 * never "none": a shape change must not tell a person their band is missing.
 */
export function parsePairedDevices(body: string): DeviceCheck {
  const j = parseJson(body);
  if (typeof j !== "object" || j === null || Array.isArray(j)) return "unknown";
  const { pairedDevices: list = [], ...rest } = j as Record<string, unknown>;
  if (!Array.isArray(list)) return "unknown";
  if (list.length) return "some";
  return Object.keys(rest).length ? "unknown" : "none";
}

/**
 * Raw pages are evidence for schema drift and the input for re-mapping recent data, not a backup:
 * 7 days covers the 3-day re-fetch overlap and a recent mapper fix, and bounds the table at a week of fetches
 * (at 30 it was half the database). Autovacuum reclaims the space for later inserts.
 */
export const RAW_RETENTION_DAYS = 7;

/** Intraday types are not archived: a day of heart rate is ~8 pages, the bulk of the archive, and their samples are kept as-is. */
const UNARCHIVED = new Set<string>(["heart-rate", "steps"]);

/** Deletes the user's archived pages fetched more than RAW_RETENTION_DAYS before `nowS` (unix seconds). Returns the count. */
export async function pruneRawPayloads(db: Db, userId: number, nowS: number): Promise<number> {
  const gone = await db
    .delete(rawPayloads)
    .where(and(eq(rawPayloads.userId, userId), lt(rawPayloads.fetchedAt, nowS - RAW_RETENTION_DAYS * 86_400)))
    .returning({ id: rawPayloads.id });
  return gone.length;
}

// --- Client -------------------------------------------------------------------------------------

export type ClientDeps = {
  db: Db;
  /** Whose grant the requests use and whose archive the pages land in. */
  userId: number;
  google: { clientId: string; clientSecret: string };
  timeZone: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Milliseconds. */
  now?: () => number;
  /** Attempts per request for 429, 5xx and network failures. 1: fail fast, no waiting (the live heart-rate pull). */
  maxTries?: number;
};

/** Create one per sync run: the 4 req/s limiter lives in the instance. */
export function createGoogleClient({
  db,
  userId,
  google,
  timeZone: tz,
  fetch: fetchFn = fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  now = Date.now,
  maxTries = MAX_TRIES,
}: ClientDeps) {
  let nextSlot = 0;
  async function throttle() {
    const t = now();
    const wait = Math.max(0, nextSlot - t);
    nextSlot = Math.max(t, nextSlot) + MIN_GAP_MS;
    if (wait) await sleep(wait);
  }

  function retryAfterMs(header: string | null): number | undefined {
    if (!header) return undefined;
    const ms = /^\d+$/.test(header.trim()) ? Number(header) * 1000 : Date.parse(header) - now();
    return Number.isNaN(ms) ? undefined : ms;
  }

  /** The 200 body. One forced refresh on 401, then `auth_revoked`; 429 waits Retry-After; 5xx backs off. `once`: a write that is not safe to repeat, so only 429 (never processed) is retried. */
  async function request(url: string, where: string, body?: string, once = false): Promise<string> {
    let tries = 0; // failed attempts that may be retried: 429, 5xx, network
    let refreshed = false;
    let force = false; // set for the one attempt right after a 401
    for (;;) {
      const token = await getAccessToken(db, userId, google, { fetch: fetchFn, now, force });
      force = false;
      await throttle();
      let res: Response;
      try {
        res = await fetchFn(url, {
          method: body ? "POST" : "GET",
          headers: { authorization: `Bearer ${token}`, ...(body && { "content-type": "application/json" }) },
          body,
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        // Inside the try: a body cut off mid-read is a network failure too.
        if (res.ok) return await res.text();
      } catch {
        if (once || ++tries >= maxTries) throw new GoogleError("network", undefined, where);
        await sleep(BACKOFF_MS * 2 ** (tries - 1));
        continue;
      }
      const { status } = res;
      if (status === 401) {
        await res.body?.cancel();
        if (refreshed) {
          await markRevoked(db, userId, now());
          throw new GoogleError("auth_revoked", status, where);
        }
        refreshed = force = true;
        continue;
      }
      if ((status === 429 || (status >= 500 && !once)) && ++tries < maxTries) {
        const after = status === 429 ? retryAfterMs(res.headers.get("retry-after")) : undefined;
        if (after !== undefined && after > MAX_WAIT_MS) throw new GoogleError(errorCode(parseJson(await res.text())) ?? "http_429", status, where);
        await res.body?.cancel();
        await sleep(Math.min(MAX_WAIT_MS, Math.max(0, after ?? BACKOFF_MS * 2 ** (tries - 1))));
        continue;
      }
      throw new GoogleError(errorCode(parseJson(await res.text())) ?? `http_${status}`, status, where);
    }
  }

  /** Parses a 200 body; one that is not the expected envelope is an error, never "no data". */
  function readPage(body: string, key: string, where: string): { points: unknown[]; next?: string } {
    const j = parseJson(body);
    if (typeof j !== "object" || j === null) throw new GoogleError("bad_response", 200, where);
    const { [key]: pts = [], nextPageToken: next } = j as Record<string, unknown>;
    if (!Array.isArray(pts)) throw new GoogleError("bad_response", 200, where);
    return { points: pts, next: typeof next === "string" && next ? next : undefined };
  }

  const fetchedAt = () => Math.floor(now() / 1000);

  /**
   * A write's `Operation`. Google answers create and batchDelete with `{ done: true, response: DataPoint }`
   * (docs/research/google-health-coverage.md). There is no operations.get to poll, so an unfinished one is
   * returned as is. A failed one throws its error code.
   */
  function readOperation(body: string, where: string): { done: boolean; response?: Record<string, unknown> } {
    const op = parseJson(body);
    if (typeof op !== "object" || op === null) throw new GoogleError("bad_response", 200, where);
    const { done, error, response } = op as Record<string, unknown>;
    if (error) throw new GoogleError(errorCode({ error }) ?? "operation_failed", 200, where);
    return { done: done === true, response: typeof response === "object" && response !== null ? (response as Record<string, unknown>) : undefined };
  }

  /**
   * Every data point of `type` in [from, to), one page at a time to `onPage`, split into local-day windows of at most
   * the type's `maxDays`, every page archived (except intraday types). A page is dropped once `onPage` returns, so a
   * caller that keeps only what it maps holds one page of raw points (5,000) at most.
   */
  async function listEach(type: DataTypeId, from: number, to: number, onPage: (points: unknown[]) => void): Promise<void> {
    const t: DataType = DATA_TYPES[type];
    if (!t.member) throw new GoogleError("unsupported_action", undefined, `${type} list`);
    for (const w of localWindows(from, to, t.maxDays, tz)) {
      const filter = buildFilter(type, t.member, w, tz);
      // The archive range is the window's whole local days, so a re-fetch of a partial day keeps
      // the same key and an unchanged body dedupes. Exact times are inside the body.
      const range = { rangeStart: localMidnight(localDay(w.start, tz), tz), rangeEnd: ceilMidnight(w.end, tz) };
      let pageToken: string | undefined;
      let pages = 0;
      do {
        if (++pages > MAX_PAGES) throw new GoogleError("too_many_pages", undefined, type);
        const q = new URLSearchParams({ filter, pageSize: String(t.pageSize), ...(pageToken && { pageToken }) });
        const body = await request(`${API}/${type}/dataPoints?${q}`, type);
        // Before parsing: a changed shape is kept as evidence.
        if (!UNARCHIVED.has(type)) await archivePage(db, userId, { type, ...range, body, fetchedAt: fetchedAt() });
        const page = readPage(body, "dataPoints", type);
        onPage(page.points);
        pageToken = page.next;
      } while (pageToken);
    }
  }

  return {
    /** Whether the account has a paired device (`users.pairedDevices.list`, one page). Not archived: it is not health data. */
    async pairedDevices(): Promise<DeviceCheck> {
      return parsePairedDevices(await request(`${DEVICES_API}?pageSize=1`, "pairedDevices"));
    },

    listEach,

    /** Every data point of `type` in [from, to), in API order. Memory holds the whole range; dense types use `listEach`. */
    async list(type: DataTypeId, from: number, to: number): Promise<unknown[]> {
      const out: unknown[] = [];
      await listEach(type, from, to, (points) => void out.push(...points));
      return out;
    },

    /**
     * `dataPoints.create`: writes one data point (`{ moods: {...} }`, `{ hydrationLog: {...} }`, ...) and returns its
     * name (`users/{id}/dataTypes/{type}/dataPoints/{id}`), or null when Google has not finished the write.
     * Needs the type's write scope; an older grant answers 403.
     */
    async create(type: string, point: Record<string, unknown>): Promise<string | null> {
      const where = `${type} create`;
      const op = readOperation(await request(`${API}/${type}/dataPoints`, where, JSON.stringify(point), true), where);
      const name = op.response?.name;
      return op.done && typeof name === "string" && name ? name : null;
    },

    /**
     * `dataPoints.batchDelete` for names `create` returned. The parent is `users/me`, and a name must share the
     * parent, so the user id Google put in it is swapped for `me` (the form Google's own delete example uses).
     */
    async batchDelete(type: string, names: string[]): Promise<void> {
      const where = `${type} batchDelete`;
      const body = JSON.stringify({ names: names.map((n) => n.replace(/^users\/[^/]+\//, "users/me/")) });
      readOperation(await request(`${API}/${type}/dataPoints:batchDelete`, where, body), where);
    },

    /**
     * Whether Google still has a data point (`dataPoints.get`, which the write-only scopes allow too). Only a 404 is
     * "no"; any other error throws. The body is health data and is neither kept nor logged.
     */
    async exists(type: string, name: string): Promise<boolean> {
      const id = encodeURIComponent(name.slice(name.lastIndexOf("/") + 1));
      try {
        await request(`${API}/${type}/dataPoints/${id}`, `${type} get`);
        return true;
      } catch (err) {
        if (err instanceof GoogleError && err.status === 404) return false;
        throw err;
      }
    },

    /**
     * `rollupDataPoints` for civil days [fromDay, toDay) (exclusive end), in ranges of at most the
     * type's `maxDays` (and ROLLUP_MAX_DAYS). One POST per range: rollups do not paginate. Days with no data are omitted.
     */
    async dailyRollUp(type: DataTypeId, fromDay: string, toDay: string): Promise<unknown[]> {
      const t: DataType = DATA_TYPES[type];
      if (!t.dailyRollUp) throw new GoogleError("unsupported_action", undefined, `${type} dailyRollUp`);
      const out: unknown[] = [];
      for (let day = fromDay; day < toDay; ) {
        const step = Math.min(t.maxDays, ROLLUP_MAX_DAYS); // a daily type's list window is longer
        const end = addDays(day, step) < toDay ? addDays(day, step) : toDay;
        const req = JSON.stringify({ range: { start: civilDate(day), end: civilDate(end) } });
        const body = await request(`${API}/${type}/dataPoints:dailyRollUp`, `${type} dailyRollUp`, req);
        await archivePage(db, userId, {
          type,
          rangeStart: localMidnight(day, tz),
          rangeEnd: localMidnight(end, tz),
          body,
          fetchedAt: fetchedAt(),
        });
        out.push(...readPage(body, "rollupDataPoints", `${type} dailyRollUp`).points);
        day = end;
      }
      return out;
    },
  };
}

export type GoogleClient = ReturnType<typeof createGoogleClient>;
