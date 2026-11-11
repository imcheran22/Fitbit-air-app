# KIP colour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each user picks their KIP's colour in Profile. It is stored on the account, and every person in the app is
drawn as a KIP in their colour, with a pose that follows their mood.

**Architecture:**
- **Backend:** one `kipColour` column on `User`, validated against a 10-name list. The shared `Person` record carries
  it, so every buddy route gets it at once. The camp banner gets a parallel `faceColours` list.
- **Mobile:** a tiny store holds your colour (loaded once per sign-in, cleared on sign-out). One component,
  `PersonKip`, draws every person; it crops the KIP grid so small slots stay crisp.

**Tech Stack:**
- Backend: Express, Prisma/Postgres, Jest with supertest.
- Mobile: Expo/React Native, NativeWind, react-native-svg, Jest with React Native Testing Library.

Spec: `docs/superpowers/specs/2026-10-13-kip-colour-design.md`.

## Global Constraints

- **Branch:** `feature/home-f`. Worktree: `/Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/home-f`.
- **Commits:** no attribution. No Co-Authored-By, and no mention of Claude, Cursor or AI. Never push to main, never
  force-push, never bare `git stash`.
- **Buttons:** every button is `mobile/src/components/ui/button.tsx`, with `rounded-lg`. A raw
  `Pressable`/`PressableScale` with a button or radio role needs an entry in
  `mobile/__tests__/conventions/buttons.test.ts`.
- **Type:** only the A4 type tokens (`text-score`, `text-number`, `text-display`, `text-heading`, `text-headline`,
  `text-body`, `text-caption`, `text-fine`, `text-page-title`, `text-label`). No new inline font sizes.
- **Strings** live in copy modules.
- **Logging:** never log health values, dates, names, emails or tokens.
- **Dates:** never `new Date('YYYY-MM-DD')`.
- **Frozen files:** `CampScene.tsx` and `CampBanner.tsx` are frozen. The freeze is lifted for Task 7 only, and only
  for the sprite element, its import and the colour lookup.
- **TDD:** run the touched tests plus both typechecks before every commit.
- **Mobile commands**, from `mobile/` (run the `export` line first):
  - `export PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH`
  - Tests: `node node_modules/.bin/jest --forceExit --no-watchman <paths>`
  - Typecheck: `node node_modules/.bin/tsc --noEmit --types jest,node --pretty false | grep -c "error TS"`. The
    baseline is **10**, and it must not rise.
- **Backend commands**, from `backend/`. Never run two backend test runs at once, and never print the database URL:
  - Tests:

    ```bash
    URL=$(grep -E '^TEST_DATABASE_URL=' ~/dev/biometrics-run/backend/.env | head -1 | cut -d= -f2- | tr -d '"'); TEST_DATABASE_URL="$URL" DATABASE_URL="$URL" REDIS_URL=redis://localhost:6379/1 NODE_OPTIONS=--experimental-vm-modules node node_modules/.bin/jest --forceExit <paths>
    ```

  - Typecheck: `node node_modules/.bin/tsc --noEmit -p .`, which must report 0 errors.
  - After a schema change: `npx prisma generate`.

---

### Task 1: Backend: store, save and share the colour

**Files:**
- Create: `backend/src/kip/colours.ts`
- Create: `backend/src/kip/routes.ts`
- Create: `backend/prisma/migrations/20261013170000_kip_colour/migration.sql`
- Modify: `backend/prisma/schema.prisma` (model `User`, next to `coachPersonaId` at about line 92)
- Modify: `backend/src/buddies/people.ts`
- Modify: `backend/src/buddies/handles.ts` (`getIdentity`, about line 16)
- Modify: `backend/src/social/stories.ts` (about lines 27, 109–121)
- Modify: `backend/src/social/home.ts` (about lines 28 and 63)
- Modify: `backend/src/app.ts` (register the router after `buddiesRouter`)
- Test: `backend/tests/kip/colour.test.ts` (new)
- Test: `backend/tests/social/home.test.ts` and `backend/tests/social/homeCamp.test.ts` (add `faceColours`)

**Interfaces:**
- Produces:
  - `KIP_COLOUR_NAMES: readonly string[]`
  - `kipColourOf(value: string | null | undefined): string`
  - `PersonDTO.kipColour: string`
  - `GET /me/buddies/me` gains `kipColour`
  - `PUT /me/kip-colour {colour}` → `{kipColour}`, or 400 `{error:'invalid_colour'}`
  - Social home `camp.faceColours: string[]`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/kip/colour.test.ts`:

```ts
import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { kipColourOf, KIP_COLOUR_NAMES } from '../../src/kip/colours';
import { api, buddyUser, pairUp } from '../buddies/helpers';

jest.mock('../../src/health/client');

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});

it('lists the 10 v1 colours, coral first, and reads anything else as coral', () => {
  expect(KIP_COLOUR_NAMES).toEqual(['coral', 'cobalt', 'ink', 'lemon', 'lilac', 'lime', 'mint', 'sky', 'slate', 'snow']);
  expect(kipColourOf('mint')).toBe('mint');
  expect(kipColourOf('purple')).toBe('coral');
  expect(kipColourOf(null)).toBe('coral');
  expect(kipColourOf(undefined)).toBe('coral');
});

it('a new user is coral, and GET /me/buddies/me says so', async () => {
  const user = await buddyUser();
  const res = await (await api()).get('/me/buddies/me').set(await authHeaderFor(user.id));
  expect(res.status).toBe(200);
  expect(res.body.kipColour).toBe('coral');
});

it('PUT /me/kip-colour saves a palette colour and the identity read returns it', async () => {
  const user = await buddyUser();
  const headers = await authHeaderFor(user.id);
  const put = await (await api()).put('/me/kip-colour').set(headers).send({ colour: 'cobalt' });
  expect([put.status, put.body]).toEqual([200, { kipColour: 'cobalt' }]);
  const me = await (await api()).get('/me/buddies/me').set(headers);
  expect(me.body.kipColour).toBe('cobalt');
});

it('PUT /me/kip-colour rejects a name outside the palette and leaves the colour alone', async () => {
  const user = await buddyUser();
  const headers = await authHeaderFor(user.id);
  for (const colour of ['purple', '#FB7185', '', 3, null]) {
    const res = await (await api()).put('/me/kip-colour').set(headers).send({ colour });
    expect([res.status, res.body]).toEqual([400, { error: 'invalid_colour' }]);
  }
  expect((await prisma.user.findUnique({ where: { id: user.id } }))!.kipColour).toBe('coral');
});

it('PUT /me/kip-colour needs a session', async () => {
  const res = await (await api()).put('/me/kip-colour').send({ colour: 'mint' });
  expect(res.status).toBe(401);
});

it("a buddy's row and an incoming request carry the person's colour", async () => {
  const me = await buddyUser();
  const buddy = await buddyUser();
  await prisma.user.update({ where: { id: buddy.id }, data: { kipColour: 'lime' } });
  await pairUp(me.id, buddy.id);
  const list = await (await api()).get('/me/buddies').set(await authHeaderFor(me.id));
  expect(list.body.buddies[0]).toMatchObject({ id: buddy.id, kipColour: 'lime' });

  const stranger = await buddyUser();
  await prisma.user.update({ where: { id: stranger.id }, data: { kipColour: 'snow' } });
  await (await api()).post('/me/buddies/requests').set(await authHeaderFor(stranger.id)).send({ handle: me.handle });
  const requests = await (await api()).get('/me/buddies/requests').set(await authHeaderFor(me.id));
  expect(requests.body.incoming[0].from).toMatchObject({ id: stranger.id, kipColour: 'snow' });
});

