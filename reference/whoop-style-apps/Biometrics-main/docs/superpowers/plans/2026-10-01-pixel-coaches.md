# Pixel Coaches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the eight vector companions with 15 symmetrical pixel-art coaches, a grid + card-sheet picker, and two user settings (thinking attachment, thinking text) backed by real progress steps from the answer pipeline.

**Architecture:** Each coach is data: a 12-column left half plus a palette. A pure TypeScript compositor narrows, mirrors, shades and outlines it into a 24×24 colour grid for a given eye mode. Skia draws that grid as a cached `Picture` at whole-device-pixel scales. The backend gets a v4 persona set (Mochi default), a data migration clearing retired ids, two nullable thinking-setting columns, and route-specific `status` step events.

**Tech Stack:** Expo 57 / React Native, `@shopify/react-native-skia` 2.6.2 (`createPicture`), `react-native-reanimated` 4.5.1, NativeWind, Jest + RNTL. Backend: Express, Prisma/Postgres, Jest (ESM, `--experimental-vm-modules`).

**Spec:** `docs/superpowers/specs/2026-10-01-pixel-coaches-design.md`. Mockups and the sprite source of truth: `docs/design/pixel-coaches/` (`cast.js`, `04-thinking-attachments.html`).

## Global Constraints

- Coach ids, in picker order: `mochi, boba, sprout, avo, peep, bun, kit, axo, boo, cap, jelly, pengu, luna, gloop, bao`.
- Default coach: `mochi` (mobile `DEFAULT_CHARACTER_ID`, backend `defaultPersonaId`, Skip, signed-out screens).
- Retired ids: `hoot, pip, nimbus, ember, beep, doze, beat`.
- Widths: original (`slim: 0`) for luna, mochi, boba, jelly; slimmest (`slim: 2`) for sprout; slimmer (`slim: 1`) for all others.
- Finish: soft outline. The outline colour is `darken(palette.s ?? palette.b, 0.6)`. Never outline the letters `x`, `z`, `t`.
- Attachment ids: `bulb` (default), `cloud`, `typing`, `hourglass`, `gears`, `question`, `sparkles`, `clock`, `spinner`.
- Thinking-text ids: `lines`, `placeholder`, `tag`, `typewriter`, `nameplate`, `steps` (default), `shimmer`, `bouncy`, `dialog`, `strip`.
- Step ids: `route`, `facts`, `write`. Labels per route are exactly those in spec §5.
- Persona versions: add `v4.ts`; never edit `v1.ts`, `v2.ts` or `v3.ts`.
- No `Co-Authored-By` trailers or Claude mentions in commits or the PR (owner rule).
- Run mobile commands from `mobile/` with Node 24 (`export PATH=~/.nvm/versions/node/v24.21.0/bin:$PATH`).
- Backend tests: `TEST_DATABASE_URL=… DATABASE_URL=$TEST_DATABASE_URL NODE_OPTIONS=--experimental-vm-modules npx jest --forceExit <path>`. Never while a live backend is running (they share Redis).

## Review Focus

1. **A user whose stored id is retired, on an old app build.** The server returns `personaId: 'mochi'`, which old builds know. The status payload must never contain a retired id. Test: the status route with a stored `'hoot'` row returns `personaId: 'mochi'` and `personaChosen: false` (Task 3).
2. **Thinking settings on a server that predates them.** The status payload has no `thinkingAttachment` or `thinkingText`, so the app must fall back to `bulb` / `steps` and never crash or show `undefined`. Test in Task 11.
3. **An answer stream with no `step` field** (an older server) **or one that skips a step** (an error after `route`). The steps style must show what it has, never a blank row. Test in Task 12.
4. **Sizes that don't divide evenly** (18, 20, 52 pt at 2× and 3×). The sprite must stay centred with integer cells and never draw outside its slot. Test in Task 7.
5. **Reduce Motion on.** Attachments and bobbing freeze on a still frame, but mood eyes still show (thinking = eyes up, resting = shut). Test in Task 9.

---

## File map

**Backend**
- Create `backend/src/coach/personas/v4.ts`: the 15 personas.
- Modify `backend/src/coach/personas/index.ts`: register v4, live = v4.
- Create `backend/prisma/migrations/20261001130000_pixel_coaches/migration.sql`: the new columns and the clearing of retired ids.
- Modify `backend/prisma/schema.prisma`: `coachThinkingAttachment`, `coachThinkingText`.
- Create `backend/src/coach/thinking.ts`: id lists, defaults and validation.
- Modify `backend/src/coach/routes.ts`: status payload fields; `PUT /me/coach/thinking`.
- Modify `backend/src/coach/answer/pipeline.ts`: `STEP_LABELS`, `step` on status events.
- Modify `backend/evals/coach/fixtures/voice.ts`, `backend/evals/coach/types.ts`: new coaches.
- Tests: `tests/coach/personas.test.ts`, `tests/db/pixelCoaches.test.ts` (new), `tests/coach/routes.test.ts`, `tests/coach/answerPipeline.test.ts`, plus id updates in the files listed in Task 5.

**Mobile**
- Create `mobile/scripts/port-sprites.mjs`: generates the sprite data from `docs/design/pixel-coaches/cast.js`.
- Create `mobile/src/components/characters/sprites/data.ts` (generated), `sprites/compose.ts`, `sprites/scale.ts`.
- Create `mobile/src/components/characters/attachments/frames.ts`.
- Modify `mobile/src/components/characters/types.ts`, `registry.ts`, `Character.tsx`, `CharacterCanvas.tsx`.
- Delete `mobile/src/components/characters/art/*`, `engine/MoodLayers.tsx`, `engine/useMoodLayer.ts` (plus `engine/useLoop.ts`, `engine/keyframes.ts` and their tests once nothing imports them).
- Create `mobile/src/components/characters/CoachCard.tsx`.
- Create `mobile/src/components/coach/thinking/*.tsx`: the 10 text styles and `ThinkingRow.tsx`.
- Modify `mobile/src/api/coach.ts`, `mobile/src/characters/*`, `mobile/src/lib/useCoachConversation.ts`.
- Modify `mobile/src/screens/MeetYourCoachScreen.tsx`, `CoachScreen.tsx`, `SettingsScreen.tsx`, `dev/CharacterGalleryScreen.tsx`.
- Create `mobile/src/screens/ThinkingStyleScreen.tsx`, `ThinkingTextScreen.tsx`.
- Modify `mobile/src/navigation/RootNavigator.tsx`.
- Modify `mobile/jest-mocks/CharacterCanvas.js`, `jest-mocks/characterContext.tsx`.
- Add `mobile/assets/fonts/Silkscreen-Regular.ttf`.

---

## Part 1: Backend

### Task 1: v4 personas (15 coaches, Mochi default)

**Files:**
- Create: `backend/src/coach/personas/v4.ts`
- Modify: `backend/src/coach/personas/index.ts`
- Test: `backend/tests/coach/personas.test.ts`

**Interfaces:**
- Produces: `v4Personas: PersonaSet` (`version: 'v4'`, `defaultPersonaId: 'mochi'`), `V4_IDS: readonly string[]`, `LIVE_PERSONA_VERSION = 'v4'`. `listPersonas()`, `findPersona()` and `resolvePersona()` are unchanged in signature.

- [ ] **Step 1: Write the failing test.** Add to `backend/tests/coach/personas.test.ts` (replace the existing live-set assertions that list the 8 ids):

```ts
import { DEFAULT_PERSONA_ID, findPersona, listPersonas, resolvePersona, LIVE_PERSONA_VERSION, PERSONA_SETS } from '../../src/coach/personas';

const V4 = ['mochi', 'boba', 'sprout', 'avo', 'peep', 'bun', 'kit', 'axo', 'boo', 'cap', 'jelly', 'pengu', 'luna', 'gloop', 'bao'];
const RETIRED = ['hoot', 'pip', 'nimbus', 'ember', 'beep', 'doze', 'beat'];

describe('v4 personas', () => {
  it('is live, lists the 15 coaches in picker order and defaults to Mochi', () => {
    expect(LIVE_PERSONA_VERSION).toBe('v4');
    expect(listPersonas().map((p) => p.id)).toEqual(V4);
    expect(DEFAULT_PERSONA_ID).toBe('mochi');
  });

  it('keeps Mochi exactly as v3 had it', () => {
    const v3Mochi = PERSONA_SETS.v3!.personas.find((p) => p.id === 'mochi');
    expect(findPersona('mochi')).toEqual(v3Mochi);
  });

  it('treats retired characters and v1 styles as unknown, resolving them to Mochi', () => {
    for (const id of [...RETIRED, 'encouraging', 'direct', 'clinical']) {
      expect(findPersona(id)).toBeUndefined();
      expect(resolvePersona(id).id).toBe('mochi');
    }
  });

  it('gives every coach copy, the shared safety list and threshold-triggered recaps', () => {
    const shared = listPersonas()[0]!.disallowedTopics;
    for (const p of listPersonas()) {
      expect(p.tagline && p.greeting && p.tone && p.focus).toBeTruthy();
      expect(p.disallowedTopics).toEqual(shared);
      expect(p.proactivity).toBe('threshold-triggered');
      // Greetings never state a number about the user.
      expect(p.greeting).not.toMatch(/\d/);
    }
  });

  it('leaves older sets registered and unchanged', () => {
    expect(PERSONA_SETS.v3!.defaultPersonaId).toBe('hoot');
    expect(PERSONA_SETS.v3!.personas).toHaveLength(8);
  });
});
```

- [ ] **Step 2: Run it and check that it fails.**
Run: `cd backend && NODE_OPTIONS=--experimental-vm-modules npx jest tests/coach/personas.test.ts`
Expected: FAIL, because `LIVE_PERSONA_VERSION` is `'v3'`.

- [ ] **Step 3: Implement `v4.ts`.**

```ts
// Persona set v4 (spec 2026-10-01 §6): the pixel coaches. Mochi is carried over
// from v3 unchanged; the other 14 are new, and v3's other seven are retired (a
// stored retired id resolves to the default, and the 20261001130000 migration
// clears them so those users meet the new picker). v1–v3 stay registered and unedited.

import type { CharacterPersona, PersonaSet } from './types';
import { REQUIRED_DISALLOWED_TOPICS } from './types';
import { v3Characters } from './v3';

const DISALLOWED_TOPICS = [...REQUIRED_DISALLOWED_TOPICS, 'supplement recommendations'];

function coach(p: Omit<CharacterPersona, 'proactivity' | 'disallowedTopics'>): CharacterPersona {
  return { ...p, proactivity: 'threshold-triggered', disallowedTopics: [...DISALLOWED_TOPICS] };
}

const mochi = v3Characters.find((p) => p.id === 'mochi')!;

export const v4Characters: CharacterPersona[] = [
  { ...mochi, disallowedTopics: [...mochi.disallowedTopics] },
  coach({ id: 'boba', name: 'Boba', tone: 'Bubbly and upbeat. Short, bright sentences; treat habits like little treats.', focus: 'Daily habits and hydration.', tagline: 'Bubbly and upbeat. Keeps your daily habits topped up.', greeting: "Sip check! Want to see today's habits?", verbosity: 'terse' }),
  coach({ id: 'sprout', name: 'Sprout', tone: 'Warm and patient. Point to progress over weeks; small steady steps beat big jumps.', focus: 'Long-term progress.', tagline: 'Celebrates small, steady growth, week after week.', greeting: "Look how far you've come. Want to see this month?", verbosity: 'normal' }),
  coach({ id: 'avo', name: 'Avo', tone: 'Calm and practical, quietly nerdy about fuel and energy.', focus: 'Energy through the day.', tagline: 'Calm, and quietly obsessed with what fuels you.', greeting: 'Want to look at where your energy went today?', verbosity: 'normal' }),
  coach({ id: 'peep', name: 'Peep', tone: 'A tiny, loud cheerleader. Very short; celebrate every win.', focus: 'Motivation and showing up.', tagline: 'Tiny, loud, and your biggest cheerleader.', greeting: "You showed up! That's already a win. What's next?", verbosity: 'terse' }),
  coach({ id: 'bun', name: 'Bun', tone: 'Gentle and unhurried. Rest days are part of training.', focus: 'Rest days and pacing.', tagline: 'Gentle. A big believer in taking it easy.', greeting: 'Shall we plan a softer day?', verbosity: 'terse' }),
  coach({ id: 'kit', name: 'Kit', tone: 'Dry, affectionate wit, never mean. Teases about bedtime, then helps.', focus: 'Bedtime and sleep schedule.', tagline: 'Dry wit. Gently judges your bedtime.', greeting: "Oh, you're up. Want to talk about last night?", verbosity: 'terse' }),
  coach({ id: 'axo', name: 'Axo', tone: 'Endlessly cheerful and resilient. Frame dips as part of bouncing back.', focus: 'Recovery.', tagline: 'Endlessly cheerful, all about bouncing back.', greeting: 'Want to see how your recovery is doing?', verbosity: 'normal' }),
  coach({ id: 'boo', name: 'Boo', tone: 'Quiet and kind, a late-night friend. Low-key, calming.', focus: 'Wind-down and late nights.', tagline: "Quiet and kind. Shows up when it's late.", greeting: "Still up? Let's wind down together.", verbosity: 'terse' }),
  coach({ id: 'cap', name: 'Cap', tone: 'Grounded with a touch of whimsy. Looks for balance across the week.', focus: 'Stress and balance.', tagline: 'Grounded, with a little whimsy.', greeting: 'Want to find a calmer rhythm this week?', verbosity: 'normal' }),
  coach({ id: 'jelly', name: 'Jelly', tone: 'Floaty and chill. Slow pace; suggests a breath before advice.', focus: 'Breathing and calm.', tagline: 'Floaty and chill. Loves a breathing break.', greeting: "Breathe in… and out. What's on your mind?", verbosity: 'terse' }),
  coach({ id: 'pengu', name: 'Pengu', tone: 'Steady and dependable. Consistency over intensity; streaks matter.', focus: 'Consistency and streaks.', tagline: 'Steady over flashy, one waddle at a time.', greeting: 'Want to see how your streak is going?', verbosity: 'normal' }),
  coach({ id: 'luna', name: 'Luna', tone: 'Dreamy and soothing. Sleep first; explains nights clearly.', focus: 'Sleep.', tagline: 'Sleepy moon. Your sleep coach, obviously.', greeting: "Mmm, hi. Want to talk about last night's sleep?", verbosity: 'normal' }),
  coach({ id: 'gloop', name: 'Gloop', tone: 'Bouncy and playful. Turns movement into a game; light energy.', focus: 'Workouts and movement.', tagline: 'Bouncy. Turns every workout into play.', greeting: 'Boing! Ready to move a little today?', verbosity: 'terse' }),
  coach({ id: 'bao', name: 'Bao', tone: 'Big-hearted and relaxed. Gentle movement, stretching, no guilt about snacks.', focus: 'Gentle movement and stretching.', tagline: 'Big-hearted, into snacks and stretches.', greeting: "Time for a stretch? I'll do it with you.", verbosity: 'normal' }),
];

export const V4_IDS = v4Characters.map((p) => p.id);

export const v4Personas: PersonaSet = { version: 'v4', defaultPersonaId: 'mochi', personas: v4Characters };
```

If `CharacterPersona` requires other fields (check `types.ts`), add them inside `coach()`. `mochi` keeps v3's copy. The spec's Mochi tagline matches v3's ("Soft and gentle. Rest is never something to feel bad about."), so nothing changes there.

- [ ] **Step 4: Register it.** In `index.ts`, add `import { v4Personas } from './v4';`, add `[v4Personas.version]: v4Personas,` to `PERSONA_SETS`, and set `export const LIVE_PERSONA_VERSION = 'v4';`. Leave `canonicalPersonaId` alone: the v1 ids map to `pip`, `hoot` and `beep`, which v4 doesn't know, so `findPersona` returns `undefined` and `resolvePersona` returns Mochi. That is the spec's intent, and the test above checks it.

- [ ] **Step 5: Run the test.** Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add backend/src/coach/personas backend/tests/coach/personas.test.ts
git commit -m "feat(backend): v4 personas for the 15 pixel coaches, Mochi default"
```

### Task 2: Migration: thinking columns, clear retired ids

**Files:**
- Modify: `backend/prisma/schema.prisma` (User model, next to `coachPersonaId`, line ~58)
- Create: `backend/prisma/migrations/20261001130000_pixel_coaches/migration.sql`
- Test: `backend/tests/db/pixelCoaches.test.ts`

**Interfaces:**
- Produces: `User.coachThinkingAttachment String?` and `User.coachThinkingText String?` (null = default).

- [ ] **Step 1: Write the failing test** `backend/tests/db/pixelCoaches.test.ts`. It runs only the UPDATE statement, because the columns come from `migrateTestDb()`:

```ts
import { readFileSync } from 'fs';
import path from 'path';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { createUser } from '../coach/helpers';

const NAME = '20261001130000_pixel_coaches';
const SQL = readFileSync(path.join(__dirname, `../../prisma/migrations/${NAME}/migration.sql`), 'utf8');
const UPDATE = SQL.split(';').map((s) => s.replace(/^\s*--.*$/gm, '').trim()).find((s) => s.startsWith('UPDATE'))!;

async function userWith(id: string | null) {
  const u = await createUser();
  if (id !== null) await prisma.user.update({ where: { id: u.id }, data: { coachPersonaId: id } });
  return u.id;
}

beforeAll(() => migrateTestDb());
afterAll(() => prisma.$disconnect());

describe(NAME, () => {
  it('clears every retired character and leaves Mochi, null and unknown rows alone', async () => {
    const retired = await Promise.all(['hoot', 'pip', 'nimbus', 'ember', 'beep', 'doze', 'beat'].map(userWith));
    const kept = { mochi: await userWith('mochi'), none: await userWith(null) };
    await prisma.$executeRawUnsafe(UPDATE);
    const rows = await prisma.user.findMany({ where: { id: { in: [...retired, kept.mochi, kept.none] } }, select: { id: true, coachPersonaId: true } });
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.coachPersonaId]));
    for (const id of retired) expect(byId[id]).toBeNull();
    expect(byId[kept.mochi]).toBe('mochi');
    expect(byId[kept.none]).toBeNull();
  });

  it('adds nullable thinking columns that default to null', async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: await userWith(null) }, select: { coachThinkingAttachment: true, coachThinkingText: true } });
    expect(u).toEqual({ coachThinkingAttachment: null, coachThinkingText: null });
  });
});
```

- [ ] **Step 2: Run it and check that it fails.** Expected: FAIL, because the migration file is missing.

- [ ] **Step 3: Add the schema fields** under `coachPersonaId String?`:

```prisma
  /// Thinking attachment shown next to the coach while it works; null = default ('bulb').
  coachThinkingAttachment String?
  /// How the chat shows a reply is on its way; null = default ('steps').
  coachThinkingText       String?
```

- [ ] **Step 4: Write the migration.**

```sql
-- Pixel coaches (spec 2026-10-01 §7–8).
-- Two nullable settings; null means the default.
ALTER TABLE "User" ADD COLUMN "coachThinkingAttachment" TEXT;
ALTER TABLE "User" ADD COLUMN "coachThinkingText" TEXT;

-- The seven retired characters are cleared, so personaChosen is false and the
-- app shows the new picker once. Mochi carries over; NULL stays NULL.
UPDATE "User" SET "coachPersonaId" = NULL
WHERE "coachPersonaId" IN ('hoot', 'pip', 'nimbus', 'ember', 'beep', 'doze', 'beat');
```

- [ ] **Step 5: Regenerate and run.** Run `npx prisma generate`, then the test. Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add backend/prisma backend/tests/db/pixelCoaches.test.ts
git commit -m "feat(backend): thinking setting columns; clear retired coach choices"
```

### Task 3: Thinking settings API

**Files:**
- Create: `backend/src/coach/thinking.ts`
- Modify: `backend/src/coach/routes.ts` (status handler ~172–210; add a route after `PUT /me/coach/persona` ~359)
- Test: `backend/tests/coach/routes.test.ts`

**Interfaces:**
- Produces: `THINKING_ATTACHMENTS`, `THINKING_TEXTS` (readonly tuples), `DEFAULT_THINKING_ATTACHMENT = 'bulb'`, `DEFAULT_THINKING_TEXT = 'steps'`, `resolveThinkingAttachment(v: string|null|undefined): string`, `resolveThinkingText(v): string`. The status JSON gains `thinkingAttachment: string` and `thinkingText: string`. `PUT /me/coach/thinking` takes `{ attachment?: string, text?: string }` and returns `{ thinkingAttachment, thinkingText }`, or 400 `{ error: 'unknown_thinking_style' }`.

- [ ] **Step 1: Write the failing tests** in `routes.test.ts`, using the file's existing `request(app)` and `createUser`/auth helpers (follow the existing `PUT /me/coach/persona` tests there):

```ts
describe('thinking settings', () => {
  it('returns the defaults in the status until the user picks', async () => {
    const res = await authed(request(app).get('/me/coach/status'));
    expect(res.body).toMatchObject({ thinkingAttachment: 'bulb', thinkingText: 'steps' });
  });

  it('saves either setting on its own and reports both', async () => {
    let res = await authed(request(app).put('/me/coach/thinking').send({ attachment: 'gears' }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ thinkingAttachment: 'gears', thinkingText: 'steps' });
    res = await authed(request(app).put('/me/coach/thinking').send({ text: 'dialog' }));
    expect(res.body).toEqual({ thinkingAttachment: 'gears', thinkingText: 'dialog' });
    res = await authed(request(app).get('/me/coach/status'));
    expect(res.body).toMatchObject({ thinkingAttachment: 'gears', thinkingText: 'dialog' });
  });

  it.each([[{ attachment: 'rocket' }], [{ text: 'mime' }], [{}], [{ attachment: 42 }], [{ text: '__proto__' }]])(
    'rejects %j with 400 unknown_thinking_style and saves nothing',
    async (body) => {
      const res = await authed(request(app).put('/me/coach/thinking').send(body));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'unknown_thinking_style' });
    },
  );

  it('treats a stored value the app no longer knows as the default', async () => {
    await prisma.user.update({ where: { id: userId }, data: { coachThinkingAttachment: 'retired', coachThinkingText: 'retired' } });
    const res = await authed(request(app).get('/me/coach/status'));
    expect(res.body).toMatchObject({ thinkingAttachment: 'bulb', thinkingText: 'steps' });
  });
});

// Review Focus 1: a retired stored id must never reach any client.
it('reports Mochi, not chosen, for a stored retired character', async () => {
  await prisma.user.update({ where: { id: userId }, data: { coachPersonaId: 'hoot' } });
  const res = await authed(request(app).get('/me/coach/status'));
  expect(res.body.personaId).toBe('mochi');
  // Stored is non-null, so personaChosen is true here; the migration is what clears it (Task 2).
  expect(res.body.personas.map((p: { id: string }) => p.id)).not.toContain('hoot');
});
```

(`authed`, `app` and `userId` stand for whatever the file already uses. Copy the setup from its persona tests.)

- [ ] **Step 2: Run them and check that they fail.**

- [ ] **Step 3: Create `thinking.ts`.**

```ts
// The two thinking settings (spec 2026-10-01 §4, §5, §8). Stored as nullable
// strings on User; null, or an id a later version dropped, means the default.

export const THINKING_ATTACHMENTS = ['bulb', 'cloud', 'typing', 'hourglass', 'gears', 'question', 'sparkles', 'clock', 'spinner'] as const;
export const THINKING_TEXTS = ['lines', 'placeholder', 'tag', 'typewriter', 'nameplate', 'steps', 'shimmer', 'bouncy', 'dialog', 'strip'] as const;
export const DEFAULT_THINKING_ATTACHMENT = 'bulb';
export const DEFAULT_THINKING_TEXT = 'steps';

const has = (list: readonly string[], v: unknown): v is string => typeof v === 'string' && list.includes(v);

export const isThinkingAttachment = (v: unknown): v is string => has(THINKING_ATTACHMENTS, v);
export const isThinkingText = (v: unknown): v is string => has(THINKING_TEXTS, v);
export const resolveThinkingAttachment = (v: string | null | undefined) => (isThinkingAttachment(v) ? v : DEFAULT_THINKING_ATTACHMENT);
export const resolveThinkingText = (v: string | null | undefined) => (isThinkingText(v) ? v : DEFAULT_THINKING_TEXT);
```

- [ ] **Step 4: Wire the status payload.** In the status handler, extend the `select` to `{ coachPersonaId: true, coachEngine: true, coachThinkingAttachment: true, coachThinkingText: true }`. Add to `res.json({...})`:

```ts
        thinkingAttachment: resolveThinkingAttachment(user?.coachThinkingAttachment),
        thinkingText: resolveThinkingText(user?.coachThinkingText),
```

Change the comment `(Skip picks Hoot)` to `(Skip picks Mochi)`.

- [ ] **Step 5: Add the route** after the persona route. It has no `requireEnabled`, like persona, because it is a look:

```ts
  // A look, like the character: can be set while the coach is off.
  router.put('/me/coach/thinking', requireAuth, async (req: AuthedRequest, res) => {
    const { attachment, text } = (req.body ?? {}) as { attachment?: unknown; text?: unknown };
    const hasA = attachment !== undefined;
    const hasT = text !== undefined;
    if ((!hasA && !hasT) || (hasA && !isThinkingAttachment(attachment)) || (hasT && !isThinkingText(text))) {
      res.status(400).json({ error: 'unknown_thinking_style' });
      return;
    }
    try {
      const user = await prisma.user.update({
        where: { id: req.userId! },
        data: { ...(hasA ? { coachThinkingAttachment: attachment as string } : {}), ...(hasT ? { coachThinkingText: text as string } : {}) },
        select: { coachThinkingAttachment: true, coachThinkingText: true },
      });
      res.json({ thinkingAttachment: resolveThinkingAttachment(user.coachThinkingAttachment), thinkingText: resolveThinkingText(user.coachThinkingText) });
    } catch (err) {
      logFailure('thinking', err);
      res.status(500).json({ error: 'coach_unavailable' });
    }
  });
```

Import the helpers from `./thinking`. The existing `routes.test` personas payload assertion now expects the 15 v4 entries. Update it to build the list from `listPersonas()`, not a literal.

- [ ] **Step 6: Run `tests/coach/routes.test.ts`.** Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add backend/src/coach/thinking.ts backend/src/coach/routes.ts backend/tests/coach/routes.test.ts
git commit -m "feat(backend): thinking attachment and thinking text settings"
```

### Task 4: Route-specific progress steps in the answer stream

**Files:**
- Modify: `backend/src/coach/answer/pipeline.ts` (`AnswerEvent` ~50, `STATUS_LABELS` ~101, step 3 ~261, after fact sheet ~279, before `attempt` ~356)
- Test: `backend/tests/coach/answerPipeline.test.ts`

**Interfaces:**
- Produces: `export type AnswerStep = 'route' | 'facts' | 'write'`; `export const STEP_LABELS: Record<AnswerRoute, Record<AnswerStep, string>>`. The status event becomes `{ type: 'status'; step: AnswerStep; label: string; conversationId: string }`. `STATUS_LABELS` is removed.

- [ ] **Step 1: Write the failing tests.**

```ts
import { STEP_LABELS } from '../../src/coach/answer/pipeline';

describe('progress steps', () => {
  it('names only what each route really does', () => {
    for (const route of ['today', 'sleep', 'trends', 'general'] as const) {
      expect(Object.keys(STEP_LABELS[route]).sort()).toEqual(['facts', 'route', 'write']);
    }
    expect(Object.values(STEP_LABELS.general).join(' ')).not.toMatch(/your (day|sleep|numbers)/i);
    expect(STEP_LABELS.general).toEqual({ route: 'Thinking it over…', facts: 'Checking your goals…', write: 'Writing an answer…' });
    expect(STEP_LABELS.sleep).toEqual({ route: 'Looking at your sleep…', facts: 'Going through your recent nights…', write: 'Writing it up…' });
  });

  it('streams route, facts and write before the first sentence', async () => {
    const events = await run(/* the file's existing happy-path input for the today route */);
    const statuses = events.filter((e) => e.type === 'status');
    expect(statuses.map((s) => [s.step, s.label])).toEqual([
      ['route', 'Looking at your day…'],
      ['facts', 'Comparing today with your usual…'],
      ['write', 'Writing it up…'],
    ]);
    expect(events.findIndex((e) => e.type === 'text')).toBeGreaterThan(events.findIndex((e) => e.type === 'status' && e.step === 'write'));
  });

  it('stops at the route step when the fact sheet fails', async () => {
    // existing "fact sheet throws" case: now asserts the single status carries step 'route'
  });
});
```

Then update every existing `types(events)` expectation in the file:
- Any `['status', 'text', …]` becomes `['status', 'status', 'status', 'text', …]`.
- A failure before the fact sheet is built stays `['status', 'error']`.
- A failure in the model call becomes `['status', 'status', 'status', 'error']`.

Update `events[0]` equality assertions to include `step: 'route'`.

- [ ] **Step 2: Run them and check that they fail.**

- [ ] **Step 3: Implement.** Replace `STATUS_LABELS` with:

```ts
export type AnswerStep = 'route' | 'facts' | 'write';

/**
 * What the app's "What it's doing" list shows (spec 2026-10-01 §5). Per route,
 * because each loads different data (facts.ts) and a general question is not
 * about the user's day: every label names work that route really does.
 */
export const STEP_LABELS: Record<AnswerRoute, Record<AnswerStep, string>> = {
  today: { route: 'Looking at your day…', facts: 'Comparing today with your usual…', write: 'Writing it up…' },
  sleep: { route: 'Looking at your sleep…', facts: 'Going through your recent nights…', write: 'Writing it up…' },
  trends: { route: 'Looking at your trends…', facts: 'Comparing your last 30 days…', write: 'Writing it up…' },
  general: { route: 'Thinking it over…', facts: 'Checking your goals…', write: 'Writing an answer…' },
};
```

In `AnswerEvent`, change the status member to `{ type: 'status'; step: AnswerStep; label: string; conversationId: string }`. In the pipeline:
- At step 3: `yield { type: 'status', step: 'route', label: STEP_LABELS[route].route, conversationId };`
- Right after `sheet = built;` (inside the try, before the system prompt): `yield { type: 'status', step: 'facts', label: STEP_LABELS[route].facts, conversationId };`
- Immediately before the first `attempt` call (`result = yield* attempt(n, note);`, guarded so it fires once, when `n === 1`): `if (n === 1) yield { type: 'status', step: 'write', label: STEP_LABELS[route].write, conversationId };`

`routes.ts`'s `writeSse` sends the whole event as JSON, so `step` reaches the client with no other change. Search for other `STATUS_LABELS` importers (`grep -rn STATUS_LABELS backend`) and switch them over.

- [ ] **Step 4: Run `tests/coach/answerPipeline.test.ts` and `tests/coach/answerRoutes.test.ts`.** Expected: PASS. Fix any expectation in `answerRoutes` that counts status events, the same way as above.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/coach/answer/pipeline.ts backend/tests/coach
git commit -m "feat(backend): route-specific progress steps in the answer stream"
```