it('a stored value outside the palette reads back as coral', async () => {
  const me = await buddyUser();
  const buddy = await buddyUser();
  await prisma.user.update({ where: { id: buddy.id }, data: { kipColour: 'teal' } });
  await pairUp(me.id, buddy.id);
  const list = await (await api()).get('/me/buddies').set(await authHeaderFor(me.id));
  expect(list.body.buddies[0].kipColour).toBe('coral');
});
```

In `backend/tests/social/home.test.ts`:
- Line 28's expectation: after `faces: [res.body.stories[0].author.coachId],` add
  `faceColours: [res.body.stories[0].author.kipColour],`.
- Line 92's `camp: { checkedIn: 0, members: 1, faces: [] }` becomes
  `camp: { checkedIn: 0, members: 1, faces: [], faceColours: [] }`.

In `backend/tests/social/homeCamp.test.ts`:
- Line 30: add `faceColours: ['coral'],` after `faces: [expect.any(String)],`.
- Line 53: add `faceColours: [],` after `faces: [],`.

- [ ] **Step 2: Run them to make sure they fail**

Run: `<backend test command> tests/kip/colour.test.ts tests/social/home.test.ts tests/social/homeCamp.test.ts`.

Expected: FAIL. The module `../../src/kip/colours` is missing, and `faceColours` is undefined.

- [ ] **Step 3: Schema and migration**

In `backend/prisma/schema.prisma`, model `User`, on the line after `coachPersonaId String?` (about line 92), add:

```prisma
  /// The KIP mascot's colour, by name (backend/src/kip/colours.ts); buddies see it.
  kipColour               String              @default("coral")
```

Create `backend/prisma/migrations/20261013170000_kip_colour/migration.sql`:

```sql
-- KIP colour (spec 2026-10-13): each user's KIP colour by name; existing users are coral.
ALTER TABLE "User" ADD COLUMN "kipColour" TEXT NOT NULL DEFAULT 'coral';
```

Run: `npx prisma generate`.

- [ ] **Step 4: The colour list**

Create `backend/src/kip/colours.ts`:

```ts
// The KIP v1 colours (owner, 2026-10-10), by name; the app holds the hex values (mobile src/lib/kip/kipArt.ts).

export const KIP_COLOUR_NAMES = ['coral', 'cobalt', 'ink', 'lemon', 'lilac', 'lime', 'mint', 'sky', 'slate', 'snow'] as const;
export type KipColourName = (typeof KIP_COLOUR_NAMES)[number];
export const DEFAULT_KIP_COLOUR: KipColourName = 'coral';

export function isKipColour(value: unknown): value is KipColourName {
  return typeof value === 'string' && (KIP_COLOUR_NAMES as readonly string[]).includes(value);
}

/** A stored or sent name, or coral for anything outside the list. */
export function kipColourOf(value: string | null | undefined): KipColourName {
  return isKipColour(value) ? value : DEFAULT_KIP_COLOUR;
}
```

- [ ] **Step 5: The route**

Create `backend/src/kip/routes.ts`:

```ts
// PUT /me/kip-colour (spec 2026-10-13 KIP colour §2). Logs nothing about the user.

import { Router } from 'express';
import { requireAuth, type AuthedRequest } from '../auth/middleware';
import { prisma } from '../db/client';
import { isKipColour } from './colours';

export const kipRouter = Router();

kipRouter.put('/me/kip-colour', requireAuth, async (req: AuthedRequest, res) => {
  const colour: unknown = req.body?.colour;
  if (!isKipColour(colour)) {
    res.status(400).json({ error: 'invalid_colour' });
    return;
  }
  await prisma.user.update({ where: { id: req.userId! }, data: { kipColour: colour } });
  res.set('Cache-Control', 'private, no-store');
  res.json({ kipColour: colour });
});
```

In `backend/src/app.ts`:
- Add `import { kipRouter } from './kip/routes';` after the `chatsRouter` import.
- Add `app.use(kipRouter);` after `app.use(chatsRouter);`.

- [ ] **Step 6: Person, identity and camp faces**

Replace the body of `backend/src/buddies/people.ts` with:

```ts
// How another person appears to a buddy: display name, handle, chosen coach and KIP colour. Never their email.

import { resolvePersona } from '../coach/personas';
import { kipColourOf, type KipColourName } from '../kip/colours';

export const PERSON_SELECT = { id: true, handle: true, displayName: true, coachPersonaId: true, kipColour: true } as const;

export interface PersonDTO {
  id: string;
  handle: string;
  displayName: string;
  /** A character id (mobile src/components/characters/types.ts). */
  coachId: string;
  kipColour: KipColourName;
}

export function toPerson(u: { id: string; handle: string | null; displayName: string | null; coachPersonaId: string | null; kipColour: string | null }): PersonDTO {
  return {
    id: u.id,
    handle: u.handle ?? '',
    displayName: u.displayName ?? u.handle ?? '',
    coachId: resolvePersona(u.coachPersonaId).id,
    kipColour: kipColourOf(u.kipColour),
  };
}
```

In `backend/src/buddies/handles.ts`, `getIdentity`:
- Add `kipColour: true` to the `select`.
- Return `kipColour: kipColourOf(user.kipColour)`, importing `kipColourOf` from `'../kip/colours'`.
- Add `kipColour: KipColourName;` to the `BuddyIdentity` interface in the same file.

In `backend/src/social/stories.ts`:
- Add `checkedInKipColours: string[]` to `StoryRings`.
- Change `checkIns` to `Array<{ coachId: string; kipColour: string; at: string }>`.
- Push `{ coachId: b.person.coachId, kipColour: b.person.kipColour, at: checkIn.at }`.
- Return:

  ```ts
  const faces = checkIns.slice(0, MAX_CAMP_FACES);
  return { rings, checkedInBuddies: checkIns.length, viewerCheckedIn, checkedInCoachIds: faces.map((c) => c.coachId), checkedInKipColours: faces.map((c) => c.kipColour) };
  ```

In `backend/src/social/home.ts`:
- Add `faceColours: string[]` to the `camp` type, after `faces: string[]`.
- Set `faceColours: rings.checkedInKipColours,` after `faces: rings.checkedInCoachIds,`.

- [ ] **Step 7: Run the tests and typecheck**

Run: `<backend test command> tests/kip/colour.test.ts tests/social/home.test.ts tests/social/homeCamp.test.ts tests/buddies`.

Expected: PASS. If a `tests/buddies` or `tests/chats` assertion uses `toEqual` on a whole person, add
`kipColour: 'coral'` to its expected object.

Run `tests/chats tests/social` one after the other in the same way. Then run `node node_modules/.bin/tsc --noEmit -p .`
and expect 0 errors. Any `toPerson` caller whose select lacks `kipColour` is a type error: add `kipColour: true` to
that select.

- [ ] **Step 8: Commit**

```bash
git add backend/prisma backend/src/kip backend/src/buddies/people.ts backend/src/buddies/handles.ts backend/src/social/stories.ts backend/src/social/home.ts backend/src/app.ts backend/tests
git commit -m "feat(backend): KIP colour on the account, shared with buddies"
```

---

### Task 2: Mobile: the colour type, API and your colour's store

**Files:**
- Create: `mobile/src/lib/kip/kipColour.ts`
- Create: `mobile/src/api/kip.ts`
- Create: `mobile/src/lib/kip/myKipColour.ts`
- Create: `mobile/src/components/kip/MyKipColourScope.tsx`
- Modify: `mobile/src/api/buddies.ts` (`Person`, `BuddyIdentity`)
- Modify: `mobile/src/api/social.ts` (about line 68, `camp`)
- Modify: `mobile/src/navigation/RootNavigator.tsx` (about line 307, beside `<BuddiesStoreScope />`)
- Test: `mobile/__tests__/lib/myKipColour.test.tsx` (new)

**Interfaces:**
- Consumes: `KIP_COLOURS`, `KipColour` and `DEFAULT_KIP_COLOUR` from `src/lib/kip/kipArt.ts`.
- Produces:
  - `kipColourOf(v: unknown): KipColour`
  - `KIP_COLOUR_ORDER: KipColour[]`
  - `kipColourName(c: KipColour): string`, e.g. `'Coral'`
  - `saveKipColour(c: KipColour): Promise<{ kipColour: string }>`
  - `useMyKipColour(): KipColour`, `getMyKipColour()`, `loadMyKipColour()`, `setMyKipColour(c)` and `resetMyKipColour()`
  - `<MyKipColourScope />`
  - `Person.kipColour?: string`, `BuddyIdentity.kipColour?: string` and `camp.faceColours?: string[]`

- [ ] **Step 1: Write the failing test**

Create `mobile/__tests__/lib/myKipColour.test.tsx`:

```tsx
import { act, renderHook } from '@testing-library/react-native';
import { fetchIdentity } from '../../src/api/buddies';
import { kipColourName, kipColourOf, KIP_COLOUR_ORDER } from '../../src/lib/kip/kipColour';
import { getMyKipColour, loadMyKipColour, resetMyKipColour, setMyKipColour, useMyKipColour } from '../../src/lib/kip/myKipColour';