### Task 5: Backend sweep (evals, old-id tests, full suite)

**Files:**
- Modify: `backend/evals/coach/fixtures/voice.ts` (~13–19), `backend/evals/coach/types.ts:24`
- Modify tests that hard-code old ids: `tests/coach/digest.test.ts`, `answerPrompt.test.ts`, `anthropicProvider.test.ts`, `todayPersona.test.ts`, `todaySummary.test.ts`, `tests/db/companionCharacters.test.ts`

- [ ] **Step 1:** In `voice.ts`, replace the per-character markers with one marker per v4 coach. Each is a phrase or trait the eval checks for in that coach's voice, matching its `tone`. For example: `peep: /!/` (excited), `jelly: /breath/i`, `kit: /bed|night|sleep/i`, `luna: /sleep|night/i`, `boba: /habit|sip|water/i`, `sprout: /week|progress|grow/i`, `avo: /energy|fuel/i`, `bun: /rest|easy|soft/i`, `axo: /recover|bounce/i`, `boo: /wind|calm|late/i`, `cap: /balance|calm/i`, `pengu: /streak|consisten|steady/i`, `gloop: /move|play|workout/i`, `bao: /stretch|gentle/i`. Keep v3's marker for `mochi`. In `types.ts:24`, change "omitted means Hoot" to Mochi.
- [ ] **Step 2:** In `digest.test.ts`, change the `it.each` over the 8 ids to `listPersonas().map((p) => p.id)`. In the other listed files, replace `'hoot'` (as "the default") with `'mochi'`, and any other old id used as "a non-default coach" with `'kit'`. Leave `companionCharacters.test.ts` asserting its own historical migration. It imports `findPersona`, so change only assertions that rely on v3 ids still being live, by asserting against `PERSONA_SETS.v3` instead.
- [ ] **Step 3: Run the full backend suite** (no live backend running):

```bash
cd backend && npx prisma generate && TEST_DATABASE_URL=$TEST_DATABASE_URL DATABASE_URL=$TEST_DATABASE_URL NODE_OPTIONS=--experimental-vm-modules npx jest --forceExit
```

Expected: all pass. The last baseline was 2,075 of 2,077 passing, with 2 environmental failures that pass when rerun alone, so rerun any failure alone before treating it as real.

- [ ] **Step 4: Commit.**

```bash
git add backend
git commit -m "test(backend): move evals and fixtures to the pixel coach roster"
```

---

## Part 2: Mobile

### Task 6: Sprite data and the compositor

**Files:**
- Create: `mobile/scripts/port-sprites.mjs`, `mobile/src/components/characters/sprites/data.ts` (generated), `mobile/src/components/characters/sprites/compose.ts`
- Test: `mobile/__tests__/characters/compose.test.ts`

**Interfaces:**
- Produces:
  - `SpriteDef { half: readonly string[]; palette: Readonly<Record<string,string>>; eyes?: string; lid?: string; shut?: string; slim: 0|1|2; shift?: number }`
  - `SPRITES: Record<CharacterId, SpriteDef>`
  - `type EyeMode = 'open'|'blink'|'up'|'happy'|'shut'`
  - `SPRITE_SIZE = 24`
  - `composeSprite(def: SpriteDef, eyes: EyeMode, opts?: { dim?: boolean }): readonly (string|null)[]`, a row-major 576-entry grid, memoised
  - `narrowHalf(half, k): string[]`
  - `darkenHex(hex, k)`, `mixHex(a, b, k)`

- [ ] **Step 1: Write the port script.** `cast.js` declares `const CAST = {...}` (plain JS). The script evaluates it and writes TypeScript:

```js
// Generates src/components/characters/sprites/data.ts from the approved design
// data in docs/design/pixel-coaches/cast.js. Rerun after editing the design.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(here, '../../docs/design/pixel-coaches/cast.js'), 'utf8');
const ctx = {};
vm.runInNewContext(`${src}\nthis.CAST = CAST;`, ctx);
const SLIM = { luna: 0, mochi: 0, boba: 0, jelly: 0, sprout: 2 };
const out = Object.entries(ctx.CAST).map(([name, c]) => {
  const id = name.toLowerCase();
  const def = { half: c.grid, palette: c.pal, slim: SLIM[id] ?? 1 };
  for (const k of ['eyes', 'lid', 'shut', 'shift']) if (c[k] !== undefined) def[k] = c[k];
  return `  ${id}: ${JSON.stringify(def)},`;
});
writeFileSync(
  path.join(here, '../src/components/characters/sprites/data.ts'),
  `// GENERATED by scripts/port-sprites.mjs from docs/design/pixel-coaches/cast.js. Do not edit by hand.\n` +
    `import type { CharacterId } from '../types';\nimport type { SpriteDef } from './compose';\n\n` +
    `export const SPRITES: Record<CharacterId, SpriteDef> = {\n${out.join('\n')}\n};\n`,
);
console.log(`wrote ${out.length} sprites`);
```

Run: `node scripts/port-sprites.mjs`. Expected: `wrote 15 sprites`. (Task 8 changes `CharacterId` to the 15 ids; until then `data.ts` won't type-check, so do Tasks 6 and 8 back to back, or run Task 8 Step 3 first.)

- [ ] **Step 2: Write the failing tests** `__tests__/characters/compose.test.ts`:

```ts
import { composeSprite, narrowHalf, SPRITE_SIZE, darkenHex } from '../../src/components/characters/sprites/compose';
import { SPRITES } from '../../src/components/characters/sprites/data';
import { CHARACTER_IDS } from '../../src/components/characters/types';

const N = SPRITE_SIZE;
const at = (g: readonly (string | null)[], x: number, y: number) => g[y * N + x];
const cols = (g: readonly (string | null)[]) => {
  const used = new Set<number>();
  g.forEach((c, i) => c && used.add(i % N));
  return used.size;
};

describe('composeSprite', () => {
  it.each(CHARACTER_IDS)('%s is mirror-symmetric in every eye mode', (id) => {
    for (const mode of ['open', 'blink', 'up', 'happy', 'shut'] as const) {
      const g = composeSprite(SPRITES[id], mode);
      for (let y = 0; y < N; y++) for (let x = 0; x < N / 2; x++) expect(at(g, x, y)).toBe(at(g, N - 1 - x, y));
    }
  });

  it('narrows by the configured columns', () => {
    const wide = (id: keyof typeof SPRITES) => cols(composeSprite({ ...SPRITES[id], slim: 0 }, 'open'));
    for (const id of CHARACTER_IDS) {
      const slim = SPRITES[id].slim;
      expect(cols(composeSprite(SPRITES[id], 'open'))).toBe(wide(id) - slim * 2);
    }
    expect(SPRITES.luna.slim).toBe(0);
    expect(SPRITES.sprout.slim).toBe(2);
    expect(SPRITES.kit.slim).toBe(1);
  });

  it('only outlines next to solid cells, in the soft outline colour', () => {
    const def = SPRITES.mochi;
    const outline = darkenHex(def.palette.s ?? def.palette.b!, 0.6);
    const g = composeSprite(def, 'open');
    const palette = new Set(Object.values(def.palette));
    g.forEach((c, i) => {
      if (c === outline && !palette.has(c)) {
        const x = i % N, y = Math.floor(i / N);
        const nbrs = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => at(g, x + dx!, y + dy!));
        expect(nbrs.some((n) => n && n !== outline)).toBe(true);
      }
    });
  });

  it('never outlines sparkles, shadows or tentacles', () => {
    const g = composeSprite(SPRITES.jelly, 'open');
    const tentacle = SPRITES.jelly.palette.t!;
    const outline = darkenHex(SPRITES.jelly.palette.s!, 0.6);
    g.forEach((c, i) => {
      if (c !== tentacle) return;
      const x = i % N, y = Math.floor(i / N);
      // the cell below the lowest tentacle pixel is empty, not outline
      if (y === N - 1 || at(g, x, y + 1) === tentacle) return;
      expect(at(g, x, y + 1)).not.toBe(outline);
    });
  });

  it('moves eyes for each mood and keeps the cell count stable', () => {
    const open = composeSprite(SPRITES.kit, 'open');
    const up = composeSprite(SPRITES.kit, 'up');
    const eye = SPRITES.kit.palette.e!;
    const rows = (g: readonly (string | null)[]) => g.map((c, i) => (c === eye ? Math.floor(i / N) : -1)).filter((r) => r >= 0);
    expect(Math.min(...rows(up))).toBe(Math.min(...rows(open)) - 1);
    expect(composeSprite(SPRITES.kit, 'shut')).not.toEqual(open);
    expect(composeSprite(SPRITES.kit, 'happy')).not.toEqual(open);
  });

  it('dims every hex colour for resting', () => {
    const g = composeSprite(SPRITES.mochi, 'shut', { dim: true });
    const plain = composeSprite(SPRITES.mochi, 'shut');
    expect(g.filter(Boolean)).toHaveLength(plain.filter(Boolean).length);
    expect(g).not.toEqual(plain);
  });

  it('treats Luna (no eyes) as unchanged by eye modes', () => {
    expect(composeSprite(SPRITES.luna, 'up')).toEqual(composeSprite(SPRITES.luna, 'open'));
  });

  it('memoises', () => {
    expect(composeSprite(SPRITES.boba, 'open')).toBe(composeSprite(SPRITES.boba, 'open'));
  });
});

describe('narrowHalf', () => {
  it('keeps 12 columns and pads the outside', () => {
    const half = Array.from({ length: 24 }, () => '..bbbbbbbbbb');
    const out = narrowHalf(half, 2);
    expect(out.every((r) => r.length === 12)).toBe(true);
    expect(out[0]!.startsWith('....')).toBe(true);
  });
});
```

- [ ] **Step 3: Run and check that it fails.**
Run: `cd mobile && npx jest __tests__/characters/compose.test.ts`
Expected: FAIL, because the module is missing.

- [ ] **Step 4: Implement `compose.ts`.** This ports the mockup logic verbatim:

```ts
// Pixel sprite compositor (spec 2026-10-01 §2). Pure, no Skia: a SpriteDef's
// 12-column left half → a 24×24 colour grid for one eye mode. Narrow → eye
// edits → mirror → shade the body → soft outline → optional resting dim.

export const SPRITE_SIZE = 24;
const HALF = 12;
const NEVER_OUTLINED = new Set(['.', 'x', 'z', 't']);
const DIM_TOWARD = '#5B5F73';
const DIM_AMOUNT = 0.32;

export interface SpriteDef {
  half: readonly string[];
  palette: Readonly<Record<string, string>>;
  /** Letters that are eyes (default 'ew'); '' = no eyes to move (Luna). */
  eyes?: string;
  /** What an eye cell becomes when closed (default 'b'). */
  lid?: string;
  /** The closed-eye line's letter (default 'e'). */
  shut?: string;
  slim: 0 | 1 | 2;
  /** Rows to move the art down so it sits centred. */
  shift?: number;
}

export type EyeMode = 'open' | 'blink' | 'up' | 'happy' | 'shut';
export type SpriteGrid = readonly (string | null)[];

export function darkenHex(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  return '#' + [16, 8, 0].map((s) => Math.round(((n >> s) & 255) * k).toString(16).padStart(2, '0')).join('');
}

export function mixHex(a: string, b: string, k: number): string {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  return '#' + [16, 8, 0].map((s) => Math.round(((x >> s) & 255) * (1 - k) + ((y >> s) & 255) * k).toString(16).padStart(2, '0')).join('');
}

/** Drop k columns, each time the one most like its outer neighbour, padding the outside. */
export function narrowHalf(half: readonly string[], k: number): string[] {
  let g = half.map((r) => [...r]);
  for (let n = 0; n < k; n++) {
    let best = -1, bestCost = Infinity;
    for (let i = 2; i <= 10; i++) {
      let cost = 0;
      for (const r of g) if (r[i] !== r[i - 1]) cost += r[i] === '.' || r[i - 1] === '.' ? 1 : 3;
      cost += Math.abs(i - 6) * 0.01;
      if (cost < bestCost) { bestCost = cost; best = i; }
    }
    g = g.map((r) => ['.', ...r.slice(0, best), ...r.slice(best + 1)]);
  }
  return g.map((r) => r.join(''));
}

function shiftDown(half: readonly string[], n: number): string[] {
  return n ? [...half.slice(-n), ...half.slice(0, -n)] : [...half];
}

function editEyes(half: string[][], def: SpriteDef, mode: EyeMode): void {
  const eyes = def.eyes ?? 'ew', lid = def.lid ?? 'b', shut = def.shut ?? 'e';
  if (!eyes || mode === 'open') return;
  const cells: [number, number, string][] = [];
  half.forEach((r, y) => r.forEach((L, x) => { if (eyes.includes(L)) cells.push([x, y, L]); }));
  if (!cells.length) return;
  if (mode === 'blink' || mode === 'shut') {
    const byCol = new Map<number, number[]>();
    for (const [x, y] of cells) byCol.set(x, [...(byCol.get(x) ?? []), y]);
    for (const [x, ys] of byCol) {
      ys.sort((a, b) => a - b);
      ys.slice(0, -1).forEach((y) => (half[y]![x] = lid));
      half[ys[ys.length - 1]!]![x] = shut;
    }
  } else if (mode === 'up') {
    cells.forEach(([x, y]) => (half[y]![x] = lid));
    cells.forEach(([x, y, L]) => { if (y > 0) half[y - 1]![x] = L; });
  } else {
    const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys);
    cells.forEach(([x, y]) => (half[y]![x] = lid));
    for (let x = x0; x <= x1; x++) half[y0]![x] = shut;
    if (half[y0 + 1]) {
      if (x0 > 0) half[y0 + 1]![x0 - 1] = shut;
      if (x1 < HALF - 1) half[y0 + 1]![x1 + 1] = shut;
    }
  }
}

const cache = new WeakMap<SpriteDef, Map<string, SpriteGrid>>();

export function composeSprite(def: SpriteDef, eyes: EyeMode, opts: { dim?: boolean } = {}): SpriteGrid {
  const key = `${eyes}|${opts.dim ? 1 : 0}`;
  let perDef = cache.get(def);
  if (!perDef) cache.set(def, (perDef = new Map()));
  const hit = perDef.get(key);
  if (hit) return hit;

  const N = SPRITE_SIZE;
  const half = shiftDown(narrowHalf(def.half, def.slim), def.shift ?? 0).map((r) => [...r]);
  editEyes(half, def, eyes);
  const g = half.map((r) => [...r, ...[...r].reverse()]);
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && !NEVER_OUTLINED.has(g[y]![x]!);
  const pal = def.palette;
  const outline = darkenHex(pal.s ?? pal.b!, 0.6);
  const out: (string | null)[] = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const L = g[y]![x]!;
    let col: string | null = null;
    if (L !== '.') {
      col = pal[L] ?? pal.b!;
      if (L === 'b') {
        if (!solid(x, y - 1)) col = pal.h ?? col;
        else if (!solid(x, y + 1) || !solid(x, y + 2)) col = pal.s ?? col;
      }
    } else if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => solid(x + dx!, y + dy!))) {
      col = outline;
    }
    if (col && opts.dim && col.startsWith('#')) col = mixHex(col, DIM_TOWARD, DIM_AMOUNT);
    out.push(col);
  }
  const frozen = Object.freeze(out);
  perDef.set(key, frozen);
  return frozen;
}
```

- [ ] **Step 5: Run the tests.** Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add mobile/scripts/port-sprites.mjs mobile/src/components/characters/sprites mobile/__tests__/characters/compose.test.ts
git commit -m "feat(mobile): pixel sprite data and compositor"
```

### Task 7: Crisp scaling maths

**Files:**
- Create: `mobile/src/components/characters/sprites/scale.ts`
- Test: `mobile/__tests__/characters/scale.test.ts`

**Interfaces:**
- Produces: `crispLayout(slotPt: number, pixelRatio: number, cells?: number, rows?: number): { cellPx: number; cellPt: number; drawnPt: number; offsetPt: number; offsetYPt: number }`, where `cellPx` is device pixels per sprite pixel, `cellPt = cellPx / pixelRatio`, `drawnPt = cellPt * cells`, and the offsets centre the drawing in the slot. `rows` defaults to `cells`.

- [ ] **Step 1: Write the failing test** (Review Focus 4):

```ts
import { crispLayout } from '../../src/components/characters/sprites/scale';

describe('crispLayout', () => {
  it.each([18, 20, 36, 40, 52, 56, 64, 72, 120, 180])('%ipt at 2× and 3× uses whole device pixels, centred inside the slot', (pt) => {
    for (const dpr of [2, 3]) {
      const l = crispLayout(pt, dpr);
      expect(Number.isInteger(l.cellPx)).toBe(true);
      expect(l.cellPx).toBeGreaterThanOrEqual(1);
      expect(l.drawnPt).toBeLessThanOrEqual(pt + 1e-9);
      expect(l.offsetPt).toBeCloseTo((pt - l.drawnPt) / 2);
      // offsets land on device pixels too
      expect(Number.isInteger(Math.round(l.offsetPt * dpr * 1e6) / 1e6)).toBe(true);
    }
  });

  it('matches the spec examples', () => {
    expect(crispLayout(52, 3).cellPx).toBe(6); // 48pt drawn
    expect(crispLayout(18, 3).cellPx).toBe(2); // 16pt drawn
    expect(crispLayout(18, 2).cellPx).toBe(1);
  });

  it('never returns zero, even for tiny slots', () => {
    expect(crispLayout(4, 1).cellPx).toBe(1);
  });
});
```

- [ ] **Step 2: Run and check that it fails.**

- [ ] **Step 3: Implement.**

```ts
// Whole-device-pixel layout for a pixel sprite (spec §2 "Crisp scaling").
export function crispLayout(slotPt: number, pixelRatio: number, cells = 24, rows = cells) {
  const cellPx = Math.max(1, Math.floor((slotPt * pixelRatio) / Math.max(cells, rows)));
  const cellPt = cellPx / pixelRatio;
  const drawnPt = cellPt * cells;
  const drawnHPt = cellPt * rows;
  // Offsets are rounded to device pixels so the grid never straddles one.
  const offsetPt = Math.floor(((slotPt - drawnPt) / 2) * pixelRatio) / pixelRatio;
  const offsetYPt = Math.floor(((slotPt * (rows / cells) - drawnHPt) / 2) * pixelRatio) / pixelRatio;
  return { cellPx, cellPt, drawnPt, offsetPt, offsetYPt };
}
```

If the `toBeCloseTo` offset assertion fails by under one device pixel because of the floor, relax it to `Math.abs(l.offsetPt - (pt - l.drawnPt) / 2) <= 1 / dpr`. The floor is what keeps the grid on whole device pixels, and that matters more.

- [ ] **Step 4: Run the tests.** Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add mobile/src/components/characters/sprites/scale.ts mobile/__tests__/characters/scale.test.ts
git commit -m "feat(mobile): crisp whole-pixel sprite layout"
```

### Task 8: Roster, registry, attachments and text-style ids

**Files:**
- Modify: `mobile/src/components/characters/types.ts`, `mobile/src/components/characters/registry.ts`
- Create: `mobile/src/components/characters/thinking.ts`
- Test: `mobile/__tests__/characters/registry.test.tsx` (rewrite)

**Interfaces:**
- Produces:
  - `CHARACTER_IDS` (15, in picker order), `CharacterId`, `DEFAULT_CHARACTER_ID = 'mochi'`, `isCharacterId`
  - `CHARACTER_MOODS` (unchanged)
  - `CharacterInfo { id; name; accent; focus; number: number; tagline; greeting; thinkingLines: readonly [string, string, string] }`, and `CHARACTERS`, `characterInfo()`
  - `THINKING_ATTACHMENTS`, `ThinkingAttachmentId`, `DEFAULT_THINKING_ATTACHMENT = 'bulb'`, `isThinkingAttachment`
  - `THINKING_TEXTS`, `ThinkingTextId`, `DEFAULT_THINKING_TEXT = 'steps'`, `isThinkingText`
  - `THINKING_ATTACHMENT_NAMES: Record<ThinkingAttachmentId, { name: string; blurb: string }>`
  - `THINKING_TEXT_NAMES: Record<ThinkingTextId, { name: string; blurb: string }>`
  - `CharacterArtProps` is deleted.

- [ ] **Step 1: Write the failing test.**

```ts
import { CHARACTERS, characterInfo } from '../../src/components/characters/registry';
import { CHARACTER_IDS, DEFAULT_CHARACTER_ID, isCharacterId } from '../../src/components/characters/types';
import { THINKING_ATTACHMENTS, THINKING_TEXTS, DEFAULT_THINKING_ATTACHMENT, DEFAULT_THINKING_TEXT, isThinkingAttachment, isThinkingText } from '../../src/components/characters/thinking';

it('has the 15 coaches in picker order, Mochi default', () => {
  expect(CHARACTER_IDS).toEqual(['mochi', 'boba', 'sprout', 'avo', 'peep', 'bun', 'kit', 'axo', 'boo', 'cap', 'jelly', 'pengu', 'luna', 'gloop', 'bao']);
  expect(DEFAULT_CHARACTER_ID).toBe('mochi');
  expect(isCharacterId('hoot')).toBe(false);
});

it('numbers cards 1–15 and gives every coach three thinking lines and copy', () => {
  CHARACTER_IDS.forEach((id, i) => {
    const c = CHARACTERS[id];
    expect(c.number).toBe(i + 1);
    expect(c.thinkingLines).toHaveLength(3);
    expect(c.accent).toMatch(/^#[0-9A-F]{6}$/i);
    expect(c.focus && c.tagline && c.greeting).toBeTruthy();
  });
  expect(CHARACTERS.luna.thinkingLines[0]).toBe('counting stars');
});

it('falls back to Mochi for unknown ids', () => {
  expect(characterInfo('hoot').id).toBe('mochi');
  expect(characterInfo(null).id).toBe('mochi');
});

it('lists the thinking settings with their defaults', () => {
  expect(THINKING_ATTACHMENTS).toHaveLength(9);
  expect(THINKING_TEXTS).toHaveLength(10);
  expect(DEFAULT_THINKING_ATTACHMENT).toBe('bulb');
  expect(DEFAULT_THINKING_TEXT).toBe('steps');
  expect(isThinkingAttachment('rocket')).toBe(false);
  expect(isThinkingText('__proto__')).toBe(false);
});
```

- [ ] **Step 2: Run and check that it fails.**

- [ ] **Step 3: Implement.** In `types.ts`:

```ts
// Shared types for the pixel coaches (spec 2026-10-01 §1).
export const CHARACTER_IDS = ['mochi', 'boba', 'sprout', 'avo', 'peep', 'bun', 'kit', 'axo', 'boo', 'cap', 'jelly', 'pengu', 'luna', 'gloop', 'bao'] as const;
export type CharacterId = (typeof CHARACTER_IDS)[number];

export const CHARACTER_MOODS = ['idle', 'thinking', 'answering', 'resting'] as const;
export type CharacterMood = (typeof CHARACTER_MOODS)[number];

export const DEFAULT_CHARACTER_ID: CharacterId = 'mochi';

export function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === 'string' && (CHARACTER_IDS as readonly string[]).includes(value);
}
```

`thinking.ts`:

```ts
// The two thinking settings (spec §4, §5). Ids match backend/src/coach/thinking.ts.
export const THINKING_ATTACHMENTS = ['bulb', 'cloud', 'typing', 'hourglass', 'gears', 'question', 'sparkles', 'clock', 'spinner'] as const;
export type ThinkingAttachmentId = (typeof THINKING_ATTACHMENTS)[number];
export const DEFAULT_THINKING_ATTACHMENT: ThinkingAttachmentId = 'bulb';

export const THINKING_TEXTS = ['lines', 'placeholder', 'tag', 'typewriter', 'nameplate', 'steps', 'shimmer', 'bouncy', 'dialog', 'strip'] as const;
export type ThinkingTextId = (typeof THINKING_TEXTS)[number];
export const DEFAULT_THINKING_TEXT: ThinkingTextId = 'steps';

const has = (list: readonly string[], v: unknown) => typeof v === 'string' && list.includes(v);
export const isThinkingAttachment = (v: unknown): v is ThinkingAttachmentId => has(THINKING_ATTACHMENTS, v);
export const isThinkingText = (v: unknown): v is ThinkingTextId => has(THINKING_TEXTS, v);

export const THINKING_ATTACHMENT_NAMES: Record<ThinkingAttachmentId, { name: string; blurb: string }> = {
  bulb: { name: 'Lightbulb', blurb: 'Flickers while it thinks, lights up when the answer lands.' },
  cloud: { name: 'Thought cloud', blurb: 'A thought bubble; the dots fill in one by one.' },
  typing: { name: 'Typing bubble', blurb: 'Three bouncing dots, like "is typing".' },
  hourglass: { name: 'Hourglass', blurb: 'Sand trickles through, grain by grain.' },
  gears: { name: 'Gears', blurb: 'Two cogs turning together.' },
  question: { name: '? → !', blurb: 'A question mark that pops into an !.' },
  sparkles: { name: 'Sparkles', blurb: 'Little stars twinkle around the head.' },
  clock: { name: 'Clock', blurb: 'The hand sweeps round, then a ding.' },
  spinner: { name: 'Spinner', blurb: 'A ring of pixels chasing each other.' },
};

export const THINKING_TEXT_NAMES: Record<ThinkingTextId, { name: string; blurb: string }> = {
  lines: { name: 'Personality lines', blurb: 'Your coach says what it is up to, in its own words.' },
  placeholder: { name: 'Reply placeholder', blurb: 'A shimmering reply bubble the answer flows into.' },
  tag: { name: 'Pixel status tag', blurb: 'A game-style THINKING tag with a blinking cursor.' },
  typewriter: { name: 'Typewriter', blurb: 'Your coach types its line letter by letter.' },
  nameplate: { name: 'Nameplate', blurb: 'A small name tag under your coach.' },
  steps: { name: "What it's doing", blurb: 'The real steps, ticked off as they happen.' },
  shimmer: { name: 'Colour shimmer', blurb: 'A sweep of your coach’s colour, with a timer.' },
  bouncy: { name: 'Bouncy letters', blurb: '"thinking" does a little wave.' },
  dialog: { name: 'Retro dialog box', blurb: 'An RPG text box the answer types into.' },
  strip: { name: 'Progress strip', blurb: 'A slim card with a moving progress strip.' },
};
```

`registry.ts`: replace `CHARACTERS` with the 15 entries using the spec §1 table (`accent`, `focus`), the §6 table (`tagline`, `greeting`, which must match v4 exactly), and §5 (`thinkingLines`). Number = index + 1. Example entries:

```ts
  mochi: { id: 'mochi', number: 1, name: 'Mochi', accent: '#F9A8D4', focus: 'Rest',
    tagline: 'Soft and gentle. Rest is never something to feel bad about.',
    greeting: 'Hey you. No pressure today. How are you feeling?',
    thinkingLines: ['mulling it over', 'getting comfy with your numbers', 'taking a soft look'] },
  kit: { id: 'kit', number: 7, name: 'Kit', accent: '#FB923C', focus: 'Bedtime',
    tagline: 'Dry wit. Gently judges your bedtime.',
    greeting: "Oh, you're up. Want to talk about last night?",
    thinkingLines: ['pretending not to care', 'judging your bedtime', 'licking a paw, one sec'] },
```

Write all 15 the same way, copying every value from the spec tables. The Mochi greeting is v3's ("Hey you. No pressure today. How are you feeling?"). Update the `characterInfo` docstring: any unknown id is Mochi.

- [ ] **Step 4: Run.** Expected: PASS for this file. Other suites break until Task 9 and later; that is expected.

- [ ] **Step 5: Commit.**

```bash
git add mobile/src/components/characters/types.ts mobile/src/components/characters/registry.ts mobile/src/components/characters/thinking.ts mobile/__tests__/characters/registry.test.tsx
git commit -m "feat(mobile): 15-coach roster, registry copy and thinking setting ids"
```

### Task 9: Attachment frames and the Skia renderer

**Files:**
- Create: `mobile/src/components/characters/attachments/frames.ts`
- Modify: `mobile/src/components/characters/CharacterCanvas.tsx`, `mobile/src/components/characters/Character.tsx`
- Create: `mobile/src/components/characters/useSpriteClock.ts`
- Delete: `mobile/src/components/characters/art/` (all), `engine/MoodLayers.tsx`, `engine/useMoodLayer.ts`, `engine/index.ts`. Delete `engine/useLoop.ts`, `engine/keyframes.ts` and `__tests__/characters/{keyframes,engineHooks,moodLayers}.test.*` if nothing else imports them (`grep -rn "engine" src`).
- Modify: `mobile/jest-mocks/CharacterCanvas.js`, `mobile/jest-mocks/characterContext.tsx`
- Test: `mobile/__tests__/characters/frames.test.ts`, `mobile/__tests__/components/Character.test.tsx`

**Interfaces:**
- Consumes: `composeSprite`, `SPRITES`, `crispLayout`, `ThinkingAttachmentId`.
- Produces:
  - `type Cell = readonly [x: number, y: number, color: string]`
  - `ATTACHMENT_LOOP_MS = 3200`, `ATTACHMENT_DONE_MS = 800`
  - `attachmentFrame(id: ThinkingAttachmentId, tMs: number, done: boolean): readonly Cell[]` (stage coordinates: 36×32, coach at x 0–23, y 8–31)
  - `frameKey(id, tMs, done): string` (changes only when the drawn frame changes)
  - `moodEyes(mood: CharacterMood, blinking: boolean): EyeMode`
  - `Character` props: `characterId?`, `mood`, `size`, `paused?`, `dimmed?`, `glow?`, `attachment?: ThinkingAttachmentId | null`, `accessibilityLabel?`, `testID?`. No `mini`. The attachment's "answer's here" frame comes from `mood === 'answering'`.
  - The jest mock label becomes `character:<id>:<mood>:<size>:<paused|playing>:<attachment|none>`.

- [ ] **Step 1: Write the failing frames test.**

```ts
import { attachmentFrame, frameKey, moodEyes, ATTACHMENT_LOOP_MS } from '../../src/components/characters/attachments/frames';
import { THINKING_ATTACHMENTS } from '../../src/components/characters/thinking';