jest.mock('../../src/api/buddies', () => ({ fetchIdentity: jest.fn() }));
const identity = fetchIdentity as jest.Mock;

beforeEach(() => {
  identity.mockReset();
  resetMyKipColour();
});

it('reads a missing or unknown name as coral, and names colours for people', () => {
  expect(kipColourOf('mint')).toBe('mint');
  expect(kipColourOf('teal')).toBe('coral');
  expect(kipColourOf(undefined)).toBe('coral');
  expect(KIP_COLOUR_ORDER).toEqual(['coral', 'cobalt', 'ink', 'lemon', 'lilac', 'lime', 'mint', 'sky', 'slate', 'snow']);
  expect(kipColourName('sky')).toBe('Sky');
});

it('is coral until the identity read lands, then the saved colour', async () => {
  identity.mockResolvedValue({ kipColour: 'lilac' });
  const { result } = renderHook(() => useMyKipColour());
  expect(result.current).toBe('coral');
  await act(async () => {
    await loadMyKipColour();
  });
  expect(result.current).toBe('lilac');
});

it('stays coral when the read fails or an older server leaves the field out', async () => {
  identity.mockRejectedValueOnce(new Error('offline'));
  await loadMyKipColour();
  expect(getMyKipColour()).toBe('coral');
  identity.mockResolvedValueOnce({ handle: 'sam' });
  await loadMyKipColour();
  expect(getMyKipColour()).toBe('coral');
});

it('a save updates every reader, and a reset (sign-out) forgets it', async () => {
  const { result } = renderHook(() => useMyKipColour());
  act(() => setMyKipColour('ink'));
  expect(result.current).toBe('ink');
  act(() => resetMyKipColour());
  expect(result.current).toBe('coral');
});

it('a load that started before a reset never lands after it', async () => {
  let finish!: (v: unknown) => void;
  identity.mockReturnValue(new Promise((r) => { finish = r; }));
  const pending = loadMyKipColour();
  resetMyKipColour();
  finish({ kipColour: 'mint' });
  await pending;
  expect(getMyKipColour()).toBe('coral');
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node node_modules/.bin/jest --forceExit --no-watchman __tests__/lib/myKipColour.test.tsx`.

Expected: FAIL, because the modules are not found.

- [ ] **Step 3: Implement**

Create `mobile/src/lib/kip/kipColour.ts`:

```ts
// KIP colours by name (spec 2026-10-13 KIP colour §1): the server sends names, never hex.
import { DEFAULT_KIP_COLOUR, KIP_COLOURS, type KipColour } from './kipArt';

export const KIP_COLOUR_ORDER = Object.keys(KIP_COLOURS) as KipColour[];

/** A name from the server, or coral for a missing or unknown one (an older server, a newer colour). */
export function kipColourOf(value: unknown): KipColour {
  return typeof value === 'string' && value in KIP_COLOURS ? (value as KipColour) : DEFAULT_KIP_COLOUR;
}

/** "Coral", "Sky": the name people read. */
export function kipColourName(colour: KipColour): string {
  return colour.charAt(0).toUpperCase() + colour.slice(1);
}
```

Create `mobile/src/api/kip.ts`:

```ts
import { apiFetch } from './client';
import type { KipColour } from '../lib/kip/kipArt';

export const saveKipColour = (colour: KipColour) =>
  apiFetch<{ kipColour: string }>('/me/kip-colour', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ colour }) });
```

Before writing this, check how `send('PUT', patch)` is defined in `src/api/buddies.ts`. If it is exported (or
trivially exportable), use it instead, as `apiFetch(..., send('PUT', { colour }))`, so the request shape matches the
other routes.

Create `mobile/src/lib/kip/myKipColour.ts`:

```ts
import { useSyncExternalStore } from 'react';
import { fetchIdentity } from '../../api/buddies';
import { DEFAULT_KIP_COLOUR, type KipColour } from './kipArt';
import { kipColourOf } from './kipColour';

// Your KIP's colour (spec 2026-10-13 KIP colour §3): loaded once per sign-in by MyKipColourScope, coral until
// then or when the read fails, updated by a save, and forgotten on sign-out so the next account starts fresh.

let colour: KipColour = DEFAULT_KIP_COLOUR;
let epoch = 0;
const listeners = new Set<() => void>();

function publish(next: KipColour): void {
  colour = next;
  listeners.forEach((l) => l());
}

export function getMyKipColour(): KipColour {
  return colour;
}

export async function loadMyKipColour(): Promise<void> {
  const at = epoch;
  try {
    const identity = await fetchIdentity();
    if (at === epoch) publish(kipColourOf(identity?.kipColour));
  } catch {
    // Keep what is shown; the next sign-in or save tries again.
  }
}

export function setMyKipColour(next: KipColour): void {
  publish(next);
}