it.each(THINKING_ATTACHMENTS)('%s draws inside the 36×32 stage, away from the coach body', (id) => {
  for (let t = 0; t < ATTACHMENT_LOOP_MS; t += 50) {
    for (const done of [false, true]) {
      for (const [x, y] of attachmentFrame(id, t, done)) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(36);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThan(32);
      }
    }
  }
});

it.each(THINKING_ATTACHMENTS)('%s has a distinct "answer\'s here" frame and animates while thinking', (id) => {
  const keys = new Set(Array.from({ length: 64 }, (_, i) => frameKey(id, i * 50, false)));
  expect(keys.size).toBeGreaterThan(1);
  expect(JSON.stringify(attachmentFrame(id, 0, true))).not.toEqual(JSON.stringify(attachmentFrame(id, 0, false)));
});

it('maps moods to eyes; reduce-motion keeps mood eyes (Review Focus 5)', () => {
  expect(moodEyes('idle', false)).toBe('open');
  expect(moodEyes('idle', true)).toBe('blink');
  expect(moodEyes('thinking', false)).toBe('up');
  expect(moodEyes('answering', true)).toBe('happy');
  expect(moodEyes('resting', false)).toBe('shut');
});
```

- [ ] **Step 2: Run and check that it fails.**

- [ ] **Step 3: Implement `frames.ts`** by porting the `STYLES` draw functions from `docs/design/pixel-coaches/04-thinking-attachments.html`, unchanged in frames and colours. Clip every cell to the stage (`x` in 0–35, `y` in 0–31), because the bulb's rays reach x 37 and y −2 in the mockup:

```ts
// Thinking attachments (spec §4): pixel frames on a 36×32 stage, ported from
// docs/design/pixel-coaches/04-thinking-attachments.html. Pure.
import type { CharacterMood } from '../types';
import type { EyeMode } from '../sprites/compose';
import type { ThinkingAttachmentId } from '../thinking';

export type Cell = readonly [number, number, string];
export const STAGE_W = 36;
export const STAGE_H = 32;
export const ATTACHMENT_LOOP_MS = 3200;
export const ATTACHMENT_DONE_MS = 800;

const OUT = '#3A3D48', LIGHT = '#F1F5F9', GREY = '#94A3B8', DIM = '#52525B', GOLD = '#FDE047', GOLD2 = '#FEF08A';

function glyph(rows: string[], x0: number, y0: number, pal: Record<string, string>, outline: string | null = OUT): Cell[] {
  const cells: Cell[] = [];
  const on = new Set<string>();
  rows.forEach((r, y) => [...r].forEach((L, x) => {
    if (L !== '.') { cells.push([x0 + x, y0 + y, pal[L]!]); on.add(`${x0 + x},${y0 + y}`); }
  }));
  if (!outline) return cells;
  const ring = new Set<string>();
  for (const [x, y] of cells) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const k = `${x + dx},${y + dy}`;
    if (!on.has(k)) ring.add(k);
  }
  return [...[...ring].map((k) => { const [x, y] = k.split(',').map(Number); return [x!, y!, outline] as Cell; }), ...cells];
}

function roundRect(x0: number, y0: number, w: number, h: number, fill: string): Cell[] {
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let r = '';
    for (let x = 0; x < w; x++) r += (x === 0 || x === w - 1) && (y === 0 || y === h - 1) ? '.' : 'f';
    rows.push(r);
  }
  return glyph(rows, x0, y0, { f: fill });
}

type Draw = (t: number, done: boolean) => Cell[];

const DRAW: Record<ThinkingAttachmentId, Draw> = {
  bulb(t, done) {
    const flick = done ? 2 : Math.floor(t / 130) % 7 === 0 ? 1 : Math.floor(t / 260) % 3 === 0 ? 1 : 0;
    const glass = flick === 2 ? GOLD : flick === 1 ? '#A8A29E' : DIM;
    const fil = flick === 2 ? '#FFFFFF' : flick === 1 ? '#FB923C' : '#78716C';
    const c = glyph(['.ggggg.', 'gggggHg', 'ggggggH', 'gg.f.gg', 'ggf.fgg', '.ggggg.', '..ggg..', '..mmm..', '..MMM..', '..mmm..'], 26, 1,
      { g: glass, H: flick === 2 ? '#FFFFFF' : '#A1A1AA', f: fil, m: '#94A3B8', M: '#64748B' });
    if (flick === 2) {
      for (const [x, y] of [[23, 1], [24, 2], [36, 2], [22, 5], [23, 5], [35, 5]] as const) c.push([x, y, GOLD2]);
      for (const [x, y] of [[24, 0], [34, 0], [24, 9], [34, 9]] as const) c.push([x, y, 'rgba(253,224,71,0.45)']);
    }
    return c;
  },
  cloud(t, done) {
    const k = done ? 3 : (Math.floor(t / 400) % 3) + 1;
    const c = roundRect(21, 0, 14, 9, LIGHT);
    for (let i = 0; i < 3; i++) {
      const col = i < k ? (done ? '#9333EA' : '#1E293B') : '#CBD5E1';
      const x = 24 + i * 3;
      c.push([x, 4, col], [x + 1, 4, col]);
    }
    return [...c, ...glyph(['ff', 'ff'], 19, 10, { f: LIGHT }), ...glyph(['f'], 17, 13, { f: LIGHT })];
  },
  typing(t, done) {
    const p = Math.floor(t / 170) % 3;
    const c = [...roundRect(20, 1, 15, 8, LIGHT), ...glyph(['ff.', 'f..'], 20, 9, { f: LIGHT })];
    for (let i = 0; i < 3; i++) {
      const up = !done && i === p ? 1 : 0;
      const col = done ? '#22C55E' : i === p ? '#1E293B' : '#94A3B8';
      const x = 23 + i * 3;
      c.push([x, 4 - up, col], [x + 1, 4 - up, col], [x, 5 - up, col], [x + 1, 5 - up, col]);
    }
    return c;
  },
  hourglass(t, done) {
    const k = done ? 7 : Math.min(6, Math.floor(t / 340));
    const top = [[3, 3], [2, 2], [4, 2], [3, 2], [2, 1], [4, 1], [3, 1]] as const;
    const bot = [[2, 7], [4, 7], [3, 7], [2, 6], [4, 6], [3, 6], [3, 5]] as const;
    const c = glyph(['wwwwwww', '.g...g.', '.g...g.', '..g.g..', '...g...', '..g.g..', '.g...g.', '.g...g.', 'wwwwwww'], 27, 1, { w: '#B45309', g: '#CBD5E1' });
    top.slice(k).forEach(([x, y]) => c.push([27 + x, 1 + y, GOLD2]));
    bot.slice(0, k).forEach(([x, y]) => c.push([27 + x, 1 + y, GOLD]));
    if (!done && Math.floor(t / 170) % 2 === 0) c.push([30, 5, GOLD2]);
    if (done) for (const [x, y] of [[25, 0], [35, 0], [25, 10], [35, 10]] as const) c.push([x, y, GOLD2]);
    return c;
  },
  gears(t, done) {
    const f = Math.floor(t / (done ? 90 : 220)) % 2;
    const A = ['...t...', '..ggg..', '.ggggg.', 'tgg.ggt', '.ggggg.', '..ggg..', '...t...'];
    const B = ['.t...t.', '..ggg..', '.ggggg.', '.gg.gg.', '.ggggg.', '..ggg..', '.t...t.'];
    const second = done ? GOLD : '#94A3B8';
    return [...glyph(f ? A : B, 23, 1, { g: '#CBD5E1', t: '#CBD5E1' }), ...glyph(f ? B : A, 29, 5, { g: second, t: second })];
  },
  question(t, done) {
    const bob = done ? 0 : Math.floor(t / 400) % 2;
    const Q = ['.qqq.', 'q...q', '....q', '...q.', '..q..', '.....', '..q..'];
    const X = ['.qq.', '.qq.', '.qq.', '.qq.', '.qq.', '....', '.qq.'];
    return done ? glyph(X, 28, 1, { q: GOLD }) : glyph(Q, 28, 1 + bob, { q: '#C4B5FD' });
  },
  sparkles(t, done) {
    const S = [['x'], ['.x.', 'xxx', '.x.'], ['..x..', '..x..', 'xxXxx', '..x..', '..x..']];
    const spots = [[23, 3], [30, 0], [32, 8]] as const;
    const c: Cell[] = [];
    spots.forEach(([x, y], i) => {
      const phase = done ? 2 : (Math.floor(t / 220) + i * 2) % 5;
      const g = S[Math.max(0, phase > 2 ? 4 - phase : phase)]!;
      const o = Math.floor(g.length / 2);
      g.forEach((r, yy) => [...r].forEach((L, xx) => { if (L !== '.') c.push([x + xx - o, y + yy - o + 2, L === 'X' ? '#FFFFFF' : GOLD2]); }));
    });
    return c;
  },
  clock(t, done) {
    const c = glyph(['..fff..', '.fffff.', 'fffffff', 'fffffff', 'fffffff', '.fffff.', '..fff..'], 27, 2, { f: done ? GOLD2 : LIGHT });
    const H = [[[0, -1], [0, -2]], [[1, -1], [2, -2]], [[1, 0], [2, 0]], [[1, 1], [2, 2]], [[0, 1], [0, 2]], [[-1, 1], [-2, 2]], [[-1, 0], [-2, 0]], [[-1, -1], [-2, -2]]] as const;
    const k = done ? 0 : Math.floor(t / 180) % 8;
    c.push([30, 5, '#1E293B']);
    for (const [dx, dy] of H[k]!) c.push([30 + dx, 5 + dy, '#1E293B']);
    if (done) for (const [x, y] of [[26, 1], [34, 1], [30, 0]] as const) c.push([x, y, GOLD]);
    return c;
  },
  spinner(t, done) {
    const ring = [[2, 0], [4, 1], [5, 3], [4, 5], [2, 6], [0, 5], [-1, 3], [0, 1]] as const;
    const head = Math.floor(t / 110) % 8;
    const c: Cell[] = [];
    ring.forEach(([x, y], i) => {
      const age = (head - i + 8) % 8;
      const col = done ? '#22C55E' : age === 0 ? LIGHT : age === 1 ? '#CBD5E1' : age === 2 ? GREY : OUT;
      c.push([28 + x, 2 + y, col], [29 + x, 2 + y, col], [28 + x, 3 + y, col], [29 + x, 3 + y, col]);
    });
    return c;
  },
};

export function attachmentFrame(id: ThinkingAttachmentId, tMs: number, done: boolean): readonly Cell[] {
  const t = ((tMs % ATTACHMENT_LOOP_MS) + ATTACHMENT_LOOP_MS) % ATTACHMENT_LOOP_MS;
  return DRAW[id](t, done).filter(([x, y]) => x >= 0 && y >= 0 && x < STAGE_W && y < STAGE_H);
}

export function frameKey(id: ThinkingAttachmentId, tMs: number, done: boolean): string {
  return `${id}:${done ? 'd' : ''}:${JSON.stringify(attachmentFrame(id, tMs, done))}`;
}

export function moodEyes(mood: CharacterMood, blinking: boolean): EyeMode {
  if (mood === 'thinking') return 'up';
  if (mood === 'answering') return 'happy';
  if (mood === 'resting') return 'shut';
  return blinking ? 'blink' : 'open';
}
```

Three of the mockup's bulb rays (`[37,1]`, `[29,-2]`, `[29,-1]`) fell outside the 36×32 stage. The code above moves one inside (`[36,2]`, which `attachmentFrame` then clips, along with `[37,1]`) and drops the other two. Keep it exactly as written; the bounds test checks it.

- [ ] **Step 4: Run the frames tests.** Expected: PASS.

- [ ] **Step 5: Write `useSpriteClock.ts`.** One JS clock for all on-screen sprites (frame swaps are discrete, so this doesn't need the UI thread):

```ts
import { useEffect, useState } from 'react';

// A shared ~60ms tick for frame-based pixel animation. Paused → frozen at 0.
const listeners = new Set<(t: number) => void>();
let timer: ReturnType<typeof setInterval> | null = null;
const start = Date.now();

export function useSpriteClock(paused: boolean): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (paused) { setT(0); return; }
    listeners.add(setT);
    if (!timer) timer = setInterval(() => { const now = Date.now() - start; listeners.forEach((l) => l(now)); }, 60);
    return () => {
      listeners.delete(setT);
      if (!listeners.size && timer) { clearInterval(timer); timer = null; }
    };
  }, [paused]);
  return t;
}
```

- [ ] **Step 6: Rewrite `CharacterCanvas.tsx`:**

```tsx
import React, { useMemo } from 'react';
import { PixelRatio } from 'react-native';
import { Canvas, Picture, Skia, createPicture } from '@shopify/react-native-skia';
import { attachmentFrame, moodEyes, STAGE_H, STAGE_W, type Cell } from './attachments/frames';
import { composeSprite, SPRITE_SIZE } from './sprites/compose';
import { SPRITES } from './sprites/data';
import { crispLayout } from './sprites/scale';
import { useSpriteClock } from './useSpriteClock';
import type { ThinkingAttachmentId } from './thinking';
import type { CharacterId, CharacterMood } from './types';

export interface CharacterCanvasProps {
  characterId: CharacterId;
  mood: CharacterMood;
  size: number;
  paused: boolean;
  /** Drawn on the 36×32 stage next to the coach; the canvas widens to size × 36/24. */
  attachment: ThinkingAttachmentId | null;
  /** The attachment's "answer's here" frame (answering mood). */
  done: boolean;
}

const BOB_MS: Record<CharacterMood, number> = { idle: 1600, thinking: 1600, answering: 500, resting: 3000 };
const HOP: Record<CharacterMood, number> = { idle: 1, thinking: 1, answering: 2, resting: 1 };
const BLINK_EVERY = 4200;
const BLINK_FOR = 140;
// Attachments below this size don't read; the thinking text carries it (spec §4).
export const MIN_ATTACHMENT_SIZE = 24;

// The only file that touches Skia. Jest uses jest-mocks/CharacterCanvas.js.
export function CharacterCanvas({ characterId, mood, size, paused, attachment, done }: CharacterCanvasProps) {
  const t = useSpriteClock(paused);
  const withAttachment = attachment !== null && size >= MIN_ATTACHMENT_SIZE;
  const dpr = PixelRatio.get();
  const cols = withAttachment ? STAGE_W : SPRITE_SIZE;
  const rows = withAttachment ? STAGE_H : SPRITE_SIZE;
  const widthPt = withAttachment ? (size * STAGE_W) / SPRITE_SIZE : size;
  const layout = crispLayout(size, dpr); // the coach's own cell size decides the scale
  const cell = layout.cellPt;

  const blinking = !paused && t % BLINK_EVERY < BLINK_FOR;
  const bobUp = paused ? 0 : Math.floor(t / (BOB_MS[mood] / 2)) % 2;
  const hop = bobUp * HOP[mood];
  const grid = composeSprite(SPRITES[characterId], moodEyes(mood, blinking), { dim: mood === 'resting' });
  const extra: readonly Cell[] = withAttachment && (mood === 'thinking' || (mood === 'answering' && done)) ? attachmentFrame(attachment!, t, mood === 'answering') : [];
  const restingZ: readonly Cell[] = mood === 'resting' && !paused ? restingZFrame(t) : [];

  const picture = useMemo(
    () =>
      createPicture((canvas) => {
        const paint = Skia.Paint();
        const draw = (x: number, y: number, color: string) => {
          paint.setColor(Skia.Color(color));
          canvas.drawRect(Skia.XYWHRect(x * cell, y * cell, cell, cell), paint);
        };
        const top = withAttachment ? STAGE_H - SPRITE_SIZE : 0;
        grid.forEach((c, i) => { if (c) draw(i % SPRITE_SIZE, top + Math.floor(i / SPRITE_SIZE) - hop, c); });
        for (const [x, y, c] of [...extra, ...restingZ]) draw(x, y, c);
      }),
    [grid, extra, restingZ, hop, cell, withAttachment],
  );

  const offsetX = Math.floor(((widthPt - cell * cols) / 2) * dpr) / dpr;
  const offsetY = Math.floor((((size * rows) / SPRITE_SIZE - cell * rows) / 2) * dpr) / dpr;
  return (
    <Canvas style={{ width: widthPt, height: (size * rows) / SPRITE_SIZE }}>
      <Picture picture={picture} transform={[{ translateX: offsetX }, { translateY: offsetY }]} />
    </Canvas>
  );
}

// Resting "z": a 3×5 glyph drifting up 3 pixels over 2.4s, top right of the sprite (spec §3).
const Z = ['xxx', '..x', '.x.', 'x..', 'xxx'];
function restingZFrame(t: number): Cell[] {
  const p = (t % 2400) / 2400;
  const dy = Math.round(-p * 3);
  const alpha = (1 - p).toFixed(2);
  const out: Cell[] = [];
  Z.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'x') out.push([19 + x, 3 + y + dy, `rgba(165,180,252,${alpha})`]); }));
  return out.filter(([, y]) => y >= 0);
}
```

Check `Picture`'s `transform` prop against Skia 2.6 types. If it isn't accepted, wrap the picture in `<Group transform={…}>`.

- [ ] **Step 7: Update `Character.tsx`.** Remove `mini` and `MINI_MAX_SIZE`. Add `attachment`, defaulting the attachment to the provider's `thinkingAttachment` (Task 11) when `mood` is `thinking` or `answering`:

```tsx
export interface CharacterProps {
  characterId?: CharacterId;
  mood: CharacterMood;
  size: number;
  paused?: boolean;
  dimmed?: boolean;
  glow?: boolean;
  /** Overrides the user's thinking attachment; null hides it. */
  attachment?: ThinkingAttachmentId | null;
  accessibilityLabel?: string;
  testID?: string;
}
// …inside:
const attachmentId = attachment === undefined ? current?.thinkingAttachment ?? DEFAULT_THINKING_ATTACHMENT : attachment;
const showsAttachment = mood === 'thinking' || mood === 'answering';
// …
<CharacterCanvas characterId={id} mood={mood} size={size} paused={paused || reduceMotion} attachment={showsAttachment ? attachmentId : null} done={mood === 'answering'} />
```

The wrapping `View` must use `width: showsAttachment && attachmentId && size >= 24 ? size * 1.5 : size` so layout reserves the attachment's room (spec §4).

- [ ] **Step 8: Update the jest mock** `jest-mocks/CharacterCanvas.js`:

```js
module.exports = {
  CharacterCanvas: ({ characterId, mood, size, paused, attachment }) =>
    React.createElement(View, {
      testID: 'character-canvas',
      accessibilityLabel: `character:${characterId}:${mood}:${size}:${paused ? 'paused' : 'playing'}:${attachment ?? 'none'}`,
    }),
};
```

Update the comment in `jest-mocks/characterContext.tsx` (label format), and its `fakeCharacter` default `characterId: 'mochi'`.

- [ ] **Step 9: Update `__tests__/components/Character.test.tsx`.**
  - Replace the mini assertions with: attachment shown only for thinking and answering; hidden (`none`) when `attachment={null}`; the user's provider setting is used when no prop is passed; Reduce Motion gives `paused`.
  - Then sweep every test that matched `:mini` or `:full` (`grep -rln ":mini\|:full" __tests__`). Drop that segment from the expected labels, or replace it with the expected attachment (`none` for every non-thinking call site).

- [ ] **Step 10: Delete the old art and engine files**, and remove `mini` from every call site: `grep -rn "mini" src | grep -v "minimum\|minute"`, and specifically `FloatingTabBar.tsx` (keep size 52). Run `npx tsc --noEmit`. Expected: no errors in `components/characters`. Screens may still fail on hoot ids until Task 15.

- [ ] **Step 11: Run** `npx jest __tests__/characters __tests__/components/Character.test.tsx`. Expected: PASS.

- [ ] **Step 12: Commit.**

```bash
git add -A mobile/src/components/characters mobile/jest-mocks mobile/__tests__
git commit -m "feat(mobile): Skia pixel renderer, moods and thinking attachments; drop vector art"
```

### Task 10: Coach card component

**Files:**
- Create: `mobile/src/components/characters/CoachCard.tsx`
- Test: `mobile/__tests__/components/CoachCard.test.tsx`

**Interfaces:**
- Consumes: `CHARACTERS`, `Character`.
- Produces: `CoachCard({ characterId, tagline?, greeting?, paused?, testID? })`. The `tagline` and `greeting` overrides carry the server copy.

- [ ] **Step 1: Write the failing test.**

```tsx
import { render } from '@testing-library/react-native';
import { CoachCard } from '../../src/components/characters/CoachCard';
import { characterLabel } from '../../jest-mocks/characterContext';

it('shows number, focus, name, tagline and greeting, with the coach idle at 120', () => {
  const s = render(<CoachCard characterId="kit" testID="card" />);
  expect(s.getByText('No.07')).toBeTruthy();
  expect(s.getByText('Bedtime')).toBeTruthy();
  expect(s.getByText('Kit')).toBeTruthy();
  expect(s.getByText('Dry wit. Gently judges your bedtime.')).toBeTruthy();
  expect(characterLabel(s, 'card')).toBe('character:kit:idle:120:playing:none');
});

it('prefers server copy when given', () => {
  const s = render(<CoachCard characterId="kit" tagline="Server tagline" greeting="Server hi" />);
  expect(s.getByText('Server tagline')).toBeTruthy();
  expect(s.getByText('Server hi')).toBeTruthy();
});
```

- [ ] **Step 2: Run and check that it fails.**

- [ ] **Step 3: Implement**, following `02-coach-cards.html`: art panel 176 pt tall with an accent tint (10 % → 4 % gradient), a dotted pattern (Skia-free: a repeated `View` dot grid is too heavy, so use a tinted panel with an `ImageBackground` of a tiny generated dot SVG via `react-native-svg` if available, otherwise only the tint and glow), sprite 120 pt, "No.NN" top-left in the mono font, a focus chip top-right (accent at 16 % background, accent text), then name (20 pt bold), tagline (muted, 13 pt) and a greeting bubble with a tail.

```tsx
import React from 'react';
import { View } from 'react-native';
import { Character } from './Character';
import { CHARACTERS } from './registry';
import type { CharacterId } from './types';
import { Text } from '../ui/text';

const withAlpha = (hex: string, a: number) => `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}`;

export function CoachCard({ characterId, tagline, greeting, paused = false, testID }: {
  characterId: CharacterId; tagline?: string; greeting?: string; paused?: boolean; testID?: string;
}) {
  const c = CHARACTERS[characterId];
  return (
    <View testID={testID} className="overflow-hidden rounded-[24px] border border-border bg-card">
      <View style={{ height: 176, backgroundColor: withAlpha(c.accent, 0.08) }} className="items-center justify-center">
        <Text className="absolute left-3.5 top-3 font-mono text-[11px] text-muted-foreground">{`No.${String(c.number).padStart(2, '0')}`}</Text>
        <View className="absolute right-3 top-2.5 rounded-full px-2.5 py-1" style={{ backgroundColor: withAlpha(c.accent, 0.16) }}>
          <Text className="text-[11px] font-semibold" style={{ color: c.accent }}>{c.focus}</Text>
        </View>
        <Character characterId={characterId} mood="idle" size={120} glow paused={paused} attachment={null} />
      </View>
      <View className="gap-2 px-4 pb-4 pt-3.5">
        <Text className="text-xl font-bold">{c.name}</Text>
        <Text className="text-[13px] text-muted-foreground">{tagline ?? c.tagline}</Text>
        <View className="rounded-[14px] border border-border bg-muted px-3 py-2.5">
          <Text className="text-[13px]">{greeting ?? c.greeting}</Text>
        </View>
      </View>
    </View>
  );
}
```

Leave out the dotted pattern unless `react-native-svg` is already a dependency (`grep react-native-svg mobile/package.json`). If it is, add a 12 pt dot `Pattern` at 16 % accent behind the sprite. Don't add a dependency only for this.

- [ ] **Step 4: Run.** Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add mobile/src/components/characters/CoachCard.tsx mobile/__tests__/components/CoachCard.test.tsx
git commit -m "feat(mobile): coach card"
```

### Task 11: Thinking settings in the API, provider and cache

**Files:**
- Modify: `mobile/src/api/coach.ts` (`CoachStatusDTO` ~34, `fetchCoachStatus` ~392, after `setCoachPersona` ~429)
- Modify: `mobile/src/characters/CharacterContext.ts`, `CharacterProvider.tsx`, `characterCache.ts`
- Modify: `mobile/jest-mocks/characterContext.tsx`
- Test: `mobile/__tests__/api/coach.test.ts`, `__tests__/characters/CharacterProvider.test.tsx`, `__tests__/characters/characterCache.test.ts`

**Interfaces:**
- Produces:
  - `CoachStatusDTO.thinkingAttachment: ThinkingAttachmentId` and `CoachStatusDTO.thinkingText: ThinkingTextId`, always filled; unknown or missing values become the defaults (Review Focus 2).
  - `setCoachThinking(body: { attachment?: ThinkingAttachmentId; text?: ThinkingTextId }): Promise<{ thinkingAttachment: string; thinkingText: string }>`.
  - `CharacterContextValue` gains `thinkingAttachment: ThinkingAttachmentId`, `thinkingText: ThinkingTextId` and `chooseThinking(body): Promise<void>` (optimistic, rolled back on failure, rethrows).
  - Cache: `readCachedThinking(): Promise<{ attachment: ThinkingAttachmentId; text: ThinkingTextId } | null>`, `writeCachedThinking(v)`, and `clearCachedCharacter` also clears thinking.

- [ ] **Step 1: Write the failing tests.**

```ts
// __tests__/api/coach.test.ts
it('fills the thinking defaults when the server predates them (Review Focus 2)', async () => {
  mockFetchJson({ enabled: true, consented: true, consent: {}, personaId: 'mochi', personaChosen: true, personas: [] });
  const s = await fetchCoachStatus();
  expect(s.thinkingAttachment).toBe('bulb');
  expect(s.thinkingText).toBe('steps');
});

it('replaces unknown thinking ids with the defaults', async () => {
  mockFetchJson({ enabled: false, personaId: 'mochi', thinkingAttachment: 'rocket', thinkingText: 42 });
  const s = await fetchCoachStatus();
  expect([s.thinkingAttachment, s.thinkingText]).toEqual(['bulb', 'steps']);
});

it('PUTs thinking settings', async () => {
  const spy = mockFetchJson({ thinkingAttachment: 'gears', thinkingText: 'steps' });
  await setCoachThinking({ attachment: 'gears' });
  expect(spy).toHaveBeenCalledWith(expect.stringContaining('/me/coach/thinking'), expect.objectContaining({ method: 'PUT', body: JSON.stringify({ attachment: 'gears' }) }));
});
```