export function resetMyKipColour(): void {
  epoch++;
  publish(DEFAULT_KIP_COLOUR);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMyKipColour(): KipColour {
  return useSyncExternalStore(subscribe, getMyKipColour, getMyKipColour);
}
```

Create `mobile/src/components/kip/MyKipColourScope.tsx`:

```tsx
import { useEffect } from 'react';
import { loadMyKipColour, resetMyKipColour } from '../../lib/kip/myKipColour';

// Mounted once inside the signed-in navigator: loads your KIP colour; signing out unmounts it and forgets it.
export function MyKipColourScope() {
  useEffect(() => {
    void loadMyKipColour();
    return () => resetMyKipColour();
  }, []);
  return null;
}
```

In `mobile/src/navigation/RootNavigator.tsx`:
- Import `MyKipColourScope` from `'../components/kip/MyKipColourScope'`.
- Render `<MyKipColourScope />` on the line after `<BuddiesStoreScope />`.

In `mobile/src/api/buddies.ts`:
- `Person` becomes `{ id: string; handle: string; displayName: string; coachId: string; kipColour?: string }`.
- Add `kipColour?: string;` to `BuddyIdentity`, under the "GET only" comment.

In `mobile/src/api/social.ts`:
- Line 68's `camp` gains `faceColours?: string[];` after `faces: string[];`.
- Extend the doc comment above it with: "`faceColours`: each face's KIP colour name, same order (older servers omit it)."

- [ ] **Step 4: Run the test and typecheck**

Run: `node node_modules/.bin/jest --forceExit --no-watchman __tests__/lib/myKipColour.test.tsx __tests__/navigation`.

Expected: PASS. The typecheck count must stay 10.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/kip mobile/src/api/kip.ts mobile/src/api/buddies.ts mobile/src/api/social.ts mobile/src/components/kip/MyKipColourScope.tsx mobile/src/navigation/RootNavigator.tsx mobile/__tests__/lib/myKipColour.test.tsx
git commit -m "feat(mobile): your KIP colour, loaded per sign-in and cleared on sign-out"
```

---

### Task 3: `PersonKip`, the one way to draw a person

**Files:**
- Create: `mobile/src/components/kip/PersonKip.tsx`
- Modify: `mobile/src/lib/kip/kipArt.ts` (add `kipBounds`)
- Test: `mobile/__tests__/components/PersonKip.test.tsx` (new)
- Test: `mobile/__tests__/lib/kipArt.test.ts` (add `kipBounds` cases)

**Interfaces:**
- Consumes:
  - `kipArt`, `kipGrid`, `KipColour`, `KipPose` and `KipMood` from `kipArt.ts`;
  - `kipColourOf` from Task 2.
- Produces:
  - `kipBounds(variant: KipVariant): { x: number; y: number; w: number; h: number }`
  - `type PersonState = 'good' | 'ok' | 'low' | 'none' | 'asleep'`
  - `PERSON_POSE: Record<PersonState, { pose: KipPose; mood: KipMood }>`
  - `<PersonKip colour?: string | KipColour; state?: PersonState; size: number; testID?: string />`
  - `personStateOf(mood: 'good' | 'ok' | 'low' | 'none' | undefined, asleep?: boolean): PersonState`

- [ ] **Step 1: Write the failing tests**

Append to `mobile/__tests__/lib/kipArt.test.ts`:

```ts
import { kipBounds } from '../../src/lib/kip/kipArt';

describe('kipBounds', () => {
  it('is the box of painted cells: rest is 10 x 10 with its shadow, from column 3, row 6', () => {
    expect(kipBounds({})).toEqual({ x: 3, y: 6, w: 10, h: 10 });
  });
  it('grows with arms (cheer) and held items (coffee)', () => {
    const cheer = kipBounds({ pose: 'cheer', mood: 'proud' });
    expect(cheer.x).toBeLessThanOrEqual(2);
    expect(cheer.x + cheer.w).toBeGreaterThanOrEqual(14);
    expect(kipBounds({ pose: 'coffee', mood: 'sleepy' }).x + kipBounds({ pose: 'coffee', mood: 'sleepy' }).w).toBe(16);
  });
});
```

Create `mobile/__tests__/components/PersonKip.test.tsx`:

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import Svg, { Rect } from 'react-native-svg';
import { PersonKip, PERSON_POSE, personStateOf } from '../../src/components/kip/PersonKip';
import { KIP_COLOURS, kipArt } from '../../src/lib/kip/kipArt';

describe('PersonKip', () => {
  it('maps every state to its pose and mood', () => {
    expect(PERSON_POSE).toEqual({
      good: { pose: 'cheer', mood: 'proud' },
      ok: { pose: 'wave', mood: 'idle' },
      low: { pose: 'rest', mood: 'determined' },
      none: { pose: 'rest', mood: 'idle' },
      asleep: { pose: 'rest', mood: 'sleepy' },
    });
    expect(personStateOf('good')).toBe('good');
    expect(personStateOf('low', true)).toBe('asleep');
    expect(personStateOf(undefined)).toBe('none');
  });

  it("draws the person's colour, and coral for an unknown name", () => {
    const mint = render(<PersonKip colour="mint" size={48} />);
    expect(mint.UNSAFE_getAllByType(Rect).some((r) => r.props.fill === KIP_COLOURS.mint)).toBe(true);
    mint.unmount();
    const odd = render(<PersonKip colour="teal" size={48} />);
    expect(odd.UNSAFE_getAllByType(Rect).some((r) => r.props.fill === KIP_COLOURS.coral)).toBe(true);
  });

  it('draws the state: asleep has fewer body rows than rest (squashed)', () => {
    const rest = kipArt({ pose: 'rest', mood: 'idle' });
    const { UNSAFE_getAllByType } = render(<PersonKip state="asleep" size={48} />);
    expect(UNSAFE_getAllByType(Rect)).toHaveLength(kipArt({ pose: 'rest', mood: 'sleepy' }).length);
    expect(kipArt({ pose: 'rest', mood: 'sleepy' })).not.toEqual(rest);
  });

  it.each([
    [26, 2, 20],
    [28, 2, 20],
    [32, 3, 30],
    [96, 9, 90],
  ])('crops to the body so a %ipt slot draws at %i pt per cell (%i pt), centred', (size, scale, drawn) => {
    const { getByTestId, UNSAFE_getByType } = render(<PersonKip size={size} testID="p" />);
    const box = getByTestId('p', { includeHiddenElements: true });
    expect(box.props.style).toMatchObject({ width: size, height: size, alignItems: 'center', justifyContent: 'center' });
    expect(UNSAFE_getByType(Svg).props).toMatchObject({ width: drawn, height: drawn, viewBox: '3 6 10 10' });
    expect(drawn / 10).toBe(scale);
  });

  it('is decorative: hidden from screen readers', () => {
    const { getByTestId } = render(<PersonKip size={32} testID="p" />);
    const box = getByTestId('p', { includeHiddenElements: true });
    expect(box.props.accessible).toBe(false);
    expect(box.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(box.props.accessibilityElementsHidden).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `node node_modules/.bin/jest --forceExit --no-watchman __tests__/components/PersonKip.test.tsx __tests__/lib/kipArt.test.ts`.

Expected: FAIL, because `kipBounds` and `PersonKip` don't exist yet.

- [ ] **Step 3: Implement**

Append to `mobile/src/lib/kip/kipArt.ts`:

```ts
/** The smallest box holding every painted cell of this variant, in grid cells. */
export function kipBounds(variant: KipVariant): { x: number; y: number; w: number; h: number } {
  let minX = KIP_GRID, minY = KIP_GRID, maxX = -1, maxY = -1;
  kipGrid(variant).forEach((row, y) => row.forEach((fill, x) => {
    if (!fill) return;
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }));
  return maxX < 0 ? { x: 0, y: 0, w: KIP_GRID, h: KIP_GRID } : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
```

Create `mobile/src/components/kip/PersonKip.tsx`:

```tsx
import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { kipArt, kipBounds, type KipMood, type KipPose } from '../../lib/kip/kipArt';
import { kipColourOf } from '../../lib/kip/kipColour';

// A person as their KIP (spec 2026-10-13 KIP colour §3): the one way to draw a buddy or you. Cropped to the cells
// this variant paints, so small slots get whole points per cell and the body sits centred, not low.

export type PersonState = 'good' | 'ok' | 'low' | 'none' | 'asleep';

export const PERSON_POSE: Record<PersonState, { pose: KipPose; mood: KipMood }> = {
  good: { pose: 'cheer', mood: 'proud' },
  ok: { pose: 'wave', mood: 'idle' },
  low: { pose: 'rest', mood: 'determined' },
  none: { pose: 'rest', mood: 'idle' },
  asleep: { pose: 'rest', mood: 'sleepy' },
};

export function personStateOf(mood: 'good' | 'ok' | 'low' | 'none' | undefined, asleep = false): PersonState {
  if (asleep) return 'asleep';
  return mood ?? 'none';
}

export function PersonKip({ colour, state = 'none', size, testID }: { colour?: string; state?: PersonState; size: number; testID?: string }) {
  const variant = useMemo(() => ({ colour: kipColourOf(colour), ...PERSON_POSE[state] }), [colour, state]);
  const art = useMemo(() => kipArt(variant), [variant]);
  const box = useMemo(() => kipBounds(variant), [variant]);
  const scale = Math.max(1, Math.floor(size / Math.max(box.w, box.h)));
  return (
    <View
      testID={testID}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={box.w * scale} height={box.h * scale} viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}>
        {art.map((p, i) => (
          <Rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill={p.fill} />
        ))}
      </Svg>
    </View>
  );
}
```

The test table assumes a square box at rest (10 × 10). For a non-square variant the `Svg` is `w*scale` by
`h*scale`; that is intended.

- [ ] **Step 4: Run the tests and typecheck**

Run: `node node_modules/.bin/jest --forceExit --no-watchman __tests__/components/PersonKip.test.tsx __tests__/lib/kipArt.test.ts __tests__/components/Kip.test.tsx`.

Expected: PASS, with the typecheck at 10.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/kip/kipArt.ts mobile/src/components/kip/PersonKip.tsx mobile/__tests__/components/PersonKip.test.tsx mobile/__tests__/lib/kipArt.test.ts
git commit -m "feat(mobile): PersonKip draws a person as their KIP, cropped to stay crisp"
```

---

### Task 4: The colour picker in Profile

**Files:**
- Create: `mobile/src/components/profile/KipColourSection.tsx`
- Modify: `mobile/src/lib/profileCopy.ts` (`ProfileCategory`, `categories`, `status`, a new `kipColour` block)
- Modify: `mobile/src/lib/profileArt.ts` (`CATEGORY_ICONS.kipColour`)
- Modify: `mobile/src/lib/profileHub.ts` (`HubInput.kipColour`, the first card)
- Modify: `mobile/src/screens/SettingsScreen.tsx` (pass `kipColour: useMyKipColour()` into `categoryCards`)
- Modify: `mobile/src/screens/ProfileSectionScreen.tsx` (the `kipColour` section)
- Test: `mobile/__tests__/components/KipColourSection.test.tsx` (new)
- Test: `mobile/__tests__/lib/profileHub.test.ts` (the first card)

**Interfaces:**
- Consumes:
  - `useMyKipColour` and `setMyKipColour` (Task 2);
  - `saveKipColour` (Task 2);
  - `KIP_COLOUR_ORDER` and `kipColourName` (Task 2);
  - `Kip` and `KIP_COLOURS`.
- Produces:
  - `ProfileCategory` gains `'kipColour'`;
  - `HubInput.kipColour: KipColour`;
  - `<KipColourSection />`.

- [ ] **Step 1: Write the failing tests**

Create `mobile/__tests__/components/KipColourSection.test.tsx`:

```tsx
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { KipColourSection } from '../../src/components/profile/KipColourSection';
import { saveKipColour } from '../../src/api/kip';
import { getMyKipColour, resetMyKipColour, setMyKipColour } from '../../src/lib/kip/myKipColour';

jest.mock('../../src/api/kip', () => ({ saveKipColour: jest.fn() }));
const save = saveKipColour as jest.Mock;

beforeEach(() => {
  save.mockReset();
  resetMyKipColour();
});

it('shows your colour in the preview and as the checked radio among 10', () => {
  act(() => setMyKipColour('lilac'));
  render(<KipColourSection />);
  expect(screen.getByText('Lilac · #C4B5FD')).toBeTruthy();
  expect(screen.getByLabelText('Your KIP in Lilac')).toBeTruthy();
  const group = screen.getByTestId('kip-colour-swatches');
  expect(group.props.accessibilityRole).toBe('radiogroup');
  expect(group.props.accessibilityLabel).toBe('KIP colour');
  const radios = screen.getAllByRole('radio');
  expect(radios).toHaveLength(10);
  expect(screen.getByTestId('kip-swatch-lilac').props.accessibilityState).toMatchObject({ checked: true });
  expect(screen.getByTestId('kip-swatch-coral').props.accessibilityState).toMatchObject({ checked: false });
  expect(screen.getByText('Buddies see this colour')).toBeTruthy();
});

it('picking changes only the preview until Save, which is off until the pick differs', () => {
  render(<KipColourSection />);
  expect(screen.getByTestId('kip-colour-save').props.accessibilityState).toMatchObject({ disabled: true });
  fireEvent.press(screen.getByTestId('kip-swatch-mint'));
  expect(screen.getByText('Mint · #6EE7B7')).toBeTruthy();
  expect(getMyKipColour()).toBe('coral');
  expect(screen.getByTestId('kip-colour-save').props.accessibilityState).toMatchObject({ disabled: false });
});

it('Save stores the colour for every screen', async () => {
  save.mockResolvedValue({ kipColour: 'mint' });
  render(<KipColourSection />);
  fireEvent.press(screen.getByTestId('kip-swatch-mint'));
  fireEvent.press(screen.getByTestId('kip-colour-save'));
  await waitFor(() => expect(getMyKipColour()).toBe('mint'));
  expect(save).toHaveBeenCalledWith('mint');
  expect(screen.getByTestId('kip-colour-save').props.accessibilityState).toMatchObject({ disabled: true });
});

it('a failed save keeps the old colour and offers Try again', async () => {
  save.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ kipColour: 'ink' });
  render(<KipColourSection />);
  fireEvent.press(screen.getByTestId('kip-swatch-ink'));
  fireEvent.press(screen.getByTestId('kip-colour-save'));
  expect(await screen.findByText("Your colour couldn't be saved.")).toBeTruthy();
  expect(getMyKipColour()).toBe('coral');
  fireEvent.press(screen.getByText('Try again'));
  await waitFor(() => expect(getMyKipColour()).toBe('ink'));
});

it('Reset to coral only changes the selection', () => {
  act(() => setMyKipColour('slate'));
  render(<KipColourSection />);
  fireEvent.press(screen.getByTestId('kip-colour-reset'));
  expect(screen.getByTestId('kip-swatch-coral').props.accessibilityState).toMatchObject({ checked: true });
  expect(getMyKipColour()).toBe('slate');
  expect(save).not.toHaveBeenCalled();
});
```

In `mobile/__tests__/lib/profileHub.test.ts`:
- Add `kipColour: 'coral'` to every `HubInput` object the file builds (find its shared base input).
- Add:

  ```ts
  it('puts the KIP colour card first, with the colour name', () => {
    const cards = categoryCards({ ...BASE_INPUT, kipColour: 'sky' });
    expect(cards[0]).toEqual({ category: 'kipColour', status: 'Sky' });
  });
  ```

  `BASE_INPUT` stands for the file's existing base object; use its real name.
- Update any expectation that lists the card order so it starts with `'kipColour'`.

- [ ] **Step 2: Run them to make sure they fail**

Run: `node node_modules/.bin/jest --forceExit --no-watchman __tests__/components/KipColourSection.test.tsx __tests__/lib/profileHub.test.ts`.

Expected: FAIL.

- [ ] **Step 3: Copy and the icon**

In `mobile/src/lib/profileCopy.ts`:
- `ProfileCategory` becomes `'kipColour' | 'health' | 'timezone' | 'notifications' | 'buddies' | 'chats' | 'coach' | 'aiCoach' | 'signIn'`.
- In `categories`, add `kipColour: 'KIP colour',` first.
- In `status`, add `kipColour: (name: string) => name,`.
- Add this block after `account`:

  ```ts
  kipColour: {
    yourKip: 'Your KIP',
    picked: (name: string, hex: string) => `${name} · ${hex}`,
    previewLabel: (name: string) => `Your KIP in ${name}`,
    colour: 'Colour',
    buddiesSee: 'Buddies see this colour',
    groupLabel: 'KIP colour',
    reset: 'Reset to coral',
    save: 'Save colour',
    failed: "Your colour couldn't be saved.",
    retry: 'Try again',
  },
  ```

In `mobile/src/lib/profileArt.ts`, add a pixel palette as the first entry of `CATEGORY_ICONS`:

```ts
  kipColour: rects([[2, 0, 6, 1, '#E5E7EB'], [1, 1, 8, 1, '#E5E7EB'], [0, 2, 10, 6, '#E5E7EB'], [1, 8, 4, 1, '#E5E7EB'], [6, 7, 3, 2, '#0A0B0E'], [2, 2, 2, 2, '#FB7185'], [5, 2, 2, 2, '#3B82F6'], [7, 4, 2, 2, '#FDE047'], [2, 5, 2, 2, '#6EE7B7']]),
```

- [ ] **Step 4: The hub card**

In `mobile/src/lib/profileHub.ts`:
- Import `type KipColour` from `'./kip/kipArt'` and `kipColourName` from `'./kip/kipColour'`.
- Add `kipColour: KipColour;` to `HubInput`.
- In `categoryCards`, make the first element of `cards`
  `{ category: 'kipColour', status: S.kipColour(kipColourName(i.kipColour)) },`, before `health`.

In `mobile/src/screens/SettingsScreen.tsx`:
- Import `useMyKipColour` from `'../lib/kip/myKipColour'`.
- Call `const kipColour = useMyKipColour();` beside the other hooks.
- Add `kipColour,` to the object passed to `categoryCards(...)`.

- [ ] **Step 5: The section**

Create `mobile/src/components/profile/KipColourSection.tsx`:

```tsx
import React, { useState } from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { saveKipColour } from '../../api/kip';
import { KIP_COLOURS, type KipColour } from '../../lib/kip/kipArt';
import { KIP_COLOUR_ORDER, kipColourName } from '../../lib/kip/kipColour';
import { setMyKipColour, useMyKipColour } from '../../lib/kip/myKipColour';
import { PROFILE_COPY } from '../../lib/profileCopy';
import type { PixelRect } from '../../lib/weatherArt';
import { Kip } from '../kip/Kip';
import { Button } from '../ui/button';
import { SectionLabel } from '../ui/section-label';
import { Text } from '../ui/text';

// The KIP colour page (Picker board, spec 2026-10-13 KIP colour §3): a preview on a small scene, 10 swatches,
// Reset and Save. Nothing changes anywhere until Save succeeds.

const C = PROFILE_COPY.kipColour;
const PREVIEW_W = 119;
const PREVIEW_H = 64;
const PREVIEW_GROUND = 52;
const UNIT = 3;
const HERO_SCALE = 6;

// The board's preview scene: a dithered dawn sky, a sun, and grass.
function previewScene(): PixelRect[] {
  const sky = ['#15233D', '#1A2B49', '#203456', '#273E63'];
  const band = Math.floor(PREVIEW_GROUND / 4);
  const r: PixelRect[] = [];
  sky.forEach((fill, i) => {
    const y = i * band;
    r.push({ x: 0, y, w: PREVIEW_W, h: i === 3 ? PREVIEW_GROUND - y : band, fill });
    if (i > 0) for (let x = i % 2; x < PREVIEW_W; x += 2) r.push({ x, y, w: 1, h: 1, fill: sky[i - 1]! });
  });
  for (const [x, y, w, h, fill] of [[103, 6, 6, 1, '#FDE68A'], [101, 7, 10, 1, '#FCD34D'], [100, 8, 12, 7, '#FBBF24'], [101, 15, 10, 1, '#F59E0B'], [103, 16, 6, 1, '#F59E0B']] as const) {
    r.push({ x, y, w, h, fill });
  }
  const g = ['#4A8A5C', '#3A7049', '#2D5A3A'];
  r.push({ x: 0, y: PREVIEW_GROUND, w: PREVIEW_W, h: 1, fill: g[0]! }, { x: 0, y: PREVIEW_GROUND + 1, w: PREVIEW_W, h: 2, fill: g[1]! }, { x: 0, y: PREVIEW_GROUND + 3, w: PREVIEW_W, h: PREVIEW_H - PREVIEW_GROUND - 3, fill: g[2]! });
  for (let x = 4; x < PREVIEW_W; x += 13) r.push({ x, y: PREVIEW_GROUND - 1, w: 1, h: 1, fill: g[0]! }, { x: x + 2, y: PREVIEW_GROUND - 1, w: 1, h: 1, fill: g[0]! });
  return r;
}
const SCENE = previewScene();

export function KipColourSection() {
  const saved = useMyKipColour();
  const [picked, setPicked] = useState<KipColour>(saved);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const name = kipColourName(picked);

  async function save() {
    setBusy(true);
    setFailed(false);
    try {
      await saveKipColour(picked);
      setMyKipColour(picked);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View testID="kip-colour-section" className="gap-4">
      <View className="overflow-hidden rounded-card border border-border" style={{ height: PREVIEW_H * UNIT }}>
        <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: 0, top: 0 }}>
          <Svg width={PREVIEW_W * UNIT} height={PREVIEW_H * UNIT} viewBox={`0 0 ${PREVIEW_W} ${PREVIEW_H}`}>
            {SCENE.map((p, i) => <Rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill={p.fill} />)}
          </Svg>
        </View>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={C.previewLabel(name)}
          style={{ position: 'absolute', left: 179 - 8 * HERO_SCALE, top: 156 - 15 * HERO_SCALE }}
        >
          <Kip colour={picked} pose="wave" scale={HERO_SCALE} />
        </View>
        <View className="absolute left-3.5 top-3 gap-0.5">
          <SectionLabel className="text-[#C7D2FE]">{C.yourKip}</SectionLabel>
          <Text className="text-headline font-semibold text-white">{C.picked(name, KIP_COLOURS[picked])}</Text>
        </View>
      </View>

      <View className="gap-2.5">
        <View className="flex-row items-baseline justify-between">
          <SectionLabel>{C.colour}</SectionLabel>
          <Text className="text-fine text-muted-foreground">{C.buddiesSee}</Text>
        </View>
        <View testID="kip-colour-swatches" accessibilityRole="radiogroup" accessibilityLabel={C.groupLabel} className="flex-row flex-wrap justify-between gap-y-2.5">
          {KIP_COLOUR_ORDER.map((c) => {
            const on = c === picked;
            return (
              <View key={c} className="w-[18%] items-center gap-1">
                <Button
                  testID={`kip-swatch-${c}`}
                  accessibilityRole="radio"
                  accessibilityLabel={kipColourName(c)}
                  accessibilityState={{ checked: on }}
                  variant={on ? 'default' : 'outline'}
                  className="h-14 w-full"
                  onPress={() => setPicked(c)}
                >
                  <View style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: KIP_COLOURS[c], borderWidth: 1, borderColor: 'rgba(0,0,0,0.25)' }} />
                </Button>
                <Text className={on ? 'text-fine text-foreground' : 'text-fine text-muted-foreground'}>{kipColourName(c)}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <View className="flex-row gap-2">
        <Button testID="kip-colour-reset" variant="outline" className="flex-1" onPress={() => setPicked('coral')}>
          {C.reset}
        </Button>
        <Button testID="kip-colour-save" className="flex-1" disabled={picked === saved || busy} loading={busy} onPress={save}>
          {C.save}
        </Button>
      </View>
      {failed ? (
        <View testID="kip-colour-error" className="flex-row items-center justify-between gap-3">
          <Text className="text-caption text-destructive">{C.failed}</Text>
          <Button variant="ghost" size="sm" onPress={save}>
            {C.retry}
          </Button>
        </View>
      ) : null}
    </View>
  );
}
```

Check two things before keeping this as written:
- Read `Button`'s props in `src/components/ui/button.tsx`. If it takes a child view as its content in a way other
  than `children`, follow that pattern for the swatch square.
- Read `SectionLabel`. If it doesn't accept `className`, wrap it in a `View` and set the colour on the label's text
  the way other dark-scene labels do (see `Passport.tsx`).

In `mobile/src/screens/ProfileSectionScreen.tsx`:
- Import `KipColourSection` from `'../components/profile/KipColourSection'`.
- Add `{section === 'kipColour' ? <KipColourSection /> : null}` as the first child of the `ScrollView`.

- [ ] **Step 6: Run the tests and typecheck**

Run: `node node_modules/.bin/jest --forceExit --no-watchman __tests__/components/KipColourSection.test.tsx __tests__/lib/profileHub.test.ts __tests__/screens/SettingsScreen.test.tsx __tests__/screens/ProfileHub.test.tsx __tests__/conventions`.

Expected: PASS, with the typecheck at 10. If `ProfileHub.test.tsx` counts the cards or lists them in order, update it
for the new first card.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/components/profile/KipColourSection.tsx mobile/src/lib/profileCopy.ts mobile/src/lib/profileArt.ts mobile/src/lib/profileHub.ts mobile/src/screens/SettingsScreen.tsx mobile/src/screens/ProfileSectionScreen.tsx mobile/__tests__
git commit -m "feat(mobile): KIP colour picker in Profile"
```

---

### Task 5: Your KIP in your colour (passport, Activity header)

**Files:**
- Modify: `mobile/src/components/profile/Passport.tsx:71`
- Modify: `mobile/src/components/activity/ActivityHeader.tsx:35`
- Test: `mobile/__tests__/components/Passport.test.tsx`
- Test: `mobile/__tests__/components/ActivitySections.test.tsx`

**Interfaces:**
- Consumes: `useMyKipColour` and `setMyKipColour` (Task 2), and `KIP_COLOURS`.

- [ ] **Step 1: Write the failing tests**

Append to `mobile/__tests__/components/Passport.test.tsx`. Render the passport the way the file already does, and
reuse its existing render helper:

```tsx
import { act } from '@testing-library/react-native';
import { Rect } from 'react-native-svg';
import { KIP_COLOURS } from '../../src/lib/kip/kipArt';
import { resetMyKipColour, setMyKipColour } from '../../src/lib/kip/myKipColour';

it('draws your KIP in your colour', () => {
  act(() => setMyKipColour('cobalt'));
  const { getByTestId } = renderPassport();
  const kip = getByTestId('passport-kip', { includeHiddenElements: true });
  expect(kip.findAll((n) => n.type === Rect && n.props.fill === KIP_COLOURS.cobalt).length).toBeGreaterThan(0);
  act(() => resetMyKipColour());
});
```

`renderPassport` stands for the file's existing helper; use its real name.

Add the same kind of test to `ActivitySections.test.tsx`, in the `ActivityHeader` describe, for the `activity-kip`
test ID with `'mint'`.

- [ ] **Step 2: Run them to make sure they fail**

Run: `node node_modules/.bin/jest --forceExit --no-watchman __tests__/components/Passport.test.tsx __tests__/components/ActivitySections.test.tsx`.

Expected: FAIL, because both still draw coral.

- [ ] **Step 3: Implement**

In both files:
- Import `useMyKipColour` from the `lib/kip/myKipColour` module (the relative path differs per file).
- Call `const kipColour = useMyKipColour();` at the top of the component.
- Replace `colour="coral"` with `colour={kipColour}`.

- [ ] **Step 4: Run them**

The same command as Step 2. Expected: PASS, with the typecheck at 10.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/profile/Passport.tsx mobile/src/components/activity/ActivityHeader.tsx mobile/__tests__/components/Passport.test.tsx mobile/__tests__/components/ActivitySections.test.tsx
git commit -m "feat(mobile): the passport and Activity header draw your KIP colour"
```

---

### Task 6: Buddies as KIPs in Social and Chats

**Files:**
- Modify: `mobile/src/components/buddies/BuddyListRow.tsx:5-6,18`
- Modify: `mobile/src/screens/BuddyWeekScreen.tsx:9-11,116-117,124,154-161`
- Modify: `mobile/src/components/chats/ChatAvatar.tsx:4-5,17`
- Modify: `mobile/src/components/chats/RequestsList.tsx:9-10,123`
- Modify: `mobile/src/components/social/StoriesRow.tsx:10-11,24`, plus the `story-me` avatar
- Modify: `mobile/src/components/social/SocialStoryFrame.tsx:12-13,18-27`
- Modify: `mobile/src/lib/buddyCopy.ts` (the buddy-week strings, if they are inline in the screen)
- Test: `mobile/__tests__/components/BuddyListRow.test.tsx` (new, small)
- Test: `mobile/__tests__/screens/BuddyWeekScreen.test.tsx`
- Test: `mobile/__tests__/components/StoriesRow.test.tsx`
- Test: `mobile/__tests__/components/SceneButtons.test.tsx`

**Interfaces:**
- Consumes:
  - `PersonKip` and `personStateOf` (Task 3);
  - `useMyKipColour` (Task 2);
  - `Person.kipColour` (Task 2).

- [ ] **Step 1: Write the failing tests**

Create `mobile/__tests__/components/BuddyListRow.test.tsx`. First read `BuddyListRow.tsx` for its props, then render one
row:

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { BuddyListRow } from '../../src/components/buddies/BuddyListRow';
import { PersonKip } from '../../src/components/kip/PersonKip';

const row = { id: 'b1', handle: 'ava', displayName: 'Ava', coachId: 'sol', kipColour: 'lime', mood: 'good' as const, moodLine: 'Feeling great', unseenSticker: false };

it("draws the buddy as their KIP in their colour, cheering on a good day", () => {
  const { UNSAFE_getByType } = render(<BuddyListRow row={row} onPress={() => {}} />);
  expect(UNSAFE_getByType(PersonKip).props).toMatchObject({ colour: 'lime', state: 'good', size: 48 });
});
```

If `BuddyListRow`'s props differ (for example a `buddy` prop rather than `row`), match them.

In `__tests__/screens/BuddyWeekScreen.test.tsx`:
- Give the mocked week's buddy `kipColour: 'sky'`.
- Add:

  ```tsx
  it("shows the buddy's KIP and no coach naming", async () => {
    // render as the file's other tests do
    expect(UNSAFE_getByType(PersonKip).props).toMatchObject({ colour: 'sky', size: 96 });
    expect(screen.queryByText(/Coach:/)).toBeNull();
    expect(screen.getByText('This week')).toBeTruthy();
  });
  ```

- Update any existing expectation of `"…'s week"` or `"Coach: …"` to the new text.
- If a sticker test expects the coach's name in the sent line, it now expects the buddy's display name.

In `__tests__/components/StoriesRow.test.tsx`, add:
- an assertion that a ring's author is drawn as a `PersonKip` with that author's `kipColour`;
- an assertion that `story-me` draws a `PersonKip` whose colour is `getMyKipColour()`. Set it first with
  `setMyKipColour('ink')`, and reset it after.

In `__tests__/components/SceneButtons.test.tsx`, wherever `SocialStoryFrame` renders, add an assertion that a
`PersonKip` with the author's colour is drawn, and that its state is `'asleep'` for a goodnight frame.

- [ ] **Step 2: Run them to make sure they fail**

Run: `node node_modules/.bin/jest --forceExit --no-watchman __tests__/components/BuddyListRow.test.tsx __tests__/screens/BuddyWeekScreen.test.tsx __tests__/components/StoriesRow.test.tsx __tests__/components/SceneButtons.test.tsx`.

Expected: FAIL.

- [ ] **Step 3: Implement the swaps**

In each file, remove the `Character` import and the `characters/types` import if nothing else in the file uses them,
and import `PersonKip` (plus `personStateOf` where needed).

- **`BuddyListRow.tsx:18`:**

  ```tsx
  <PersonKip colour={row.kipColour} state={personStateOf(row.mood)} size={48} />
  ```

- **`BuddyWeekScreen.tsx`:**
  - Line 154 becomes `<PersonKip colour={week.buddy.kipColour} state={personStateOf(week.mood)} size={96} />`.
  - Line 156's `@{week.buddy.handle} · Coach: {coachName}` becomes `@{week.buddy.handle}`.
  - Line 161's `{coachName}'s week` becomes `{BUDDY_WEEK_COPY.thisWeek}`. Add `thisWeek: 'This week'` to the
    screen's copy module (`lib/buddyCopy.ts` if that's where its strings are; otherwise create the key where the
    screen's other strings live).
  - Line 124: pass `week.buddy.displayName` as the third argument to `stickerSentLine`, in place of `coachName`.
  - Delete the now-unused `coachId` and `coachName` constants (lines 116–117) and the `characterInfo` import if it
    becomes unused.

- **`ChatAvatar.tsx:17`:** `<PersonKip colour={person.kipColour} size={Math.round(inner * 0.62)} />`.
- **`RequestsList.tsx:123`:** `<PersonKip colour={item.request.from.kipColour} size={28} />`.
- **`StoriesRow.tsx`:**
  - `Avatar` draws `<PersonKip colour={mine ? myColour : person.kipColour} size={34} />`.
  - Give `Avatar` a `colour` prop. `StoriesRow` passes `useMyKipColour()` for `story-me` and `person.kipColour` for
    each ring.
- **`SocialStoryFrame.tsx`:**
  - Delete the `coachId` and `coach` constants and their comment.
  - Draw:

    ```tsx
    <PersonKip colour={mine ? myColour : author.kipColour} state={frame.kind === 'goodnight' ? 'asleep' : 'none'} size={96} />
    ```

  - `myColour` comes from `useMyKipColour()`, called at the top of the component.

- [ ] **Step 4: Run them**

Same command as Step 2, plus `__tests__/conventions __tests__/screens/SocialScreen*.test.tsx __tests__/screens/Chat*.test.tsx`.

Expected: PASS, with the typecheck at 10.

- [ ] **Step 5: Commit**

```bash
git add mobile/src mobile/__tests__
git commit -m "feat(mobile): buddies appear as their KIPs in Social and Chats"
```

---

### Task 7: The camp and Pair up (lifts the CampScene/CampBanner freeze for the sprite only)

**Files:**
- Modify: `mobile/src/components/social/CampScene.tsx:15-16,204-205`. Only the sprite element and its imports.
- Modify: `mobile/src/components/social/CampBanner.tsx:10-11,32-36`. Only the sprite element, its imports and the
  colour lookup.
- Modify: `mobile/src/components/social/CampNoteCard.tsx:10-11,59,65,85,137`
- Modify: `mobile/src/screens/CampfireScreen.tsx:23-24,339,356`
- Modify: `mobile/src/screens/PairUpScreen.tsx:9,130,133`
- Test: `mobile/__tests__/components/CampBanner.test.tsx`
- Test: `mobile/__tests__/screens/CampfireScreen.test.tsx`
- Test: `mobile/__tests__/screens/PairUpScreen.test.tsx`

**Interfaces:**
- Consumes:
  - `PersonKip` (Task 3);
  - `useMyKipColour` (Task 2);
  - `camp.faceColours` (Task 2).

- [ ] **Step 1: Write the failing tests**

In `__tests__/components/CampBanner.test.tsx`, add:

```tsx
it("draws each face as that buddy's KIP, and coral when an older server sends no colours", () => {
  // render the banner as the file does, with camp.faces = ['sol', 'mira'] and camp.faceColours = ['mint', 'ink']
  const kips = UNSAFE_getAllByType(PersonKip);
  expect(kips.map((k) => k.props.colour)).toEqual(['mint', 'ink']);
  expect(kips[0]!.props.size).toBe(26);
  // re-render without faceColours
  expect(UNSAFE_getAllByType(PersonKip).map((k) => k.props.colour)).toEqual([undefined, undefined]);
});
```

In `__tests__/screens/CampfireScreen.test.tsx`, add:
- Each "Who's here" row (`camp-who-<id>`) draws a `PersonKip` with that member's `person.kipColour`, with state
  `'asleep'` for an asleep member.
- The member who is you draws `getMyKipColour()`.
- The composer's helper text reads "Shows above your KIP until 6 AM or your morning check-in."

In `__tests__/screens/PairUpScreen.test.tsx`, add:
- The hero is a `PersonKip` at size 72 with your colour (`setMyKipColour('lemon')` first).
- The copy reads "Buddies always see your KIP's mood. Your numbers stay private unless you share them in Profile."

- [ ] **Step 2: Run them to make sure they fail**

Run: `node node_modules/.bin/jest --forceExit --no-watchman __tests__/components/CampBanner.test.tsx __tests__/screens/CampfireScreen.test.tsx __tests__/screens/PairUpScreen.test.tsx`.

Expected: FAIL.

- [ ] **Step 3: Implement**

- **`CampScene.tsx` (204–205), inside the existing `<Bob …>`:**
  - Draw:

    ```tsx
    <PersonKip colour={member.mine ? myColour : member.person.kipColour} state={member.asleep ? 'asleep' : 'none'} size={seat.size} />
    ```

  - `myColour` is `useMyKipColour()`, called at the top of the component that renders the seat. If that component is
    memoised or can't take a hook, pass `myColour` down as a prop from `CampScene`'s top level.
  - Swap the imports. Touch nothing else.
- **`CampBanner.tsx` (32–36):**
  - Map with the index, as now.
  - Draw `<PersonKip colour={camp.faceColours?.[index]} size={26} />`.
  - Rename the `coachId` parameter to `_coachId`, or use `(_, index)`.
  - Swap the imports. Touch nothing else.
- **`CampNoteCard.tsx`:**
  - Replace the `coachId: CharacterId` prop with `kipColour: string`.
  - Draw `<PersonKip colour={kipColour} size={28} />`.
  - Change line 137's text to "Shows above your KIP until 6 AM or your morning check-in."
  - Move that string into the camp copy module if the file's other strings live in one.
- **`CampfireScreen.tsx`:**
  - Line 339 passes `kipColour={myColour}`, with `const myColour = useMyKipColour();` at the top of the screen.
  - Line 356 draws:

    ```tsx
    <PersonKip colour={m.mine ? myColour : m.person.kipColour} state={m.asleep ? 'asleep' : 'none'} size={32} />
    ```

  - Remove the unused `Character` and `characters/types` imports.
- **`PairUpScreen.tsx`:**
  - Line 130 draws `<PersonKip colour={useMyKipColour()} size={72} />`. Call the hook at the top of the component
    rather than inline.
  - Line 133's text becomes "Buddies always see your KIP's mood. Your numbers stay private unless you share them in
    Profile."

- [ ] **Step 4: Run them**

Same as Step 2, plus:
- `__tests__/screens/CampfireSceneMotion.test.tsx`
- `__tests__/components/CampSceneClock.test.tsx`
- `__tests__/components/inputs.test.tsx`
- `__tests__/components/SceneButtons.test.tsx`
- `__tests__/conventions`

Expected: PASS, with the typecheck at 10.

- [ ] **Step 5: Full suites, then commit**

Run the full mobile suite: `node node_modules/.bin/jest --forceExit --no-watchman`. Expected: every suite passes.

Run `rg -n "<Character" mobile/src`. The only matches left should be the coach-only files listed in the spec (§3,
"The AI coach keeps its character") and the character system itself.

```bash
git add mobile/src mobile/__tests__
git commit -m "feat(mobile): the camp and Pair up draw people as their KIPs"
```

---

## Self-review

- **Spec coverage:**
  - Backend §2: Task 1.
  - Data and store §3: Task 2.
  - `PersonKip`: Task 3.
  - The picker: Task 4.
  - Your colour: Task 5.
  - The swap table and wording: Tasks 6–7.
  - Tests §5: spread across the tasks.
  - `BuddiesRow` is deliberately not swapped; Home F deletes it.
- **Types:**
  - `Person.kipColour` is `string` on the wire. `PersonKip` takes `colour?: string` and normalises it with
    `kipColourOf`.
  - `KipColour` (the key of `KIP_COLOURS`) is used wherever a value is chosen.