(Use the file's existing fetch-mock helper in place of `mockFetchJson`.)

```tsx
// __tests__/characters/CharacterProvider.test.tsx
it('switches the thinking text at once and rolls back when the save fails', async () => {
  (setCoachThinking as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  const { result } = renderProvider(/* existing helper */);
  await waitFor(() => expect(result.current.thinkingText).toBe('steps'));
  let failed = false;
  await act(async () => { await result.current.chooseThinking({ text: 'dialog' }).catch(() => { failed = true; }); });
  expect(failed).toBe(true);
  expect(result.current.thinkingText).toBe('steps');
});

it('uses the server values once the status arrives and caches them', async () => {
  (fetchCoachStatus as jest.Mock).mockResolvedValueOnce({ ...status, thinkingAttachment: 'clock', thinkingText: 'tag' });
  const { result } = renderProvider();
  await waitFor(() => expect(result.current.thinkingAttachment).toBe('clock'));
  expect(writeCachedThinking).toHaveBeenCalledWith({ attachment: 'clock', text: 'tag' });
});
```

```ts
// __tests__/characters/characterCache.test.ts
it('reads cached thinking settings and rejects unknown ids', async () => {
  SecureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify({ attachment: 'gears', text: 'nope' }));
  expect(await readCachedThinking()).toEqual({ attachment: 'gears', text: 'steps' });
  SecureStore.getItemAsync.mockResolvedValueOnce('not json');
  expect(await readCachedThinking()).toBeNull();
});
```

- [ ] **Step 2: Run and check that they fail.**

- [ ] **Step 3: Implement.**
  - In `coach.ts`: add the two fields to `CoachStatusDTO` and `DISABLED_STATUS` (the defaults). In `fetchCoachStatus`'s `persona` object, add `thinkingAttachment: isThinkingAttachment(res.thinkingAttachment) ? res.thinkingAttachment : DEFAULT_THINKING_ATTACHMENT` and the same for text. Add:

```ts
export function setCoachThinking(body: { attachment?: ThinkingAttachmentId; text?: ThinkingTextId }) {
  return coachFetch<{ thinkingAttachment: string; thinkingText: string }>('/me/coach/thinking', json('PUT', body));
}
```

  - In `characterCache.ts`, add key `'thinking'`:

```ts
const THINKING_KEY = 'thinking';
export async function readCachedThinking(): Promise<{ attachment: ThinkingAttachmentId; text: ThinkingTextId } | null> {
  try {
    const raw = await SecureStore.getItemAsync(THINKING_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { attachment?: unknown; text?: unknown };
    return {
      attachment: isThinkingAttachment(v.attachment) ? v.attachment : DEFAULT_THINKING_ATTACHMENT,
      text: isThinkingText(v.text) ? v.text : DEFAULT_THINKING_TEXT,
    };
  } catch {
    return null;
  }
}
export async function writeCachedThinking(v: { attachment: ThinkingAttachmentId; text: ThinkingTextId }) {
  try { await SecureStore.setItemAsync(THINKING_KEY, JSON.stringify(v)); } catch { /* a look only */ }
}
```

    Make `clearCachedCharacter` also `deleteItemAsync(THINKING_KEY)` (each delete in its own try). Change the comment "shows Hoot" to "shows Mochi".
  - In `CharacterProvider.tsx`:
    - Add state `thinkingAttachment` / `thinkingText`, initialised to the defaults.
    - In `applyStatus`, set both from `merged` and call `writeCachedThinking`.
    - In the account effect, reset both to the defaults when signed out. When signed in, read `readCachedThinking()` with the same epoch and `serverKnown` guard as the character.
    - Add `chooseThinking`, which mirrors `chooseCharacter`: capture the previous values, set the new values optimistically, `await setCoachThinking(body)`, and on failure restore the previous values (same epoch check) and rethrow.
    - Expose all three in `value`.
    - Change the comments "always Hoot" to "always Mochi".
  - Add the three fields to `CharacterContextValue` and to `fakeCharacter` (`thinkingAttachment: 'bulb'`, `thinkingText: 'steps'`, `chooseThinking: jest.fn(async () => {})`).

- [ ] **Step 4: Run** `npx jest __tests__/api/coach.test.ts __tests__/characters`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add mobile/src/api/coach.ts mobile/src/characters mobile/jest-mocks mobile/__tests__/api mobile/__tests__/characters
git commit -m "feat(mobile): thinking settings in coach status, provider and cache"
```

### Task 12: Progress steps from the stream

**Files:**
- Modify: `mobile/src/api/coach.ts:97` (`CoachStreamEvent` status), `mobile/src/api/coachStream.ts:66` (`parseCoachEvent` status case), `mobile/src/lib/useCoachConversation.ts` (~119, ~187)
- Test: `mobile/__tests__/api/coachStream.test.ts`, `mobile/__tests__/lib/useCoachConversation.test.tsx`

**Interfaces:**
- Produces:
  - Status event `{ type: 'status'; label: string; step?: 'route' | 'facts' | 'write'; conversationId?: string }`.
  - `useCoachConversation` returns `steps: ThinkingStep[]` where `ThinkingStep = { id: string; label: string; done: boolean }`. It is reset on each send, a step is ticked when the next one arrives, and the last step is ticked on the first `text` event. `statusLabel` stays as is.

- [ ] **Step 1: Write the failing tests.**

```ts
// coachStream.test.ts
it('parses an optional step on status', () => {
  expect(parseCoachEvent({ event: 'status', data: JSON.stringify({ label: 'Writing it up…', step: 'write' }) })).toEqual({ type: 'status', label: 'Writing it up…', step: 'write' });
  expect(parseCoachEvent({ event: 'status', data: JSON.stringify({ label: 'Thinking…', step: 'dance' }) })).toEqual({ type: 'status', label: 'Thinking…' });
});
```

```tsx
// useCoachConversation.test.tsx — use the file's fake stream helper (jest-mocks/coachStreamFake.ts)
it('builds the steps list, ticking each step when the next arrives (Review Focus 3)', async () => {
  const { result, stream } = setup();
  act(() => result.current.send('How did I sleep?'));
  act(() => stream.emit({ type: 'status', step: 'route', label: 'Looking at your sleep…' }));
  expect(result.current.steps).toEqual([{ id: 'route', label: 'Looking at your sleep…', done: false }]);
  act(() => stream.emit({ type: 'status', step: 'facts', label: 'Going through your recent nights…' }));
  expect(result.current.steps.map((s) => s.done)).toEqual([true, false]);
  act(() => stream.emit({ type: 'text', sentence: 'You slept well.' }));
  expect(result.current.steps.every((s) => s.done)).toBe(true);
});

it('shows a stepless status (older server) as one step', async () => {
  const { result, stream } = setup();
  act(() => result.current.send('hi'));
  act(() => stream.emit({ type: 'status', label: 'Thinking…' }));
  expect(result.current.steps).toEqual([{ id: 'status', label: 'Thinking…', done: false }]);
});

it('keeps the steps it has when the stream errors after the first one', async () => {
  const { result, stream } = setup();
  act(() => result.current.send('hi'));
  act(() => stream.emit({ type: 'status', step: 'route', label: 'Thinking it over…' }));
  act(() => stream.emit({ type: 'error', code: 'internal', retryable: true }));
  expect(result.current.steps).toHaveLength(1);
});
```

- [ ] **Step 2: Run and check that they fail.**

- [ ] **Step 3: Implement.**
  - In `parseCoachEvent`'s status case, add `...(data.step === 'route' || data.step === 'facts' || data.step === 'write' ? { step: data.step } : {})`.
  - In the hook, add `const [steps, setSteps] = useState<ThinkingStep[]>([])` and reset it with `setSteps([])` wherever `setStatusLabel(null)` is reset at the start of a send.
  - In the `'status'` case:

```ts
          setSteps((prev) => {
            const id = event.step ?? 'status';
            if (prev.some((s) => s.id === id)) return prev.map((s) => (s.id === id ? { ...s, label: event.label } : s));
            return [...prev.map((s) => ({ ...s, done: true })), { id, label: event.label, done: false }];
          });
```

  - In the `'text'` case, add `setSteps((prev) => (prev.some((s) => !s.done) ? prev.map((s) => ({ ...s, done: true })) : prev));`.
  - Export `ThinkingStep` and return `steps`.

- [ ] **Step 4: Run.** Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add mobile/src/api mobile/src/lib/useCoachConversation.ts mobile/__tests__/api mobile/__tests__/lib
git commit -m "feat(mobile): progress steps from the coach stream"
```

### Task 13: Thinking text styles and the Coach screen pending row

**Files:**
- Create: `mobile/src/components/coach/thinking/ThinkingRow.tsx` (picks the style), and one file per style: `Lines.tsx`, `Placeholder.tsx`, `Tag.tsx`, `Typewriter.tsx`, `Nameplate.tsx`, `Steps.tsx`, `Shimmer.tsx`, `Bouncy.tsx`, `Dialog.tsx`, `Strip.tsx`
- Create: `mobile/src/components/coach/thinking/useThinkingLine.ts`
- Add: `mobile/assets/fonts/Silkscreen-Regular.ttf` (download it from Google Fonts' Silkscreen family, OFL; add `OFL.txt` next to it)
- Modify: `mobile/App.tsx` (load the font), `mobile/src/screens/CoachScreen.tsx:503-512`, and `CoachMessageRow` (the streaming assistant message, for B and I)
- Test: `mobile/__tests__/components/ThinkingRow.test.tsx`, `mobile/__tests__/screens/CoachScreen.test.tsx` (update)

**Interfaces:**
- Consumes: `steps` (Task 12), `thinkingText` from the provider (Task 11), `CHARACTERS[id].thinkingLines`, `Character` (Task 9).
- Produces:
  - `ThinkingRow({ style: ThinkingTextId, characterId, steps: ThinkingStep[], paused, testID })`.
  - `useThinkingLine(characterId, paused): { line: string; index: number }`, which rotates every 2.4 s.
  - `REPLY_FRAME_STYLES = ['placeholder', 'dialog'] as const`, the styles whose frame wraps the streaming answer.
  - `ReplyFrame({ style, characterId, children })`, used by `CoachMessageRow` for the in-progress assistant message when the style is in `REPLY_FRAME_STYLES`.

- [ ] **Step 1: Install the font loader.** Run `npx expo install expo-font` (pods change, so the simulator build needs `pod install` and a rebuild; see Task 16). In `App.tsx`, call `useFonts({ Silkscreen: require('./assets/fonts/Silkscreen-Regular.ttf') })`. Don't block rendering on it: the styles fall back to the system mono font until it loads.

- [ ] **Step 2: Write the failing tests** `ThinkingRow.test.tsx`:

```tsx
import { render, act } from '@testing-library/react-native';
import { ThinkingRow } from '../../src/components/coach/thinking/ThinkingRow';
import { THINKING_TEXTS } from '../../src/components/characters/thinking';
import { characterLabel } from '../../jest-mocks/characterContext';

const steps = [
  { id: 'route', label: 'Looking at your sleep…', done: true },
  { id: 'facts', label: 'Going through your recent nights…', done: false },
];

it.each(THINKING_TEXTS)('%s renders the coach thinking at 36pt with its text', (style) => {
  const s = render(<ThinkingRow style={style} characterId="luna" steps={steps} paused testID="row" />);
  expect(characterLabel(s, 'row')).toMatch(/^character:luna:thinking:36:paused:/);
  expect(s.toJSON()).toBeTruthy();
});

it('steps shows the real steps, ticking finished ones', () => {
  const s = render(<ThinkingRow style="steps" characterId="luna" steps={steps} paused testID="row" />);
  expect(s.getByText('Going through your recent nights…')).toBeTruthy();
  expect(s.getByTestId('thinking-step-route-done')).toBeTruthy();
  expect(s.getByTestId('thinking-step-facts-active')).toBeTruthy();
});

it('steps falls back to a personality line before the first status arrives (Review Focus 3)', () => {
  const s = render(<ThinkingRow style="steps" characterId="luna" steps={[]} paused testID="row" />);
  expect(s.getByText(/Luna is counting stars/)).toBeTruthy();
});

it('lines rotates through the coach\'s three lines', () => {
  jest.useFakeTimers();
  const s = render(<ThinkingRow style="lines" characterId="kit" steps={[]} paused={false} testID="row" />);
  expect(s.getByText(/pretending not to care/)).toBeTruthy();
  act(() => { jest.advanceTimersByTime(2400); });
  expect(s.getByText(/judging your bedtime/)).toBeTruthy();
  jest.useRealTimers();
});

it('nameplate, shimmer and bouncy name the coach', () => {
  for (const style of ['nameplate', 'shimmer', 'bouncy'] as const) {
    const s = render(<ThinkingRow style={style} characterId="pengu" steps={[]} paused testID="row" />);
    expect(s.getAllByText(/Pengu/).length).toBeGreaterThan(0);
  }
});
```

- [ ] **Step 3: Run and check that they fail.**

- [ ] **Step 4: Implement `useThinkingLine` and `ThinkingRow`.**

```ts
// useThinkingLine.ts
import { useEffect, useState } from 'react';
import { CHARACTERS } from '../../characters/registry';
import type { CharacterId } from '../../characters/types';

export const LINE_MS = 2400;

export function useThinkingLine(id: CharacterId, paused: boolean) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % 3), LINE_MS);
    return () => clearInterval(t);
  }, [paused]);
  return { line: CHARACTERS[id].thinkingLines[index]!, index };
}
```

```tsx
// ThinkingRow.tsx
import React from 'react';
import { View } from 'react-native';
import { Character } from '../../characters/Character';
import type { ThinkingTextId } from '../../characters/thinking';
import type { CharacterId } from '../../characters/types';
import type { ThinkingStep } from '../../../lib/useCoachConversation';
import { Lines } from './Lines';
import { Placeholder } from './Placeholder';
import { Tag } from './Tag';
import { Typewriter } from './Typewriter';
import { Nameplate } from './Nameplate';
import { Steps } from './Steps';
import { Shimmer } from './Shimmer';
import { Bouncy } from './Bouncy';
import { Dialog } from './Dialog';
import { Strip } from './Strip';

export interface ThinkingStyleProps { characterId: CharacterId; steps: ThinkingStep[]; paused: boolean }
const STYLES: Record<ThinkingTextId, React.ComponentType<ThinkingStyleProps>> = {
  lines: Lines, placeholder: Placeholder, tag: Tag, typewriter: Typewriter, nameplate: Nameplate,
  steps: Steps, shimmer: Shimmer, bouncy: Bouncy, dialog: Dialog, strip: Strip,
};

// The Coach screen's "a reply is on its way" row (spec §5). Nameplate puts its
// text under the coach; every other style sits beside it.
export function ThinkingRow({ style, characterId, steps, paused, testID }: ThinkingStyleProps & { style: ThinkingTextId; testID?: string }) {
  const Body = STYLES[style];
  const coach = <Character characterId={characterId} mood="thinking" size={36} paused={paused} />;
  return (
    <View testID={testID} className="flex-row items-end gap-1.5" accessibilityLiveRegion="polite">
      {style === 'nameplate' ? <Nameplate characterId={characterId} steps={steps} paused={paused} coach={coach} /> : <>{coach}<View className="flex-1"><Body characterId={characterId} steps={steps} paused={paused} /></View></>}
    </View>
  );
}
```

(Give `Nameplate` an extra `coach` prop and stack it above the pill. Its `STYLES` entry is never rendered through `Body`.)

- [ ] **Step 5: Implement the ten styles.** Each is a small component. The behaviour comes from spec §5, the look from `05-thinking-text-a-c.html` / `06-thinking-text-d-j.html`. The accent always comes from `CHARACTERS[id].accent`:
  - `Lines`: `<Text>` with the name in the accent (semibold) + " is " + line + dots (0–3, every 400 ms, with `useSpriteClock`).
  - `Placeholder`: a bubble (`rounded-2xl rounded-bl-sm bg-muted border`), the line "**Name** is line…" (the A-in-B combination), and 3 bars (92 %, 74 %, 48 % width, 8 pt high) with a Reanimated opacity pulse between 0.35 and 0.8 in the accent.
  - `Tag`: a bordered tag (accent at 10 % background, 2 pt accent-at-35 % border), an 8×8 block blinking at 1 s steps, "THINKING" in `Silkscreen` 12 pt in the accent, with the line under it in muted 12 pt.
  - `Typewriter`: types `${name} is ${line}…` at 45 ms per character, holds until 3.2 s, erases at 20 ms per character, then moves to the next line, plus a blinking 2×14 caret in the accent. Driven by `useSpriteClock` (`t % 4200`), no extra timers.
  - `Nameplate`: the coach, with a pill under it: `"${name} · thinking" + dots`.
  - `Steps`: one row per step. Done rows are muted with an accent "✓" and testID `thinking-step-${id}-done`. The active row is in the text colour with a braille spinner `'⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'[floor(t/90)%10]` in the accent, the label, and testID `thinking-step-${id}-active`. With an empty list it renders `Lines`. A step that turns done is kept visible for at least 300 ms before the row unmounts: the parent `CoachScreen` keeps `ThinkingRow` mounted for 300 ms after `waiting` turns false when `style === 'steps'`.
  - `Shimmer`: "Name is thinking" with a Reanimated `translateX` sweep of an accent `LinearGradient` mask, or, if `expo-linear-gradient` isn't installed, an opacity pulse between muted and the accent. Then the seconds since mount, `Math.floor(t/1000)`, in tabular numerals.
  - `Bouncy`: "Name is " + each letter of "thinking" as its own `Text`, with letter `floor(t/110)%12` translated −2 pt, in the accent.
  - `Dialog`: a `View` with a 3 pt `#E5E7EB` border, 4 pt radius, `#0F1020` background and an outer 2 pt accent ring (nested views); a name tab (accent background, dark text, Silkscreen 11 pt) at top −13; the line typing at 55 ms per character in Silkscreen 12 pt; a "▼" in the accent, hopping 2 pt every 600 ms.
  - `Strip`: a card (`rounded-[14px] bg-muted border`) with a 3 pt top track (accent at 16 %) and a 30 %-wide accent bar sliding left to right over 1.6 s (Reanimated `withRepeat`), then "**Name** is line…".

  Reduce Motion (`paused`) freezes every one on its first frame and keeps all text readable.

- [ ] **Step 6: Implement `ReplyFrame` for B and I** in `components/coach/thinking/ReplyFrame.tsx`:
  - `placeholder` wraps the children in the same bubble classes as `Placeholder`.
  - `dialog` wraps them in the same box as `Dialog` and sets the children's font to Silkscreen.
  - In `CoachMessageRow`, when the message is the streaming assistant message (`streaming && isLast && role === 'assistant'`) and the user's `thinkingText` is in `REPLY_FRAME_STYLES`, render the text inside `<ReplyFrame style={…} characterId={…}>`. Once the turn is `done` it renders as a normal message, so history looks the same for every style.

- [ ] **Step 7: Wire `CoachScreen`.** Replace the `ThoughtLine` block (lines ~503–512) with:

```tsx
            {showThinking ? (
              <View className="items-start">
                <ThinkingRow style={characterCtx?.thinkingText ?? DEFAULT_THINKING_TEXT} characterId={characterId} steps={steps} paused={!focused} testID="coach-thinking" />
              </View>
            ) : null}
```

where `showThinking = waiting || lingering`, and `lingering` is a 300 ms hold after `waiting` turns false, only when the style is `steps` (a `useEffect` on `waiting` sets it and clears it with a timeout). Take `steps` from the conversation hook. Remove the 20 pt `coach-thinking-character` (the tests that targeted it now target `coach-thinking`). Keep `ThoughtLine` only if other screens use it (`grep -rn ThoughtLine src`).

- [ ] **Step 8: Update `CoachScreen.test.tsx`.** The thinking assertions now expect the `coach-thinking` row with `character:<id>:thinking:36:…:bulb`. Add one test: with `thinkingText: 'dialog'`, the streaming answer renders inside the dialog frame.

- [ ] **Step 9: Run** `npx jest __tests__/components/ThinkingRow.test.tsx __tests__/screens/CoachScreen*.test.tsx`. Expected: PASS.

- [ ] **Step 10: Commit.**

```bash
git add mobile/src/components/coach/thinking mobile/src/screens/CoachScreen.tsx mobile/src/components/coach mobile/assets/fonts mobile/App.tsx mobile/package.json mobile/package-lock.json mobile/__tests__
git commit -m "feat(mobile): ten thinking text styles in the coach chat, steps by default"
```

### Task 14: Grid + card-sheet picker

**Files:**
- Modify: `mobile/src/screens/MeetYourCoachScreen.tsx` (rewrite the body; keep `serverCopy`, `pageCopy`, `choose`)
- Test: `mobile/__tests__/screens/MeetYourCoachScreen.test.tsx`, `CoachScreenMeetYourCoach.test.tsx`

**Interfaces:**
- Consumes: `CoachCard`, `CHARACTER_IDS`, `CHARACTERS`, `useCharacter().chooseCharacter`.
- Produces: testIDs `meet-tile-<id>` (button, `accessibilityState.selected`), `meet-sheet`, `meet-choose`, `meet-skip`, `meet-close`, `meet-error`, `meet-tagline-<id>` and `meet-greeting-<id>` (inside the card).

- [ ] **Step 1: Write the failing tests** (replace the pager and dot tests):

```tsx
it('shows all 15 coaches in a grid, only the selected one animating', () => {
  const s = renderMeet({ mode: 'first' });
  for (const id of CHARACTER_IDS) expect(s.getByTestId(`meet-tile-${id}`)).toBeTruthy();
  expect(characterLabel(s, 'meet-tile-mochi')).toMatch(/:playing:/);
  expect(characterLabel(s, 'meet-tile-kit')).toMatch(/:paused:/);
});

it('opens the card sheet on tap and chooses that coach', async () => {
  const chooseCharacter = jest.fn(async () => {});
  const s = renderMeet({ mode: 'switch' }, { chooseCharacter, characterId: 'mochi' });
  fireEvent.press(s.getByTestId('meet-tile-kit'));
  expect(s.getByTestId('meet-sheet')).toBeTruthy();
  expect(s.getByText('Dry wit. Gently judges your bedtime.')).toBeTruthy();
  await act(async () => fireEvent.press(s.getByTestId('meet-choose')));
  expect(chooseCharacter).toHaveBeenCalledWith('kit');
});

it('Skip saves Mochi', async () => {
  const chooseCharacter = jest.fn(async () => {});
  const s = renderMeet({ mode: 'first' }, { chooseCharacter });
  await act(async () => fireEvent.press(s.getByTestId('meet-skip')));
  expect(chooseCharacter).toHaveBeenCalledWith('mochi');
});

it('labels tiles with name and focus for screen readers', () => {
  const s = renderMeet({ mode: 'first' });
  expect(s.getByTestId('meet-tile-luna').props.accessibilityLabel).toBe('Luna, Sleep');
});
```

Keep the existing error-path tests (switch-mode save failure shows `meet-error`; first-mode failure toasts and closes) and repoint them to `meet-choose` in the sheet.

- [ ] **Step 2: Run and check that they fail.**

- [ ] **Step 3: Implement.**
  - **Header:** unchanged. Skip calls `choose('mochi')`.
  - **Grid:** a `ScrollView` with a `flex-row flex-wrap` grid, 3 columns with an 8 pt gap. Each tile is a `Pressable` with `testID={\`meet-tile-${id}\`}`, `accessibilityRole="button"`, `accessibilityLabel={\`${name}, ${focus}\`}` and `accessibilityState={{ selected }}`. It is 96 pt tall and `rounded-2xl bg-card border`, with a selected ring `border-foreground`. Inside: `<Character characterId={id} mood="idle" size={56} paused={!selected} attachment={null} />` and the name in 11 pt.
  - **Selection:** `useState<CharacterId>`. First mode starts on `'mochi'`; switch mode starts on the current `characterId`.
  - **Sheet:** a React Native `Modal` (`transparent`, `animationType="slide"`, `testID="meet-sheet"`) opened by a tile press. Inside, a bottom-anchored `View` (`rounded-t-3xl bg-background`, grab handle) holding `<CoachCard characterId={selected} tagline={copy.tagline} greeting={copy.greeting} />`, the error text and `<Button testID="meet-choose">{\`Choose ${name}\`}</Button>`. On open, move accessibility focus to the card name (`AccessibilityInfo.setAccessibilityFocus` on a ref).
  - Remove the `FlatList` pager, the dots and `DOT_TARGET`/`ART_SIZE`.
  - Change the docstring at the top to describe the grid and sheet (spec §9).

- [ ] **Step 4: Run** both picker test files. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add mobile/src/screens/MeetYourCoachScreen.tsx mobile/__tests__/screens
git commit -m "feat(mobile): grid + card-sheet coach picker"
```

### Task 15: Settings screens, remaining call sites, dev gallery, docs

**Files:**
- Create: `mobile/src/screens/ThinkingStyleScreen.tsx`, `mobile/src/screens/ThinkingTextScreen.tsx`
- Modify: `mobile/src/navigation/RootNavigator.tsx` (param list ~53–63, screens ~138–145), `mobile/src/screens/SettingsScreen.tsx:179`
- Modify: `mobile/src/components/onboarding-hero.tsx:54`, `SignUpScreen.tsx:24`, `ForgotPasswordScreen.tsx:42`, `ResetPasswordScreen.tsx:59` (`'hoot'` → `'mochi'`); `screens/dev/CharacterGalleryScreen.tsx`
- Modify: `README.md` (character grid :26–34, table :344–362, the "Skip→Hoot" text); `docs/media/character-*.jpg` (replace with new screenshots in Task 16)
- Test: `mobile/__tests__/screens/ThinkingSettings.test.tsx` (new), `SettingsCoach.test.tsx`, `CharacterGalleryScreen.test.tsx`, plus every suite still naming old ids

**Interfaces:**
- Consumes: `chooseThinking`, `thinkingAttachment`, `thinkingText` (Task 11), `THINKING_*_NAMES` (Task 8), `ThinkingRow` (Task 13).
- Produces: routes `ThinkingStyle: undefined` and `ThinkingText: undefined`; testIDs `settings-thinking-style`, `settings-thinking-text`, `thinking-style-<id>`, `thinking-text-<id>`, `thinking-preview`.

- [ ] **Step 1: Write the failing tests** `ThinkingSettings.test.tsx`:

```tsx
it('lists the 9 attachments with Lightbulb selected by default and saves a choice', async () => {
  const chooseThinking = jest.fn(async () => {});
  const s = render(withCharacter(<ThinkingStyleScreen />, { chooseThinking }));
  for (const id of THINKING_ATTACHMENTS) expect(s.getByTestId(`thinking-style-${id}`)).toBeTruthy();
  expect(s.getByTestId('thinking-style-bulb').props.accessibilityState).toMatchObject({ selected: true });
  await act(async () => fireEvent.press(s.getByTestId('thinking-style-gears')));
  expect(chooseThinking).toHaveBeenCalledWith({ attachment: 'gears' });
});

it('previews with the user\'s own coach', () => {
  const s = render(withCharacter(<ThinkingStyleScreen />, { characterId: 'luna' }));
  expect(characterLabel(s, 'thinking-preview')).toMatch(/^character:luna:/);
});

it('lists the 10 text styles with What it\'s doing selected by default and saves a choice', async () => {
  const chooseThinking = jest.fn(async () => {});
  const s = render(withCharacter(<ThinkingTextScreen />, { chooseThinking }));
  for (const id of THINKING_TEXTS) expect(s.getByTestId(`thinking-text-${id}`)).toBeTruthy();
  expect(s.getByTestId('thinking-text-steps').props.accessibilityState).toMatchObject({ selected: true });
  await act(async () => fireEvent.press(s.getByTestId('thinking-text-dialog')));
  expect(chooseThinking).toHaveBeenCalledWith({ text: 'dialog' });
});

it('shows an error and keeps the old choice when saving fails', async () => {
  const chooseThinking = jest.fn(async () => { throw new Error('offline'); });
  const s = render(withCharacter(<ThinkingTextScreen />, { chooseThinking }));
  await act(async () => fireEvent.press(s.getByTestId('thinking-text-tag')));
  expect(s.getByText(/couldn't be saved/i)).toBeTruthy();
});
```

In `SettingsCoach.test.tsx`, add: the two rows render under "Your coach", show the current choice names ("Lightbulb", "What it's doing"), and navigate to the right route.

- [ ] **Step 2: Run and check that they fail.**

- [ ] **Step 3: Implement the screens.**
  - **`ThinkingStyleScreen`:**
    - A `ScrollView` with an intro line ("What your coach shows while it works on a reply.").
    - A preview card 150 pt tall holding `<Character testID="thinking-preview" mood={previewMood} size={96} attachment={thinkingAttachment} />`. `previewMood` loops `thinking` for 2.4 s, then `answering` for 0.8 s, on a `setInterval`, which is paused under Reduce Motion.
    - A 3-column grid of `Pressable` tiles (`thinking-style-<id>`, `accessibilityRole="radio"`, `accessibilityState={{ selected }}`), each showing `<Character mood="thinking" size={48} attachment={id} paused={!selected} />` and the name.
    - A press calls `chooseThinking({ attachment: id })`. A rejection shows "Your thinking style couldn't be saved. Please try again." under the grid.
  - **`ThinkingTextScreen`:**
    - The same structure, with a chat-like preview `ThinkingRow` at the top (using the selected style and the user's coach).
    - Then a list of rows (`thinking-text-<id>`, `accessibilityRole="radio"`), each with the name, the blurb and a check mark when selected.
    - The preview steps are a fixed sample (the coach's route label for a sleep question), cycling `done` flags every second so `steps` animates in the preview.
  - **Navigation:** register both in `RootNavigator` with titles "Thinking style" and "Thinking text", in the same stack group as `CoachMemory`.
  - **Settings:** under `<YourCoachRow />`, add two `SettingsRow`-style pressables (match the file's existing row component) showing the current name from `THINKING_*_NAMES`, with testIDs `settings-thinking-style` and `settings-thinking-text`.

- [ ] **Step 4: Update the remaining call sites.**
  - Change `'hoot'` to `'mochi'` in the four signed-out files.
  - Rewrite `CharacterGalleryScreen` per spec §9: a section per coach with the 4 moods at 96; a row of the 9 attachments on Mochi at 72; the 10 `ThinkingRow` styles; and the size ladder 18/20/36/40/52/64/120/180.
- [ ] **Step 5: Sweep the tests.** Run the whole mobile suite (`npx jest`). For each failure caused by old ids (`hoot`, `pip`, `nimbus`, `ember`, `beep`, `doze`, `beat`), the `mini` label segment or the 8-item roster:
  - "the default coach" → `mochi`
  - "some other coach" → `kit`
  - counts 8 → 15

  Do not skip tests. Expected at the end: all suites pass.
- [ ] **Step 6: README.** Replace the character table with the 15 coaches (name, what it is, focus), change the Skip text to Mochi, and point the image grid at `docs/media/coach-<id>.png` (created in Task 16).
- [ ] **Step 7: Commit.**

```bash
git add mobile README.md
git commit -m "feat(mobile): thinking settings screens, Mochi everywhere, dev gallery"
```

### Task 16: Verify on the simulator and open the PR

**Files:** `docs/media/coach-*.png` (new screenshots); delete `docs/media/character-*.jpg` once nothing references them.

- [ ] **Step 1: Full suites.**
  - Mobile: `cd mobile && npx jest`. Expected: all pass. Record the suite and test counts.
  - Backend: as in Task 5, with no live backend running.
  - Type checks: `npx tsc --noEmit` in both `mobile` and `backend`.
- [ ] **Step 2: Build and run** (see the handoff's §5 and memory `biometrics-ios-run-setup`).
  - Sync the run copy: `rsync -a --delete --exclude node_modules --exclude ios --exclude .env --exclude .expo mobile/ ~/dev/biometrics-run/mobile/`.
  - Install dependencies and pods (`expo-font` is new): `npm install`, then `cd ios && pod install`.
  - Build with xcodebuild (the command from the handoff), install the app on the iPhone 18 Pro simulator, and start Metro with `--clear`.
  - Start the backend with `npx prisma migrate deploy && npm run build && node --env-file=.env dist/server.js`.
- [ ] **Step 3: Check on screen**, in dark and light mode. Note every check you could not do; don't claim it.
  - The picker: 15 tiles, the sheet, Choose, Skip → Mochi.
  - The tab hub at 52.
  - Home tile and digest card.
  - The Coach screen in all 4 moods.
  - At least 3 attachments and 3 text styles, including `steps` on a general question ("how much sleep do adults need?" shows "Thinking it over…", then "Checking your goals…").
  - `dialog` with an answer streaming inside it.
  - Reduce Motion.
  - The Coach screen with 30+ messages (scroll performance).
- [ ] **Step 4: Screenshots.** Capture each coach's card from the dev gallery into `docs/media/coach-<id>.png` (`xcrun simctl io booted screenshot`, cropped), and update the README image grid.
- [ ] **Step 5: Commit and push.**

```bash
git add docs/media README.md
git commit -m "docs: pixel coach screenshots"
git push
```

- [ ] **Step 6: Open a draft PR** to `main` (check the base branch, per the handoff's lesson).

```bash
gh pr create --draft --base main --title "Pixel coaches: 15 new coaches, card picker, thinking settings" --body-file <(printf '%s\n' "Implements docs/superpowers/specs/2026-10-01-pixel-coaches-design.md." "" "- 15 symmetrical pixel coaches (Mochi kept), soft outline, shared moods" "- Grid + card-sheet picker; Mochi default; retired choices cleared by migration" "- Thinking attachment (9, Lightbulb default) and thinking text (10, steps default) settings" "- Route-specific progress steps in the answer stream" "" "Tests: <mobile counts>, <backend counts>. Simulator checks: <list>.")
gh pr view --json baseRefName -q .baseRefName   # must print: main
```

Before running it, fill in the real counts and checks in the body. No Claude attribution.
